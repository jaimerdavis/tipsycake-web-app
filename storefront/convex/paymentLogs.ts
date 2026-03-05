import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const recordPaymentAttempt = mutation({
  args: {
    cartId: v.id("carts"),
    provider: v.union(v.literal("stripe"), v.literal("paypal")),
    referenceId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("paymentAttempts", {
      cartId: args.cartId,
      provider: args.provider,
      status: "started",
      referenceId: args.referenceId,
      createdAt: Date.now(),
    });
  },
});
