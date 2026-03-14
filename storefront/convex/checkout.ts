import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireRole } from "./lib/auth";
import {
  STORE_ORIGIN,
  DELIVERY_MAX_MILES,
  SHIPPING_FEE_PER_CAKE_CENTS,
} from "./lib/storeConfig";

async function getDeliveryConfig(ctx: QueryCtx): Promise<{
  deliveryMaxMiles: number;
  shippingFeePerCakeCents: number;
}> {
  const rows = await ctx.db.query("siteSettings").collect();
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  const deliveryMaxMiles =
    map.deliveryMaxMiles != null && map.deliveryMaxMiles !== ""
      ? Math.max(0, Number(map.deliveryMaxMiles) || DELIVERY_MAX_MILES)
      : DELIVERY_MAX_MILES;
  const shippingFeePerCakeCents =
    map.shippingFeePerCakeCents != null && map.shippingFeePerCakeCents !== ""
      ? Math.max(0, Number(map.shippingFeePerCakeCents) || SHIPPING_FEE_PER_CAKE_CENTS)
      : SHIPPING_FEE_PER_CAKE_CENTS;
  return { deliveryMaxMiles, shippingFeePerCakeCents };
}

/** Public query for maps/actions to read delivery config. */
export const getDeliveryConfigQuery = query({
  args: {},
  handler: async (ctx) => getDeliveryConfig(ctx),
});

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const getEligibility = query({
  args: {
    addressId: v.optional(v.id("addresses")),
    cakeCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cakeCount = Math.max(0, args.cakeCount ?? 0);
    const { deliveryMaxMiles, shippingFeePerCakeCents } = await getDeliveryConfig(ctx);

    if (!args.addressId) {
      return {
        delivery: {
          eligible: false,
          feeCents: 0,
          distanceMiles: undefined,
          reason: "No address selected",
        },
        shipping: {
          eligible: true,
          feeCents: cakeCount * shippingFeePerCakeCents,
          reason: null,
        },
      };
    }

    const address = await ctx.db.get(args.addressId);
    if (!address) {
      return {
        delivery: {
          eligible: false,
          feeCents: 0,
          distanceMiles: undefined,
          reason: "Address not found",
        },
        shipping: {
          eligible: true,
          feeCents: cakeCount * shippingFeePerCakeCents,
          reason: null,
        },
      };
    }

    const cached = await ctx.db
      .query("addressCache")
      .withIndex("by_address", (q) => q.eq("addressId", args.addressId!))
      .unique();

    const deliveryTiers = await ctx.db
      .query("deliveryTiers")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();

    // Always compute distance fresh. Cached distance can be stale (e.g. after STORE_ORIGIN change)
    // and causes wrong mileage + auto-switch to shipping + layout jump when selecting saved address.
    const distanceMiles = haversineMiles(
      address.lat,
      address.lng,
      STORE_ORIGIN.lat,
      STORE_ORIGIN.lng
    );

    const hasMatchingTier =
      deliveryTiers.length > 0 &&
      deliveryTiers.some(
        (tier) =>
          distanceMiles >= tier.minMiles &&
          distanceMiles < tier.maxMiles &&
          tier.enabled
      );
    const deliveryFeeFromTier =
      deliveryTiers.length > 0 && distanceMiles <= deliveryMaxMiles
        ? deliveryTiers.find(
            (tier) =>
              distanceMiles >= tier.minMiles &&
              distanceMiles < tier.maxMiles &&
              tier.enabled
          )?.feeCents ?? 0
        : 0;

    // Compute from distance+tiers; avoid trusting stale cache (e.g. from when deliveryZones was empty).
    const deliveryEligible =
      distanceMiles <= deliveryMaxMiles && (hasMatchingTier || deliveryTiers.length === 0);
    const shippingEligible = cached?.eligibleShipping ?? true;

    const shippingFeeCents = cakeCount * shippingFeePerCakeCents;

    return {
      address: {
        id: address._id,
        formatted: address.formatted,
        city: address.city,
        state: address.state,
        zip: address.zip,
      },
      delivery: {
        eligible: deliveryEligible,
        feeCents: deliveryEligible ? deliveryFeeFromTier : 0,
        distanceMiles: Math.round(distanceMiles * 10) / 10,
        reason: deliveryEligible
          ? null
          : distanceMiles > deliveryMaxMiles
            ? `Beyond ${deliveryMaxMiles} miles — use Shipping`
            : "Address outside configured delivery tiers",
      },
      shipping: {
        eligible: shippingEligible,
        feeCents: shippingFeeCents,
        reason: shippingEligible ? null : "Shipping unavailable",
      },
      cache: cached
        ? {
            distanceMiles: cached.distanceMiles,
            computedAt: cached.computedAt,
            zoneId: cached.zoneId,
          }
        : null,
    };
  },
});

/** Returns true if address is within delivery zone (eligible for local delivery). */
async function isAddressWithinDeliveryZone(
  ctx: QueryCtx,
  addressId: Id<"addresses">,
  deliveryMaxMiles: number
): Promise<boolean> {
  const address = await ctx.db.get(addressId);
  if (!address || typeof address.lat !== "number" || typeof address.lng !== "number") {
    return false;
  }
  const distanceMiles = haversineMiles(
    address.lat,
    address.lng,
    STORE_ORIGIN.lat,
    STORE_ORIGIN.lng
  );
  const deliveryTiers = await ctx.db
    .query("deliveryTiers")
    .withIndex("by_enabled", (q) => q.eq("enabled", true))
    .collect();
  const hasMatchingTier =
    deliveryTiers.length > 0 &&
    deliveryTiers.some(
      (tier) =>
        distanceMiles >= tier.minMiles &&
        distanceMiles < tier.maxMiles &&
        tier.enabled
    );
  return (
    distanceMiles <= deliveryMaxMiles && (hasMatchingTier || deliveryTiers.length === 0)
  );
}

export const setFulfillment = mutation({
  args: {
    cartId: v.id("carts"),
    mode: v.union(v.literal("pickup"), v.literal("delivery"), v.literal("shipping")),
    addressId: v.optional(v.id("addresses")),
  },
  handler: async (ctx, args) => {
    const cart = await ctx.db.get(args.cartId);
    if (!cart) throw new Error("Cart not found");

    if (args.mode !== "pickup" && !args.addressId) {
      throw new Error("Address is required for delivery or shipping");
    }

    // Override shipping→delivery when address is within local delivery zone (no error; client shows toast)
    let effectiveMode = args.mode;
    let overriddenToDelivery = false;
    if (args.mode === "shipping" && args.addressId) {
      const { deliveryMaxMiles } = await getDeliveryConfig(ctx);
      const withinZone = await isAddressWithinDeliveryZone(ctx, args.addressId, deliveryMaxMiles);
      if (withinZone) {
        effectiveMode = "delivery";
        overriddenToDelivery = true;
      }
    }

    const modeChanged = cart.fulfillmentMode !== effectiveMode;
    const patch: { fulfillmentMode: typeof effectiveMode; addressId?: Id<"addresses">; slotHoldId?: undefined; updatedAt: number } = {
      fulfillmentMode: effectiveMode,
      addressId: args.addressId ?? undefined,
      updatedAt: Date.now(),
    };
    if (modeChanged && cart.slotHoldId) {
      const oldHold = await ctx.db.get(cart.slotHoldId as Id<"slotHolds">);
      if (oldHold && "status" in oldHold && oldHold.status === "held") {
        await ctx.db.patch(cart.slotHoldId as Id<"slotHolds">, {
          status: "released",
          updatedAt: Date.now(),
        });
      }
      patch.slotHoldId = undefined;
    }
    await ctx.db.patch(args.cartId, patch);

    return { cartId: args.cartId, overriddenToDelivery };
  },
});

export const listDeliveryTiers = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin", "manager");
    return await ctx.db.query("deliveryTiers").collect();
  },
});

export const upsertDeliveryTier = mutation({
  args: {
    tierId: v.optional(v.id("deliveryTiers")),
    minMiles: v.number(),
    maxMiles: v.number(),
    feeCents: v.number(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");
    const now = Date.now();
    if (args.tierId) {
      await ctx.db.patch(args.tierId, {
        minMiles: args.minMiles,
        maxMiles: args.maxMiles,
        feeCents: args.feeCents,
        enabled: args.enabled,
        updatedAt: now,
      });
      return args.tierId;
    }
    return await ctx.db.insert("deliveryTiers", {
      minMiles: args.minMiles,
      maxMiles: args.maxMiles,
      feeCents: args.feeCents,
      enabled: args.enabled,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const deleteDeliveryTier = mutation({
  args: {
    tierId: v.id("deliveryTiers"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");
    await ctx.db.delete(args.tierId);
    return args.tierId;
  },
});
