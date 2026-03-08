import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

import { requireRole } from "../lib/auth";
import { renderStatusUpdate } from "../lib/emailTemplates";

const NOTIFY_STATUSES = new Set([
  "in_production",
  "ready_for_pickup",
  "out_for_delivery",
  "delivered",
  "shipped",
  "completed",
  "canceled",
]);

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
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager", "kitchen", "dispatcher");
    let orders = await ctx.db.query("orders").collect();
    if (args.status) {
      orders = orders.filter((order) => order.status === args.status);
    }
    if (args.fulfillmentMode) {
      orders = orders.filter((order) => order.fulfillmentMode === args.fulfillmentMode);
    }
    orders.sort((a, b) => b.createdAt - a.createdAt);

    return await Promise.all(
      orders.map(async (order) => {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();
        const user = order.userId
          ? await ctx.db.get(order.userId)
          : null;
        return {
          ...order,
          items,
          userName: user?.name,
          userEmail: user?.email,
        };
      })
    );
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
    });
    await ctx.db.insert("orderEvents", {
      orderId: args.orderId,
      status: args.status,
      note: args.note,
      actorType: "admin",
      actorId: actor._id,
      createdAt: now,
    });

    if (NOTIFY_STATUSES.has(args.status) && order.contactEmail) {
      const settingsRows = await ctx.db.query("siteSettings").collect();
      const storeName = Object.fromEntries(settingsRows.map((r) => [r.key, r.value])).storeName ?? "TheTipsyCake";
      const rendered = await renderStatusUpdate(ctx, {
        storeName,
        orderNumber: order.orderNumber,
        status: args.status,
      });
      await ctx.scheduler.runAfter(0, internal.notifications.sendOrderStatusUpdate, {
        email: order.contactEmail,
        orderNumber: order.orderNumber,
        status: args.status,
        subjectOverride: rendered.subject,
        htmlOverride: rendered.html,
      });
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
    });
    await ctx.db.insert("orderEvents", {
      orderId: args.orderId,
      status: "out_for_delivery",
      note: "Driver assigned",
      actorType: "admin",
      createdAt: now,
    });
    if (order.contactEmail) {
      const settingsRows = await ctx.db.query("siteSettings").collect();
      const storeName = Object.fromEntries(settingsRows.map((r) => [r.key, r.value])).storeName ?? "TheTipsyCake";
      const rendered = await renderStatusUpdate(ctx, {
        storeName,
        orderNumber: order.orderNumber,
        status: "out_for_delivery",
      });
      await ctx.scheduler.runAfter(0, internal.notifications.sendOrderStatusUpdate, {
        email: order.contactEmail,
        orderNumber: order.orderNumber,
        status: "out_for_delivery",
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

    await ctx.db.patch(args.orderId, {
      carrier: args.carrier,
      trackingNumber: args.trackingNumber,
      status: "shipped",
      updatedAt: Date.now(),
    });

    if (order.contactEmail) {
      const settingsRows = await ctx.db.query("siteSettings").collect();
      const storeName = Object.fromEntries(settingsRows.map((r) => [r.key, r.value])).storeName ?? "TheTipsyCake";
      const rendered = await renderStatusUpdate(ctx, {
        storeName,
        orderNumber: order.orderNumber,
        status: "shipped",
        carrier: args.carrier,
        trackingNumber: args.trackingNumber,
      });
      await ctx.scheduler.runAfter(0, internal.notifications.sendOrderStatusUpdate, {
        email: order.contactEmail,
        orderNumber: order.orderNumber,
        status: "shipped",
        carrier: args.carrier,
        trackingNumber: args.trackingNumber,
        subjectOverride: rendered.subject,
        htmlOverride: rendered.html,
      });
    }

    return args.orderId;
  },
});
