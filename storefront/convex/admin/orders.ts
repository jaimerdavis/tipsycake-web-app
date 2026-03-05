import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

import { requireRole } from "../lib/auth";

const NOTIFY_STATUSES = new Set([
  "in_production",
  "ready_for_pickup",
  "out_for_delivery",
  "delivered",
  "shipped",
  "completed",
  "canceled",
]);

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
    return orders;
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
      await ctx.scheduler.runAfter(0, internal.notifications.sendOrderStatusUpdate, {
        email: order.contactEmail,
        orderNumber: order.orderNumber,
        status: args.status,
      });
    }

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

    const now = Date.now();
    const assignmentId = await ctx.db.insert("driverAssignments", {
      orderId: args.orderId,
      driverId: args.driverId,
      status: "assigned",
      eta: args.eta,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("orderEvents", {
      orderId: args.orderId,
      status: "out_for_delivery",
      note: "Driver assigned",
      actorType: "admin",
      createdAt: now,
    });
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
      await ctx.scheduler.runAfter(0, internal.notifications.sendOrderStatusUpdate, {
        email: order.contactEmail,
        orderNumber: order.orderNumber,
        status: "shipped",
        carrier: args.carrier,
        trackingNumber: args.trackingNumber,
      });
    }

    return args.orderId;
  },
});
