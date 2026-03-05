import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

export const list = query({
  args: {
    entityType: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");

    const limit = args.limit ?? 100;
    let logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_createdAt")
      .order("desc")
      .take(limit);

    if (args.entityType) {
      logs = logs.filter((log) => log.entityType === args.entityType);
    }

    return logs;
  },
});
