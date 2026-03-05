import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

import { requireRole } from "./lib/auth";

export { computeCouponDiscount } from "./lib/couponLogic";

const couponType = v.union(
  v.literal("percent"),
  v.literal("fixed"),
  v.literal("free_delivery")
);

export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const normalized = args.code.trim().toUpperCase();
    return await ctx.db
      .query("coupons")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .unique();
  },
});

export const createCoupon = mutation({
  args: {
    code: v.string(),
    type: couponType,
    value: v.number(),
    minSubtotalCents: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    maxRedemptions: v.optional(v.number()),
    maxRedemptionsPerCustomer: v.optional(v.number()),
    includeProductIds: v.optional(v.array(v.id("products"))),
    includeCategoryTags: v.optional(v.array(v.string())),
    excludeProductIds: v.optional(v.array(v.id("products"))),
    excludeCategoryTags: v.optional(v.array(v.string())),
    stackable: v.boolean(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");
    const normalized = args.code.trim().toUpperCase();
    const existing = await ctx.db
      .query("coupons")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .unique();
    if (existing) throw new Error("Coupon code already exists");

    const now = Date.now();
    return await ctx.db.insert("coupons", {
      ...args,
      code: normalized,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateCoupon = mutation({
  args: {
    couponId: v.id("coupons"),
    type: v.optional(couponType),
    value: v.optional(v.number()),
    minSubtotalCents: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    maxRedemptions: v.optional(v.number()),
    maxRedemptionsPerCustomer: v.optional(v.number()),
    includeProductIds: v.optional(v.array(v.id("products"))),
    includeCategoryTags: v.optional(v.array(v.string())),
    excludeProductIds: v.optional(v.array(v.id("products"))),
    excludeCategoryTags: v.optional(v.array(v.string())),
    stackable: v.optional(v.boolean()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");
    const { couponId, ...updates } = args;
    const existing = await ctx.db.get(couponId);
    if (!existing) throw new Error("Coupon not found");
    await ctx.db.patch(couponId, {
      ...updates,
      updatedAt: Date.now(),
    });
    return couponId;
  },
});

export const listCoupons = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin", "manager");
    return await ctx.db.query("coupons").collect();
  },
});

export const usageReport = query({
  args: {
    couponId: v.id("coupons"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");
    const coupon = await ctx.db.get(args.couponId);
    if (!coupon) throw new Error("Coupon not found");
    const redemptions = await ctx.db
      .query("couponRedemptions")
      .withIndex("by_coupon", (q) => q.eq("couponId", args.couponId))
      .collect();
    return {
      coupon,
      count: redemptions.length,
      redemptions,
    };
  },
});
