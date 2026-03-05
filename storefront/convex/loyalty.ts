import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

import { getCurrentUser, requireRole } from "./lib/auth";

const REDEEM_POINTS_PER_DOLLAR = 100;
const EARN_POINTS_PER_DOLLAR = 1;

export const getMyAccount = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    const account = await ctx.db
      .query("loyaltyAccounts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (!account) return null;

    const ledger = await ctx.db
      .query("pointsLedger")
      .withIndex("by_account", (q) => q.eq("accountId", account._id))
      .collect();
    return { ...account, ledger };
  },
});

export const ensureMyAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    const existing = await ctx.db
      .query("loyaltyAccounts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (existing) return existing._id;

    const now = Date.now();
    return await ctx.db.insert("loyaltyAccounts", {
      userId: user._id,
      pointsBalance: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const redeemPoints = mutation({
  args: {
    cartId: v.id("carts"),
    points: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.points <= 0) throw new Error("Points must be positive");

    const user = await getCurrentUser(ctx);
    const account = await ctx.db
      .query("loyaltyAccounts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (!account) throw new Error("No loyalty account");
    if (account.pointsBalance < args.points) throw new Error("Insufficient points");

    const cart = await ctx.db.get(args.cartId);
    if (!cart) throw new Error("Cart not found");
    if (cart.ownerType !== "user" || cart.ownerId !== user.tokenIdentifier) {
      throw new Error("Cart does not belong to current user");
    }

    await ctx.db.patch(args.cartId, {
      appliedLoyaltyPoints: args.points,
      updatedAt: Date.now(),
    });

    return {
      pointsApplied: args.points,
      discountCents: Math.floor((args.points / REDEEM_POINTS_PER_DOLLAR) * 100),
    };
  },
});

export const adminAdjustPoints = mutation({
  args: {
    userId: v.id("users"),
    pointsDelta: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "admin", "manager");
    void actor;
    const account = await ctx.db
      .query("loyaltyAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (!account) throw new Error("No loyalty account");

    const now = Date.now();
    await ctx.db.patch(account._id, {
      pointsBalance: account.pointsBalance + args.pointsDelta,
      updatedAt: now,
    });
    await ctx.db.insert("pointsLedger", {
      accountId: account._id,
      type: "adjust",
      points: args.pointsDelta,
      note: args.note,
      createdAt: now,
    });
    return account._id;
  },
});

export const adminListAccounts = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin", "manager");
    const accounts = await ctx.db.query("loyaltyAccounts").collect();
    return accounts;
  },
});

export const awardPointsForOrder = internalMutation({
  args: {
    orderId: v.id("orders"),
    userId: v.id("users"),
    earnBaseCents: v.number(),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("loyaltyAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (!account) return { awarded: 0 };

    const points = Math.floor((args.earnBaseCents / 100) * EARN_POINTS_PER_DOLLAR);
    if (points <= 0) return { awarded: 0 };

    const now = Date.now();
    await ctx.db.patch(account._id, {
      pointsBalance: account.pointsBalance + points,
      updatedAt: now,
    });
    await ctx.db.insert("pointsLedger", {
      accountId: account._id,
      type: "earn",
      points,
      orderId: args.orderId,
      createdAt: now,
    });
    return { awarded: points };
  },
});

export const applyRedemptionForOrder = internalMutation({
  args: {
    orderId: v.id("orders"),
    userId: v.id("users"),
    points: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.points <= 0) return { redeemed: 0 };
    const account = await ctx.db
      .query("loyaltyAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (!account) return { redeemed: 0 };
    if (account.pointsBalance < args.points) throw new Error("Insufficient loyalty points");

    const now = Date.now();
    await ctx.db.patch(account._id, {
      pointsBalance: account.pointsBalance - args.points,
      updatedAt: now,
    });
    await ctx.db.insert("pointsLedger", {
      accountId: account._id,
      type: "redeem",
      points: -args.points,
      orderId: args.orderId,
      createdAt: now,
    });
    return { redeemed: args.points };
  },
});
