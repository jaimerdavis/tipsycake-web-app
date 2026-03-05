import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getAddressById = query({
  args: { addressId: v.id("addresses") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.addressId);
  },
});

export const listAddresses = query({
  args: {
    ownerId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.ownerId) return [];
    return await ctx.db
      .query("addresses")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .collect();
  },
});

export const createAddress = mutation({
  args: {
    ownerId: v.optional(v.string()),
    formatted: v.string(),
    line1: v.string(),
    line2: v.optional(v.string()),
    city: v.string(),
    state: v.string(),
    zip: v.string(),
    lat: v.number(),
    lng: v.number(),
    placeId: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("addresses", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const listDeliveryZones = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("deliveryZones").collect();
  },
});

export const upsertAddressCache = mutation({
  args: {
    addressId: v.id("addresses"),
    distanceMiles: v.number(),
    zoneId: v.optional(v.id("deliveryZones")),
    eligibleDelivery: v.boolean(),
    eligibleShipping: v.boolean(),
    computedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("addressCache")
      .withIndex("by_address", (q) => q.eq("addressId", args.addressId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args });
      return existing._id;
    }
    return await ctx.db.insert("addressCache", args);
  },
});
