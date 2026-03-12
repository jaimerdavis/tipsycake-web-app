import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

import { getCurrentUserOrNull, requireRole } from "./lib/auth";

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

export const deleteCoupon = mutation({
  args: { couponId: v.id("coupons") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");
    const existing = await ctx.db.get(args.couponId);
    if (!existing) throw new Error("Coupon not found");
    await ctx.db.delete(args.couponId);
    return args.couponId;
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

/** Coupons issued to this user via email blast or direct. For "Available Rewards" on account page. */
export const getAvailableRewardsForUser = query({
  args: {},
  handler: async (ctx) => {
    const me = await getCurrentUserOrNull(ctx);
    if (!me?.email) return [];
    const normalized = me.email.trim().toLowerCase();
    const issuances = await ctx.db
      .query("couponIssuances")
      .withIndex("by_recipient", (q) => q.eq("recipientEmail", normalized))
      .collect();
    const rewards: Array<{
      code: string;
      type: string;
      value: number;
      minSubtotalCents?: number;
      expiresAt?: number;
      productNames?: string[];
      includeCategoryTags?: string[];
    }> = [];
    const seen = new Set<string>();
    for (const i of issuances) {
      const c = await ctx.db.get(i.couponId);
      if (!c || !c.enabled || seen.has(c.code)) continue;
      if (c.expiresAt && c.expiresAt < Date.now()) continue;
      seen.add(c.code);

      let productNames: string[] | undefined;
      if (c.includeProductIds && c.includeProductIds.length > 0) {
        productNames = [];
        for (const pid of c.includeProductIds) {
          const p = await ctx.db.get(pid);
          if (p) productNames.push(p.name);
        }
      }

      rewards.push({
        code: c.code,
        type: c.type,
        value: c.value,
        minSubtotalCents: c.minSubtotalCents,
        expiresAt: c.expiresAt,
        productNames,
        includeCategoryTags: c.includeCategoryTags ?? undefined,
      });
    }
    return rewards;
  },
});

/** Admin: issue a coupon to a customer by email (for Available Rewards). */
export const issueCouponToCustomer = mutation({
  args: {
    couponId: v.id("coupons"),
    recipientEmail: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");
    const coupon = await ctx.db.get(args.couponId);
    if (!coupon || !coupon.enabled) throw new Error("Coupon not found or disabled");
    const normalized = args.recipientEmail.trim().toLowerCase();
    if (!normalized) throw new Error("Invalid email");
    const now = Date.now();
    await ctx.db.insert("couponIssuances", {
      couponId: args.couponId,
      recipientEmail: normalized,
      source: "direct",
      createdAt: now,
    });
  },
});
