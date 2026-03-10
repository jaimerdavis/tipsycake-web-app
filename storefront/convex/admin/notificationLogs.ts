import { internalMutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

export const insert = internalMutation({
  args: {
    channel: v.union(v.literal("email"), v.literal("sms")),
    to: v.string(),
    subject: v.optional(v.string()),
    template: v.optional(v.string()),
    bodyPreview: v.optional(v.string()),
    status: v.union(v.literal("sent"), v.literal("skipped"), v.literal("error")),
    errorMessage: v.optional(v.string()),
    externalId: v.optional(v.string()),
    orderId: v.optional(v.id("orders")),
    orderNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orderId, orderNumber, bodyPreview, ...rest } = args;
    await ctx.db.insert("notificationLogs", {
      ...rest,
      orderId: orderId ?? undefined,
      orderNumber: orderNumber ?? undefined,
      bodyPreview: bodyPreview ?? undefined,
      createdAt: Date.now(),
    });
  },
});

export const list = query({
  args: {
    limit: v.optional(v.number()),
    channel: v.optional(v.union(v.literal("email"), v.literal("sms"))),
    orderId: v.optional(v.id("orders")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const limit = args.limit ?? 100;
    if (args.orderId) {
      const byOrder = await ctx.db
        .query("notificationLogs")
        .withIndex("by_orderId", (q) => q.eq("orderId", args.orderId!))
        .order("desc")
        .take(limit);
      return byOrder;
    }
    if (args.channel) {
      return await ctx.db
        .query("notificationLogs")
        .withIndex("by_channel_createdAt", (q) => q.eq("channel", args.channel!))
        .order("desc")
        .take(limit);
    }
    return await ctx.db
      .query("notificationLogs")
      .withIndex("by_createdAt")
      .order("desc")
      .take(limit);
  },
});
