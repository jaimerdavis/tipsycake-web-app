import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { renderAbandonedCart } from "./lib/emailTemplates";

const ABANDONED_THRESHOLD_MS = 2 * 60 * 60 * 1000;
const DEFAULT_SITE_URL = "http://localhost:3000";

const ABANDONED_WORDS = ["CAKE", "SAVE", "DEAL", "TREAT", "SWEET", "TASTY", "BONUS"] as const;

function generateAbandonedCode(): string {
  const word = ABANDONED_WORDS[Math.floor(Math.random() * ABANDONED_WORDS.length)];
  const suffix = Math.random().toString(36).slice(2, 3).toUpperCase();
  return `${word}${suffix}`;
}

export const scanAndNotify = internalMutation({
  args: {
    siteUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const baseUrl = args.siteUrl ?? DEFAULT_SITE_URL;
    const now = Date.now();
    const settingsRows = await ctx.db.query("siteSettings").collect();
    const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
    const storeName = settings.storeName ?? "TheTipsyCake";
    const smsEnabled = settings.smsEnabled !== "false";
    const incentiveEnabled = settings.emailAbandonedCartIncentiveEnabled !== "false";
    const couponCents = Math.max(0, Number(settings.emailAbandonedCartCouponCents) || 100);
    const expiryHours = Math.max(1, Math.min(168, Number(settings.emailAbandonedCartCouponExpiryHours) || 24));
    const expiresAt = now + expiryHours * 60 * 60 * 1000;

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

      const productDetails: { name: string; qty: number; priceCents: number }[] = [];
      for (const item of items) {
        const product = await ctx.db.get(item.productId);
        const name = product?.name ?? "Item";
        productDetails.push({
          name,
          qty: item.qty,
          priceCents: item.unitPriceSnapshotCents,
        });
      }

      let couponCode = "";
      let couponExpiry = "";
      if (incentiveEnabled && couponCents > 0) {
        let code = "";
        for (let i = 0; i < 10; i++) {
          code = generateAbandonedCode();
          const existing = await ctx.db
            .query("coupons")
            .withIndex("by_code", (q) => q.eq("code", code))
            .unique();
          if (!existing) break;
          if (i === 9) code = "";
        }
        if (code) {
          await ctx.db.insert("coupons", {
            code,
            type: "fixed",
            value: couponCents,
            minSubtotalCents: 0,
            expiresAt,
            maxRedemptions: 1,
            maxRedemptionsPerCustomer: 1,
            stackable: false,
            enabled: true,
            createdAt: now,
            updatedAt: now,
          });
          couponCode = code;
          couponExpiry = new Date(expiresAt).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          });
        }
      }

      const restoreUrl = `${baseUrl}/cart?restore=${cart._id}`;
      if (cart.contactEmail) {
        const rendered = await renderAbandonedCart(ctx, {
          storeName,
          cartLink: restoreUrl,
          productDetails,
          couponCode,
          couponExpiry,
          couponDiscountCents: couponCode ? couponCents : undefined,
        });
        await ctx.scheduler.runAfter(0, internal.notifications.sendEmail, {
          to: cart.contactEmail,
          subject: rendered.subject,
          body: rendered.html,
          template: "abandoned_cart",
        });
      }
      if (cart.contactPhone && smsEnabled) {
        await ctx.scheduler.runAfter(0, internal.notifications.sendSms, {
          to: cart.contactPhone,
          body: `Your cart is waiting: ${restoreUrl}`,
          template: "abandoned_cart",
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
