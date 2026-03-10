import { query } from "../_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

export const list = query({
  args: {
    entityType: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");

    if (args.entityType) {
      return await ctx.db
        .query("auditLogs")
        .withIndex("by_entityType_createdAt", (q) =>
          q.eq("entityType", args.entityType!)
        )
        .order("desc")
        .paginate(args.paginationOpts);
    }
    return await ctx.db
      .query("auditLogs")
      .withIndex("by_createdAt")
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
