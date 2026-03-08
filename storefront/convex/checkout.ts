import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireRole } from "./lib/auth";
import { STORE_ORIGIN } from "./lib/storeConfig";

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
  },
  handler: async (ctx, args) => {
    if (!args.addressId) {
      return {
        delivery: {
          eligible: false,
          feeCents: 0,
          reason: "No address selected",
        },
        shipping: {
          eligible: true,
          feeCents: 0,
          reason: null,
        },
      };
    }

    const address = await ctx.db.get(args.addressId);
    if (!address) {
      throw new Error("Address not found");
    }

    const cached = await ctx.db
      .query("addressCache")
      .withIndex("by_address", (q) => q.eq("addressId", args.addressId!))
      .unique();

    const deliveryTiers = await ctx.db
      .query("deliveryTiers")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();

    const distanceMiles =
      cached?.distanceMiles ??
      haversineMiles(
        address.lat,
        address.lng,
        STORE_ORIGIN.lat,
        STORE_ORIGIN.lng
      );
    const deliveryFeeFromTier =
      deliveryTiers.length > 0 && distanceMiles <= 10
        ? deliveryTiers.find(
            (tier) =>
              distanceMiles >= tier.minMiles &&
              distanceMiles < tier.maxMiles &&
              tier.enabled
          )?.feeCents ?? 0
        : 0;

    const deliveryEligible =
      cached?.eligibleDelivery ??
      (distanceMiles <= 10 && deliveryTiers.some(
        (tier) =>
          distanceMiles >= tier.minMiles &&
          distanceMiles < tier.maxMiles &&
          tier.enabled
      ));
    const shippingEligible = cached?.eligibleShipping ?? true;

    const SHIPPING_FEE_OVER_10_MILES_CENTS = 2500;
    const shippingFeeCents =
      distanceMiles > 10 ? SHIPPING_FEE_OVER_10_MILES_CENTS : 0;

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
        reason: deliveryEligible
          ? null
          : distanceMiles > 10
            ? "Address is over 10 miles — shipping available ($25 fee)"
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

    await ctx.db.patch(args.cartId, {
      fulfillmentMode: args.mode,
      addressId: args.addressId ?? undefined,
      updatedAt: Date.now(),
    });

    return args.cartId;
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
