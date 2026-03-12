import type { Id } from "../_generated/dataModel";
import { internalQuery, query } from "../_generated/server";
import { v } from "convex/values";

import { requireRole } from "../lib/auth";

function aggregateEmailsFromOrders(
  orders: { contactEmail?: string | null; createdAt: number }[],
  lastOrderWithinDays?: number
): { email: string; lastOrderAt: number }[] {
  const cutoff =
    lastOrderWithinDays != null
      ? Date.now() - lastOrderWithinDays * 24 * 60 * 60 * 1000
      : 0;
  const byEmail = new Map<string, { email: string; lastOrderAt: number }>();
  for (const order of orders) {
    const email = order.contactEmail?.trim()?.toLowerCase();
    if (!email) continue;
    if (lastOrderWithinDays != null && order.createdAt < cutoff) continue;
    const existing = byEmail.get(email);
    if (!existing || order.createdAt > existing.lastOrderAt) {
      byEmail.set(email, {
        email: order.contactEmail ?? email,
        lastOrderAt: order.createdAt,
      });
    }
  }
  return [...byEmail.values()].sort((a, b) => b.lastOrderAt - a.lastOrderAt);
}

/** Internal: paginated emails for blast. No auth (called from processBlastBatch). */
export const listEmailsForBlastInternal = internalQuery({
  args: {
    skip: v.optional(v.number()),
    limit: v.optional(v.number()),
    lastOrderWithinDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const orders = await ctx.db.query("orders").collect();
    const rows = aggregateEmailsFromOrders(orders, args.lastOrderWithinDays);
    const total = rows.length;
    const skip = args.skip ?? 0;
    const limit = Math.min(args.limit ?? 100, 200);
    const slice = rows.slice(skip, skip + limit).map((r) => r.email);
    return { emails: slice, total };
  },
});

const SORT_FIELDS = ["name", "email", "orderCount", "totalRevenue", "lastOrderAt"] as const;
type SortField = (typeof SORT_FIELDS)[number];

/** List customers aggregated from orders. Orders are loaded on-demand via getOrdersByEmail. */
export const list = query({
  args: {
    sortBy: v.optional(v.union(...SORT_FIELDS.map((f) => v.literal(f)))),
    sortDirection: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");

    const orders = await ctx.db.query("orders").collect();

    const byEmail = new Map<
      string,
      {
        email: string;
        name: string;
        phone: string;
        orderCount: number;
        totalRevenueCents: number;
        lastOrderAt: number;
      }
    >();

    for (const order of orders) {
      const email = order.contactEmail?.trim()?.toLowerCase();
      if (!email) continue;

      const totalCents = order.pricingSnapshot?.totalCents ?? 0;

      const existing = byEmail.get(email);
      if (existing) {
        existing.orderCount += 1;
        existing.totalRevenueCents += totalCents;
        if (order.createdAt > existing.lastOrderAt) {
          existing.lastOrderAt = order.createdAt;
          if (order.contactName?.trim()) existing.name = order.contactName.trim();
        }
        if (order.contactName?.trim() && !existing.name) existing.name = order.contactName.trim();
        if (order.contactPhone?.trim() && !existing.phone) existing.phone = order.contactPhone.trim();
      } else {
        const user = order.userId ? await ctx.db.get(order.userId) : null;
        byEmail.set(email, {
          email: order.contactEmail ?? email,
          name: order.contactName?.trim() || user?.name?.trim() || "",
          phone: order.contactPhone?.trim() || "",
          orderCount: 1,
          totalRevenueCents: totalCents,
          lastOrderAt: order.createdAt,
        });
      }
    }

    const rows = [...byEmail.values()];

    const sortBy = args.sortBy ?? "lastOrderAt";
    const dir = args.sortDirection ?? "desc";
    const mult = dir === "asc" ? 1 : -1;

    rows.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return mult * (a.name || "\uffff").localeCompare(b.name || "\uffff", "en", { sensitivity: "base" });
        case "email":
          return mult * a.email.localeCompare(b.email, "en", { sensitivity: "base" });
        case "orderCount":
          return mult * (a.orderCount - b.orderCount);
        case "totalRevenue":
          return mult * (a.totalRevenueCents - b.totalRevenueCents);
        case "lastOrderAt":
        default:
          return mult * (a.lastOrderAt - b.lastOrderAt);
      }
    });

    return rows;
  },
});

/** Lazy-load orders for a customer by email. Case-insensitive match for robustness. */
export const getOrdersByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");

    const normalized = args.email.trim().toLowerCase();
    if (!normalized) return [];

    let matching = await ctx.db
      .query("orders")
      .withIndex("by_contactEmail", (q) => q.eq("contactEmail", args.email.trim()))
      .collect();

    if (matching.length === 0) {
      matching = await ctx.db
        .query("orders")
        .withIndex("by_contactEmail", (q) => q.eq("contactEmail", normalized))
        .collect();
    }

    if (matching.length === 0) {
      const all = await ctx.db.query("orders").collect();
      matching = all.filter(
        (o) => o.contactEmail?.trim().toLowerCase() === normalized
      );
    }

    matching.sort((a, b) => b.createdAt - a.createdAt);

    return matching.map((o) => ({
      _id: o._id,
      orderNumber: o.orderNumber,
      guestToken: o.guestToken,
      status: o.status,
      fulfillmentMode: o.fulfillmentMode,
      createdAt: o.createdAt,
      totalCents: o.pricingSnapshot?.totalCents ?? 0,
    }));
  },
});

/** Paginated list of customer emails for email blast. Optional filter: lastOrderWithinDays. */
export const listEmailsForBlast = query({
  args: {
    skip: v.optional(v.number()),
    limit: v.optional(v.number()),
    lastOrderWithinDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");
    const orders = await ctx.db.query("orders").collect();
    const rows = aggregateEmailsFromOrders(orders, args.lastOrderWithinDays);
    const total = rows.length;
    const skip = args.skip ?? 0;
    const limit = Math.min(args.limit ?? 100, 200);
    const slice = rows.slice(skip, skip + limit).map((r) => r.email);
    return { emails: slice, total };
  },
});
