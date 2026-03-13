import { query } from "../_generated/server";
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

/** List abandoned carts for Admin → Abandoned Carts page. */
export const listAbandonedCarts = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin", "manager");

    const carts = await ctx.db
      .query("carts")
      .withIndex("by_status", (q) => q.eq("status", "abandoned"))
      .collect();

    const rows: {
      cartId: string;
      contactEmail?: string;
      contactPhone?: string;
      itemCount: number;
      updatedAt: number;
    }[] = [];

    for (const cart of carts) {
      const items = await ctx.db
        .query("cartItems")
        .withIndex("by_cart", (q) => q.eq("cartId", cart._id))
        .collect();
      rows.push({
        cartId: cart._id,
        contactEmail: cart.contactEmail,
        contactPhone: cart.contactPhone,
        itemCount: items.length,
        updatedAt: cart.updatedAt,
      });
    }

    rows.sort((a, b) => b.updatedAt - a.updatedAt);
    return rows;
  },
});
