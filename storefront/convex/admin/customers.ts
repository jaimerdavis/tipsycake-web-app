import type { Id } from "../_generated/dataModel";
import { internalQuery, mutation, query } from "../_generated/server";
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

/** Search contactEmails containing a term. Use to find exact stored values before running fix. */
export const searchCustomerEmails = query({
  args: { search: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");
    const term = args.search.trim().toLowerCase();
    if (!term || term.length < 2) return [];
    const orders = await ctx.db.query("orders").collect();
    const byKey = new Map<string, { raw: string; count: number }>();
    for (const o of orders) {
      const raw = o.contactEmail?.trim();
      if (!raw || !raw.toLowerCase().includes(term)) continue;
      const key = raw.toLowerCase();
      const ex = byKey.get(key);
      if (ex) ex.count += 1;
      else byKey.set(key, { raw, count: 1 });
    }
    return [...byKey.entries()].map(([key, v]) => ({
      email: v.raw,
      normalized: key,
      orderCount: v.count,
    }));
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

/**
 * Debug: list orders with contactEmail matching a search term (case-insensitive).
 * Use to see exact stored values before running fixCustomerEmail.
 */
export const debugEmailsContaining = query({
  args: { search: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const term = args.search.trim().toLowerCase();
    if (!term) return [];
    const orders = await ctx.db.query("orders").collect();
    const matches = orders
      .filter((o) => o.contactEmail?.toLowerCase().includes(term))
      .map((o) => ({
        orderNumber: o.orderNumber,
        contactEmail: o.contactEmail,
        contactName: o.contactName,
        createdAt: o.createdAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
    return matches;
  },
});

/**
 * Correct a typo in customer email across orders, coupon redemptions, and chat.
 * Merges duplicate customer rows (e.g. alrickmurray14@gnail.com → alrickmurray14@gmail.com).
 */
export const fixCustomerEmail = mutation({
  args: {
    fromEmail: v.string(),
    toEmail: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const fromNorm = args.fromEmail.trim().toLowerCase();
    const toNorm = args.toEmail.trim().toLowerCase();
    if (!fromNorm || !toNorm) throw new Error("Both emails required");
    if (fromNorm === toNorm) throw new Error("Emails must be different");

    const orders = await ctx.db.query("orders").collect();
    const matchingOrders = orders.filter(
      (o) => o.contactEmail?.trim().toLowerCase() === fromNorm
    );

    const redemptions = await ctx.db.query("couponRedemptions").collect();
    const matchingRedemptions = redemptions.filter(
      (r) => r.contactEmail?.trim().toLowerCase() === fromNorm
    );

    const conversations = await ctx.db.query("chatConversations").collect();
    const matchingConversations = conversations.filter(
      (c) => c.contactEmail?.trim().toLowerCase() === fromNorm
    );

    const now = Date.now();
    for (const order of matchingOrders) {
      await ctx.db.patch(order._id, {
        contactEmail: args.toEmail.trim(),
        updatedAt: now,
      });
    }
    for (const redemption of matchingRedemptions) {
      await ctx.db.patch(redemption._id, {
        contactEmail: args.toEmail.trim(),
      });
    }
    for (const conv of matchingConversations) {
      await ctx.db.patch(conv._id, {
        contactEmail: args.toEmail.trim(),
        updatedAt: now,
      });
    }

    return {
      ordersUpdated: matchingOrders.length,
      redemptionsUpdated: matchingRedemptions.length,
      conversationsUpdated: matchingConversations.length,
    };
  },
});


/**
 * Debug: find exact contactEmail values for orders matching a search term.
 * Run from Dashboard to see what's stored (e.g. search "alrick" to find Alrick Murray's emails).
 */
export const debugSearchEmails = query({
  args: { search: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");
    const term = args.search.trim().toLowerCase();
    if (!term) return [];
    const orders = await ctx.db.query("orders").collect();
    const byRaw = new Map<string, { count: number; normalized: string }>();
    for (const o of orders) {
      const raw = o.contactEmail?.trim();
      if (!raw || !raw.toLowerCase().includes(term)) continue;
      const norm = raw.toLowerCase();
      const ex = byRaw.get(raw);
      if (ex) ex.count += 1;
      else byRaw.set(raw, { count: 1, normalized: norm });
    }
    return [...byRaw.entries()].map(([email, { count, normalized }]) => ({
      email,
      normalized,
      orderCount: byRaw.get(email)?.count ?? 0,
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
