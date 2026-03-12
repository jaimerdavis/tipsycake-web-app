import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

import { requireRole } from "../lib/auth";
import { renderStatusUpdate } from "../lib/emailTemplates";

function startOfDayMs(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfDayMs(date: Date): number {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

const NOTIFY_STATUSES = new Set([
  "order_accepted",
  "in_production",
  "ready_for_pickup",
  "out_for_delivery",
  "delivered",
  "shipped",
  "completed",
  "canceled",
]);

const OWNER_COMPLETE_STATUSES = new Set(["completed", "delivered", "shipped"]);

/** Debug: find orders by contactEmail. Use to verify linking. */
export const listByContactEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const normalized = args.email.trim().toLowerCase();
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_contactEmail", (q) => q.eq("contactEmail", normalized))
      .collect();
    return orders.map((o) => ({
      _id: o._id,
      orderNumber: o.orderNumber,
      contactEmail: o.contactEmail,
      userId: o.userId,
      status: o.status,
      createdAt: o.createdAt,
    }));
  },
});

export const list = query({
  args: {
    status: v.optional(v.string()),
    fulfillmentMode: v.optional(
      v.union(v.literal("pickup"), v.literal("delivery"), v.literal("shipping"))
    ),
    contactEmail: v.optional(v.string()),
    /** Search: order number, email, or customer name (partial match) */
    search: v.optional(v.string()),
    productId: v.optional(v.id("products")),
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager", "kitchen", "dispatcher");

    const searchTrimmed = args.search?.trim();
    const normalizedEmail =
      args.contactEmail?.trim()?.toLowerCase() ??
      (searchTrimmed?.includes("@") ? searchTrimmed.trim().toLowerCase() : undefined);

    const dateFromMs = args.dateFrom ? startOfDayMs(new Date(args.dateFrom)) : undefined;
    const dateToMs = args.dateTo ? endOfDayMs(new Date(args.dateTo)) : undefined;

    /** When productId filter is set: collect orders that contain this product. */
    if (args.productId) {
      const allItems = await ctx.db.query("orderItems").collect();
      const orderIds = new Set<Id<"orders">>();
      for (const item of allItems) {
        const snap = item.productSnapshot as { productId?: Id<"products"> };
        if (snap?.productId === args.productId) {
          orderIds.add(item.orderId);
        }
      }
      const fetched = await Promise.all(
        Array.from(orderIds).map((id) => ctx.db.get(id))
      );
      let orders = fetched.filter((o): o is Doc<"orders"> => o != null);
      orders.sort((a, b) => b.createdAt - a.createdAt);

      if (normalizedEmail) {
        orders = orders.filter(
          (o) => o.contactEmail?.toLowerCase() === normalizedEmail
        );
      }
      if (args.status) {
        orders = orders.filter((o) => o.status === args.status);
      }
      if (args.fulfillmentMode) {
        orders = orders.filter((o) => o.fulfillmentMode === args.fulfillmentMode);
      }
      if (dateFromMs != null) {
        orders = orders.filter((o) => o.createdAt >= dateFromMs);
      }
      if (dateToMs != null) {
        orders = orders.filter((o) => o.createdAt <= dateToMs);
      }
      if (searchTrimmed && !searchTrimmed.includes("@")) {
        const needle = searchTrimmed.toLowerCase();
        orders = orders.filter((o) => {
          const onum = o.orderNumber?.toLowerCase();
          const email = o.contactEmail?.toLowerCase();
          const name = o.contactName?.toLowerCase();
          return (
            (onum?.includes(needle) ?? false) ||
            (email?.includes(needle) ?? false) ||
            (name?.includes(needle) ?? false)
          );
        });
      }

      const { numItems, cursor } = args.paginationOpts;
      const start = cursor ? parseInt(cursor, 10) : 0;
      const page = orders.slice(start, start + numItems);
      const enrichedPage = await Promise.all(
        page.map(async (order) => {
          const items = await ctx.db
            .query("orderItems")
            .withIndex("by_order", (q) => q.eq("orderId", order._id))
            .collect();
          const user = order.userId ? await ctx.db.get(order.userId) : null;
          const address = order.addressId ? await ctx.db.get(order.addressId) : null;
          return {
            ...order,
            items,
            userName: user?.name,
            userEmail: user?.email,
            addressFormatted: address?.formatted ?? null,
          };
        })
      );
      return {
        page: enrichedPage,
        continueCursor: start + numItems < orders.length ? String(start + numItems) : null,
        isDone: start + numItems >= orders.length,
      };
    }

    /** Order number exact search */
    if (searchTrimmed && /^\d{1,8}$/.test(searchTrimmed)) {
      const order = await ctx.db
        .query("orders")
        .withIndex("by_orderNumber", (q) => q.eq("orderNumber", searchTrimmed))
        .first();
      if (order) {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();
        const user = order.userId ? await ctx.db.get(order.userId) : null;
        const address = order.addressId ? await ctx.db.get(order.addressId) : null;
        return {
          page: [
            {
              ...order,
              items,
              userName: user?.name,
              userEmail: user?.email,
              addressFormatted: address?.formatted ?? null,
            },
          ],
          continueCursor: null,
          isDone: true,
        };
      }
    }

    if (normalizedEmail) {
      const base = await ctx.db
        .query("orders")
        .withIndex("by_contactEmail_createdAt", (q) =>
          q.eq("contactEmail", normalizedEmail)
        )
        .collect();
      const filtered = base.filter((o) => {
        if (dateFromMs != null && o.createdAt < dateFromMs) return false;
        if (dateToMs != null && o.createdAt > dateToMs) return false;
        return true;
      });
      filtered.sort((a, b) => b.createdAt - a.createdAt);
      const { numItems, cursor } = args.paginationOpts;
      const start = cursor ? parseInt(cursor, 10) : 0;
      const page = filtered.slice(start, start + numItems);
      const enrichedPage = await Promise.all(
        page.map(async (order) => {
          const items = await ctx.db
            .query("orderItems")
            .withIndex("by_order", (q) => q.eq("orderId", order._id))
            .collect();
          const user = order.userId ? await ctx.db.get(order.userId) : null;
          const address = order.addressId ? await ctx.db.get(order.addressId) : null;
          return {
            ...order,
            items,
            userName: user?.name,
            userEmail: user?.email,
            addressFormatted: address?.formatted ?? null,
          };
        })
      );
      return {
        page: enrichedPage,
        continueCursor:
          start + numItems < filtered.length ? String(start + numItems) : null,
        isDone: start + numItems >= filtered.length,
      };
    } else if (args.status && args.fulfillmentMode) {
      let base = await ctx.db
        .query("orders")
        .withIndex("by_status_fulfillmentMode_createdAt", (q) =>
          q.eq("status", args.status!).eq("fulfillmentMode", args.fulfillmentMode!)
        )
        .order("desc")
        .collect();
      if (dateFromMs != null || dateToMs != null) {
        base = base.filter((o) => {
          if (dateFromMs != null && o.createdAt < dateFromMs) return false;
          if (dateToMs != null && o.createdAt > dateToMs) return false;
          return true;
        });
      }
      if (searchTrimmed && !searchTrimmed.includes("@")) {
        const needle = searchTrimmed.toLowerCase();
        base = base.filter((o) => {
          const onum = o.orderNumber?.toLowerCase();
          const email = o.contactEmail?.toLowerCase();
          const name = o.contactName?.toLowerCase();
          return (
            (onum?.includes(needle) ?? false) ||
            (email?.includes(needle) ?? false) ||
            (name?.includes(needle) ?? false)
          );
        });
      }
      base.sort((a, b) => b.createdAt - a.createdAt);
      const { numItems, cursor } = args.paginationOpts;
      const start = cursor ? parseInt(cursor, 10) : 0;
      const page = base.slice(start, start + numItems);
      const enrichedPage = await Promise.all(
        page.map(async (order) => {
          const items = await ctx.db
            .query("orderItems")
            .withIndex("by_order", (q) => q.eq("orderId", order._id))
            .collect();
          const user = order.userId ? await ctx.db.get(order.userId) : null;
          const address = order.addressId ? await ctx.db.get(order.addressId) : null;
          return {
            ...order,
            items,
            userName: user?.name,
            userEmail: user?.email,
            addressFormatted: address?.formatted ?? null,
          };
        })
      );
      return {
        page: enrichedPage,
        continueCursor:
          start + numItems < base.length ? String(start + numItems) : null,
        isDone: start + numItems >= base.length,
      };
    } else if (args.status) {
      let base = await ctx.db
        .query("orders")
        .withIndex("by_status_createdAt", (q) => q.eq("status", args.status!))
        .order("desc")
        .collect();
      if (dateFromMs != null || dateToMs != null) {
        base = base.filter((o) => {
          if (dateFromMs != null && o.createdAt < dateFromMs) return false;
          if (dateToMs != null && o.createdAt > dateToMs) return false;
          return true;
        });
      }
      if (searchTrimmed && !searchTrimmed.includes("@")) {
        const needle = searchTrimmed.toLowerCase();
        base = base.filter((o) => {
          const onum = o.orderNumber?.toLowerCase();
          const email = o.contactEmail?.toLowerCase();
          const name = o.contactName?.toLowerCase();
          return (
            (onum?.includes(needle) ?? false) ||
            (email?.includes(needle) ?? false) ||
            (name?.includes(needle) ?? false)
          );
        });
      }
      base.sort((a, b) => b.createdAt - a.createdAt);
      const { numItems, cursor } = args.paginationOpts;
      const start = cursor ? parseInt(cursor, 10) : 0;
      const page = base.slice(start, start + numItems);
      const enrichedPage = await Promise.all(
        page.map(async (order) => {
          const items = await ctx.db
            .query("orderItems")
            .withIndex("by_order", (q) => q.eq("orderId", order._id))
            .collect();
          const user = order.userId ? await ctx.db.get(order.userId) : null;
          const address = order.addressId ? await ctx.db.get(order.addressId) : null;
          return {
            ...order,
            items,
            userName: user?.name,
            userEmail: user?.email,
            addressFormatted: address?.formatted ?? null,
          };
        })
      );
      return {
        page: enrichedPage,
        continueCursor:
          start + numItems < base.length ? String(start + numItems) : null,
        isDone: start + numItems >= base.length,
      };
    } else if (args.fulfillmentMode) {
      let base = await ctx.db
        .query("orders")
        .withIndex("by_fulfillmentMode_createdAt", (q) =>
          q.eq("fulfillmentMode", args.fulfillmentMode!)
        )
        .order("desc")
        .collect();
      if (dateFromMs != null || dateToMs != null) {
        base = base.filter((o) => {
          if (dateFromMs != null && o.createdAt < dateFromMs) return false;
          if (dateToMs != null && o.createdAt > dateToMs) return false;
          return true;
        });
      }
      if (searchTrimmed && !searchTrimmed.includes("@")) {
        const needle = searchTrimmed.toLowerCase();
        base = base.filter((o) => {
          const onum = o.orderNumber?.toLowerCase();
          const email = o.contactEmail?.toLowerCase();
          const name = o.contactName?.toLowerCase();
          return (
            (onum?.includes(needle) ?? false) ||
            (email?.includes(needle) ?? false) ||
            (name?.includes(needle) ?? false)
          );
        });
      }
      base.sort((a, b) => b.createdAt - a.createdAt);
      const { numItems, cursor } = args.paginationOpts;
      const start = cursor ? parseInt(cursor, 10) : 0;
      const page = base.slice(start, start + numItems);
      const enrichedPage = await Promise.all(
        page.map(async (order) => {
          const items = await ctx.db
            .query("orderItems")
            .withIndex("by_order", (q) => q.eq("orderId", order._id))
            .collect();
          const user = order.userId ? await ctx.db.get(order.userId) : null;
          const address = order.addressId ? await ctx.db.get(order.addressId) : null;
          return {
            ...order,
            items,
            userName: user?.name,
            userEmail: user?.email,
            addressFormatted: address?.formatted ?? null,
          };
        })
      );
      return {
        page: enrichedPage,
        continueCursor:
          start + numItems < base.length ? String(start + numItems) : null,
        isDone: start + numItems >= base.length,
      };
    } else {
      let base = await ctx.db
        .query("orders")
        .withIndex("by_createdAt")
        .order("desc")
        .collect();
      if (dateFromMs != null || dateToMs != null) {
        base = base.filter((o) => {
          if (dateFromMs != null && o.createdAt < dateFromMs) return false;
          if (dateToMs != null && o.createdAt > dateToMs) return false;
          return true;
        });
      }
      if (searchTrimmed && !searchTrimmed.includes("@")) {
        const needle = searchTrimmed.toLowerCase();
        base = base.filter((o) => {
          const onum = o.orderNumber?.toLowerCase();
          const email = o.contactEmail?.toLowerCase();
          const name = o.contactName?.toLowerCase();
          return (
            (onum?.includes(needle) ?? false) ||
            (email?.includes(needle) ?? false) ||
            (name?.includes(needle) ?? false)
          );
        });
      }
      base.sort((a, b) => b.createdAt - a.createdAt);
      const { numItems, cursor } = args.paginationOpts;
      const start = cursor ? parseInt(cursor, 10) : 0;
      const page = base.slice(start, start + numItems);
      const enrichedPage = await Promise.all(
        page.map(async (order) => {
          const items = await ctx.db
            .query("orderItems")
            .withIndex("by_order", (q) => q.eq("orderId", order._id))
            .collect();
          const user = order.userId ? await ctx.db.get(order.userId) : null;
          const address = order.addressId ? await ctx.db.get(order.addressId) : null;
          return {
            ...order,
            items,
            userName: user?.name,
            userEmail: user?.email,
            addressFormatted: address?.formatted ?? null,
          };
        })
      );
      return {
        page: enrichedPage,
        continueCursor:
          start + numItems < base.length ? String(start + numItems) : null,
        isDone: start + numItems >= base.length,
      };
    }
  },
});

/** Debug: also check users table for matching email (case-insensitive) */
export const debugEmailLookup = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const normalized = args.email.trim().toLowerCase();
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_contactEmail", (q) => q.eq("contactEmail", normalized))
      .collect();
    const allUsers = await ctx.db.query("users").collect();
    const matchingUsers = allUsers.filter(
      (u) => u.email?.toLowerCase() === normalized
    );
    return {
      orders: orders.map((o) => ({
        _id: o._id,
        orderNumber: o.orderNumber,
        contactEmail: o.contactEmail,
        userId: o.userId ?? null,
        status: o.status,
        createdAt: o.createdAt,
      })),
      usersWithMatchingEmail: matchingUsers.map((u) => ({
        _id: u._id,
        email: u.email,
        name: u.name,
        tokenIdentifier: u.tokenIdentifier?.slice(0, 50) + "...",
      })),
      allUsersSample: allUsers.slice(0, 20).map((u) => ({
        _id: u._id,
        email: u.email ?? "(empty)",
        name: u.name,
        tokenIdentifierPrefix: u.tokenIdentifier?.slice(0, 60) + (u.tokenIdentifier && u.tokenIdentifier.length > 60 ? "..." : ""),
      })),
    };
  },
});

export const updateStatus = mutation({
  args: {
    orderId: v.id("orders"),
    status: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "admin", "manager", "kitchen", "dispatcher");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    const now = Date.now();
    await ctx.db.patch(args.orderId, {
      status: args.status,
      updatedAt: now,
      lastReminderLevel: undefined,
    });
    await ctx.db.insert("orderEvents", {
      orderId: args.orderId,
      status: args.status,
      note: args.note,
      actorType: "admin",
      actorId: actor._id,
      createdAt: now,
    });

    if (NOTIFY_STATUSES.has(args.status) && (order.contactEmail || order.contactPhone)) {
      const settingsRows = await ctx.db.query("siteSettings").collect();
      const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
      const storeName = settings.storeName ?? "TheTipsyCake";
      const siteUrl = settings.siteUrl ?? "https://order.tipsycake.com";
      const smsEnabled = settings.smsEnabled !== "false";
      const rendered = await renderStatusUpdate(ctx, {
        storeName,
        orderNumber: order.orderNumber,
        status: args.status,
        carrier: order.carrier,
        trackingNumber: order.trackingNumber,
      });
      await ctx.scheduler.runAfter(0, internal.notifications.sendOrderStatusUpdate, {
        email: order.contactEmail?.trim() || undefined,
        phone: smsEnabled ? order.contactPhone?.trim() || undefined : undefined,
        orderNumber: order.orderNumber,
        orderId: order._id,
        status: args.status,
        statusLink: `${siteUrl}/orders/${order.guestToken}`,
        subjectOverride: rendered.subject,
        htmlOverride: rendered.html,
      });
    }

    if (OWNER_COMPLETE_STATUSES.has(args.status)) {
      const settingsRows = await ctx.db.query("siteSettings").collect();
      const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
      const storeEmail = settings.storeEmail?.trim();
      const notifyOwner = settings.notifyOwnerOnOrder !== "false";
      const smsEnabled = settings.smsEnabled !== "false";
      if (storeEmail && notifyOwner) {
        await ctx.scheduler.runAfter(0, internal.notifications.sendOwnerOrderComplete, {
          email: storeEmail,
          phone: smsEnabled ? settings.storePhone?.trim() || undefined : undefined,
          orderNumber: order.orderNumber,
          orderId: order._id,
          status: args.status,
          carrier: order.carrier,
          trackingNumber: order.trackingNumber,
        });
      }
    }

    return args.orderId;
  },
});

export const markReadyForDelivery = mutation({
  args: {
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "admin", "manager", "kitchen", "dispatcher");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    if (order.fulfillmentMode !== "delivery")
      throw new Error("Only delivery orders can be marked ready for delivery");
    if (order.status !== "in_production")
      throw new Error("Order must be in production to mark ready for delivery");

    const now = Date.now();
    await ctx.db.patch(args.orderId, {
      status: "ready_for_delivery",
      updatedAt: now,
      lastReminderLevel: undefined,
    });
    await ctx.db.insert("orderEvents", {
      orderId: args.orderId,
      status: "ready_for_delivery",
      note: "Ready for driver",
      actorType: "admin",
      actorId: actor._id,
      createdAt: now,
    });
    return args.orderId;
  },
});

export const assignDriver = mutation({
  args: {
    orderId: v.id("orders"),
    driverId: v.id("drivers"),
    eta: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "dispatcher", "manager");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    const existing = await ctx.db
      .query("driverAssignments")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .first();
    if (existing) throw new Error("Order already has a driver assigned");

    const now = Date.now();
    const assignmentId = await ctx.db.insert("driverAssignments", {
      orderId: args.orderId,
      driverId: args.driverId,
      status: "assigned",
      eta: args.eta,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(args.orderId, {
      status: "out_for_delivery",
      updatedAt: now,
      lastReminderLevel: undefined,
    });
    await ctx.db.insert("orderEvents", {
      orderId: args.orderId,
      status: "out_for_delivery",
      note: "Driver assigned",
      actorType: "admin",
      createdAt: now,
    });
    if (order.contactEmail || order.contactPhone) {
      const settingsRows = await ctx.db.query("siteSettings").collect();
      const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
      const storeName = settings.storeName ?? "TheTipsyCake";
      const siteUrl = settings.siteUrl ?? "https://order.tipsycake.com";
      const smsEnabled = settings.smsEnabled !== "false";
      const rendered = await renderStatusUpdate(ctx, {
        storeName,
        orderNumber: order.orderNumber,
        status: "out_for_delivery",
      });
      await ctx.scheduler.runAfter(0, internal.notifications.sendOrderStatusUpdate, {
        email: order.contactEmail?.trim() || undefined,
        phone: smsEnabled ? order.contactPhone?.trim() || undefined : undefined,
        orderNumber: order.orderNumber,
        orderId: order._id,
        status: "out_for_delivery",
        statusLink: `${siteUrl}/orders/${order.guestToken}`,
        subjectOverride: rendered.subject,
        htmlOverride: rendered.html,
      });
    }
    return assignmentId;
  },
});

export const setTracking = mutation({
  args: {
    orderId: v.id("orders"),
    carrier: v.string(),
    trackingNumber: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager", "dispatcher");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    const now = Date.now();
    await ctx.db.patch(args.orderId, {
      carrier: args.carrier,
      trackingNumber: args.trackingNumber,
      status: "shipped",
      updatedAt: now,
      lastReminderLevel: undefined,
    });

    const settingsRows = await ctx.db.query("siteSettings").collect();
    const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
    const storeEmail = settings.storeEmail?.trim();
    const notifyOwner = settings.notifyOwnerOnOrder !== "false";
    const smsEnabled = settings.smsEnabled !== "false";
    if (storeEmail && notifyOwner) {
      await ctx.scheduler.runAfter(0, internal.notifications.sendOwnerOrderComplete, {
        email: storeEmail,
        phone: smsEnabled ? settings.storePhone?.trim() || undefined : undefined,
        orderNumber: order.orderNumber,
        orderId: order._id,
        status: "shipped",
        carrier: args.carrier,
        trackingNumber: args.trackingNumber,
      });
    }

    if (order.contactEmail || order.contactPhone) {
      const storeName = settings.storeName ?? "TheTipsyCake";
      const siteUrl = settings.siteUrl ?? "https://order.tipsycake.com";
      const rendered = await renderStatusUpdate(ctx, {
        storeName,
        orderNumber: order.orderNumber,
        status: "shipped",
        carrier: args.carrier,
        trackingNumber: args.trackingNumber,
      });
      await ctx.scheduler.runAfter(0, internal.notifications.sendOrderStatusUpdate, {
        email: order.contactEmail?.trim() || undefined,
        phone: smsEnabled ? order.contactPhone?.trim() || undefined : undefined,
        orderNumber: order.orderNumber,
        orderId: order._id,
        status: "shipped",
        carrier: args.carrier,
        trackingNumber: args.trackingNumber,
        statusLink: `${siteUrl}/orders/${order.guestToken}`,
        subjectOverride: rendered.subject,
        htmlOverride: rendered.html,
      });
    }

    return args.orderId;
  },
});

/**
 * One-time: link all guest orders (contactEmail, no userId) to users with matching email.
 * Ensures customers see their full order history when signed in.
 *
 * Run from Convex Dashboard:
 *   admin.orders:linkAllGuestOrdersToUsers
 */
export const linkAllGuestOrdersToUsers = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");

    const allOrders = await ctx.db.query("orders").collect();
    const guestOrders = allOrders.filter((o) => o.contactEmail?.trim() && !o.userId);
    if (guestOrders.length === 0) {
      return { linked: 0, message: "No unlinked guest orders with email." };
    }

    const allUsers = await ctx.db.query("users").collect();
    const emailToUser = new Map<string, (typeof allUsers)[0]>();
    for (const u of allUsers) {
      const email = u.email?.trim()?.toLowerCase();
      if (email && !emailToUser.has(email)) emailToUser.set(email, u);
    }

    const now = Date.now();
    let linked = 0;
    for (const order of guestOrders) {
      const email = order.contactEmail!.trim().toLowerCase();
      const user = emailToUser.get(email);
      if (!user) continue;
      await ctx.db.patch(order._id, { userId: user._id, updatedAt: now });
      linked++;
    }

    return { linked, totalGuestWithEmail: guestOrders.length };
  },
});
