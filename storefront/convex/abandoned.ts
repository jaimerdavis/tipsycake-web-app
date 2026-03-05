import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const ABANDONED_THRESHOLD_MS = 2 * 60 * 60 * 1000;
const DEFAULT_SITE_URL = "http://localhost:3000";

export const scanAndNotify = internalMutation({
  args: {
    siteUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const baseUrl = args.siteUrl ?? DEFAULT_SITE_URL;
    const now = Date.now();
    const activeCarts = await ctx.db
      .query("carts")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    let notified = 0;
    for (const cart of activeCarts) {
      if (!cart.contactEmail && !cart.contactPhone) continue;
      if (now - cart.updatedAt < ABANDONED_THRESHOLD_MS) continue;

      const items = await ctx.db
        .query("cartItems")
        .withIndex("by_cart", (q) => q.eq("cartId", cart._id))
        .collect();
      if (items.length === 0) continue;

      const restoreUrl = `${baseUrl}/cart`;
      if (cart.contactEmail) {
        await ctx.scheduler.runAfter(0, internal.notifications.sendEmail, {
          to: cart.contactEmail,
          subject: "You left something sweet in your cart",
          body: `Complete your order here: ${restoreUrl}`,
          template: "abandoned_cart",
        });
      }
      if (cart.contactPhone) {
        await ctx.scheduler.runAfter(0, internal.notifications.sendSms, {
          to: cart.contactPhone,
          body: `Your cart is waiting: ${restoreUrl}`,
        });
      }

      await ctx.db.patch(cart._id, {
        status: "abandoned",
        updatedAt: now,
      });
      notified += 1;
    }

    return { notified };
  },
});
