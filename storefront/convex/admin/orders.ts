import { mutation, query } from "../_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

import { requireRole } from "../lib/auth";
import { renderStatusUpdate } from "../lib/emailTemplates";

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
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager", "kitchen", "dispatcher");

    let paginated;
    if (args.status && args.fulfillmentMode) {
      paginated = await ctx.db
        .query("orders")
        .withIndex("by_status_fulfillmentMode_createdAt", (q) =>
          q.eq("status", args.status!).eq("fulfillmentMode", args.fulfillmentMode!)
        )
        .order("desc")
        .paginate(args.paginationOpts);
    } else if (args.status) {
      paginated = await ctx.db
        .query("orders")
        .withIndex("by_status_createdAt", (q) => q.eq("status", args.status!))
        .order("desc")
        .paginate(args.paginationOpts);
    } else if (args.fulfillmentMode) {
      paginated = await ctx.db
        .query("orders")
        .withIndex("by_fulfillmentMode_createdAt", (q) =>
          q.eq("fulfillmentMode", args.fulfillmentMode!)
        )
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      paginated = await ctx.db
        .query("orders")
        .withIndex("by_createdAt")
        .order("desc")
        .paginate(args.paginationOpts);
    }

    const enrichedPage = await Promise.all(
      paginated.page.map(async (order) => {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();
        const user = order.userId ? await ctx.db.get(order.userId) : null;
        return {
          ...order,
          items,
          userName: user?.name,
          userEmail: user?.email,
        };
      })
    );

    return {
      ...paginated,
      page: enrichedPage,
    };
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
      const rendered = await renderStatusUpdate(ctx, {
        storeName,
        orderNumber: order.orderNumber,
        status: args.status,
        carrier: order.carrier,
        trackingNumber: order.trackingNumber,
      });
      await ctx.scheduler.runAfter(0, internal.notifications.sendOrderStatusUpdate, {
        email: order.contactEmail?.trim() || undefined,
        phone: order.contactPhone?.trim() || undefined,
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
      if (storeEmail && notifyOwner) {
        await ctx.scheduler.runAfter(0, internal.notifications.sendOwnerOrderComplete, {
          email: storeEmail,
          phone: settings.storePhone?.trim() || undefined,
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
      const rendered = await renderStatusUpdate(ctx, {
        storeName,
        orderNumber: order.orderNumber,
        status: "out_for_delivery",
      });
      await ctx.scheduler.runAfter(0, internal.notifications.sendOrderStatusUpdate, {
        email: order.contactEmail?.trim() || undefined,
        phone: order.contactPhone?.trim() || undefined,
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
    if (storeEmail && notifyOwner) {
      await ctx.scheduler.runAfter(0, internal.notifications.sendOwnerOrderComplete, {
        email: storeEmail,
        phone: settings.storePhone?.trim() || undefined,
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
        phone: order.contactPhone?.trim() || undefined,
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
