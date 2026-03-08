import { internalMutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

export const insert = internalMutation({
  args: {
    channel: v.union(v.literal("email"), v.literal("sms")),
    to: v.string(),
    subject: v.optional(v.string()),
    template: v.optional(v.string()),
    status: v.union(v.literal("sent"), v.literal("skipped"), v.literal("error")),
    errorMessage: v.optional(v.string()),
    externalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("notificationLogs", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const list = query({
  args: {
    limit: v.optional(v.number()),
    channel: v.optional(v.union(v.literal("email"), v.literal("sms"))),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const limit = args.limit ?? 100;
    const logs = await ctx.db
      .query("notificationLogs")
      .withIndex("by_createdAt")
      .order("desc")
      .take(500);
    const filtered = args.channel ? logs.filter((l) => l.channel === args.channel) : logs;
    return filtered.slice(0, limit);
  },
});
