import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireRole } from "./lib/auth";

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

    const deliveryFeeFromTier =
      cached && deliveryTiers.length > 0
        ? deliveryTiers.find(
            (tier) =>
              cached.distanceMiles >= tier.minMiles &&
              cached.distanceMiles < tier.maxMiles &&
              tier.enabled
          )?.feeCents ?? 0
        : 0;

    const deliveryEligible =
      cached?.eligibleDelivery ?? (deliveryTiers.length === 0 ? false : deliveryFeeFromTier > 0);
    const shippingEligible = cached?.eligibleShipping ?? true;

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
        reason: deliveryEligible ? null : "Address outside configured delivery tiers",
      },
      shipping: {
        eligible: shippingEligible,
        feeCents: 0,
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
