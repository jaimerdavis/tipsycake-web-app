import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin", "manager");

    const orders = await ctx.db.query("orders").collect();
    const carts = await ctx.db.query("carts").collect();

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const ordersToday = orders.filter((o) => o.createdAt >= oneDayAgo);
    const orders7d = orders.filter((o) => o.createdAt >= sevenDaysAgo);
    const orders30d = orders.filter((o) => o.createdAt >= thirtyDaysAgo);

    const revenue = (list: typeof orders) =>
      list
        .filter((o) => o.status !== "canceled" && o.status !== "failed")
        .reduce((sum, o) => sum + o.pricingSnapshot.totalCents, 0);

    const activeCarts = carts.filter((c) => c.status === "active");
    const abandonedCarts = carts.filter((c) => c.status === "abandoned");
    const convertedCarts = carts.filter((c) => c.status === "converted");

    const conversionRate =
      convertedCarts.length + activeCarts.length > 0
        ? Math.round(
            (convertedCarts.length /
              (convertedCarts.length + abandonedCarts.length + activeCarts.length)) *
              100
          )
        : 0;

    const byFulfillment = {
      pickup: orders.filter((o) => o.fulfillmentMode === "pickup").length,
      delivery: orders.filter((o) => o.fulfillmentMode === "delivery").length,
      shipping: orders.filter((o) => o.fulfillmentMode === "shipping").length,
    };

    const byStatus: Record<string, number> = {};
    for (const o of orders) {
      byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
    }

    return {
      orders: {
        total: orders.length,
        today: ordersToday.length,
        last7Days: orders7d.length,
        last30Days: orders30d.length,
      },
      revenue: {
        todayCents: revenue(ordersToday),
        last7DaysCents: revenue(orders7d),
        last30DaysCents: revenue(orders30d),
        allTimeCents: revenue(orders),
      },
      carts: {
        active: activeCarts.length,
        abandoned: abandonedCarts.length,
        converted: convertedCarts.length,
        conversionRate,
      },
      byFulfillment,
      byStatus,
    };
  },
});

/** List abandoned carts with items for admin view. */
export const listAbandonedCarts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");
    const limit = args.limit ?? 100;
    const carts = await ctx.db
      .query("carts")
      .withIndex("by_status", (q) => q.eq("status", "abandoned"))
      .collect();
    const sorted = carts.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
    const result = [];
    for (const cart of sorted) {
      const items = await ctx.db
        .query("cartItems")
        .withIndex("by_cart", (q) => q.eq("cartId", cart._id))
        .collect();
      const productNames: string[] = [];
      for (const item of items) {
        const p = await ctx.db.get(item.productId);
        productNames.push(p ? `${p.name} × ${item.qty}` : `Product × ${item.qty}`);
      }
      const subtotalCents = items.reduce((s, i) => s + i.unitPriceSnapshotCents * i.qty, 0);
      result.push({
        _id: cart._id,
        contactEmail: cart.contactEmail,
        contactPhone: cart.contactPhone,
        appliedCouponCode: cart.appliedCouponCode,
        productSummary: productNames.join(", ") || "Empty",
        itemCount: items.reduce((s, i) => s + i.qty, 0),
        subtotalCents,
        updatedAt: cart.updatedAt,
        createdAt: cart.createdAt,
      });
    }
    return result;
  },
});

