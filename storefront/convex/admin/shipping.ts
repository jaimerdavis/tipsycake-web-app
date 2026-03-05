import { mutation } from "../_generated/server";
import { v } from "convex/values";

import { requireRole } from "../lib/auth";

export const setTracking = mutation({
  args: {
    orderId: v.id("orders"),
    carrier: v.string(),
    trackingNumber: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager", "dispatcher");
    await ctx.db.patch(args.orderId, {
      carrier: args.carrier,
      trackingNumber: args.trackingNumber,
      status: "shipped",
      updatedAt: Date.now(),
    });
    return args.orderId;
  },
});
