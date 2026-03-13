import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

import { internal } from "./_generated/api";
import { requireRole } from "./lib/auth";
import { renderOwnerOrderComplete, renderStatusUpdate } from "./lib/emailTemplates";

/**
 * Orders available for drivers to claim. Delivery mode, ready_for_delivery, no assignment.
 * Driver-only (TRK-003 extension).
 */
export const availableForClaim = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, "driver");
    const driverRecord = await ctx.db
      .query("drivers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!driverRecord || !driverRecord.active) return [];

    const orders = await ctx.db
      .query("orders")
      .filter((q) =>
        q.and(
          q.eq(q.field("fulfillmentMode"), "delivery"),
          q.eq(q.field("status"), "ready_for_delivery")
        )
      )
      .collect();

    const result: Array<{
      _id: Id<"orders">;
      orderNumber: string;
      pricingSnapshot: { totalCents: number };
      addressFormatted: string | null;
      contactPhone: string | null;
    }> = [];

    for (const order of orders) {
      const existing = await ctx.db
        .query("driverAssignments")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .first();
      if (existing) continue;

      let addressFormatted: string | null = null;
      if (order.addressId) {
        const addr = await ctx.db.get(order.addressId);
        if (addr) addressFormatted = addr.formatted;
      }

      result.push({
        _id: order._id,
        orderNumber: order.orderNumber,
        pricingSnapshot: order.pricingSnapshot,
        addressFormatted,
        contactPhone: order.contactPhone ?? null,
      });
    }

    return result;
  },
});

/**
 * Driver claims an order from the available queue. Creates assignment, sets out_for_delivery.
 * Fails if already assigned or not ready_for_delivery (concurrency-safe).
 */
export const claimOrder = mutation({
  args: {
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "driver");
    const driverRecord = await ctx.db
      .query("drivers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!driverRecord) throw new Error("Driver record not found");
    if (!driverRecord.active) throw new Error("Driver account is inactive");

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    if (order.fulfillmentMode !== "delivery")
      throw new Error("Only delivery orders can be claimed");
    if (order.status !== "ready_for_delivery")
      throw new Error("Order is not ready for delivery. Another driver may have claimed it.");

    const existing = await ctx.db
      .query("driverAssignments")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .first();
    if (existing)
      throw new Error("Order was already claimed by another driver");

    const now = Date.now();
    const assignmentId = await ctx.db.insert("driverAssignments", {
      orderId: args.orderId,
      driverId: driverRecord._id,
      status: "assigned",
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
      note: "Driver claimed",
      actorType: "driver",
      actorId: user._id,
      createdAt: now,
    });

    if (order.contactEmail || order.contactPhone) {
      const settingsRows = await ctx.db.query("siteSettings").collect();
      const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
      const storeName = settings.storeName ?? "TheTipsyCake";
      const siteUrl = settings.siteUrl ?? "https://order.thetipsycake.com";
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

export const myAssignments = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, "driver", "dispatcher", "admin");

    let raw: Doc<"driverAssignments">[];
    if (user.role === "dispatcher" || user.role === "admin") {
      raw = await ctx.db.query("driverAssignments").collect();
    } else {
      const driverRecord = await ctx.db
        .query("drivers")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .unique();
      if (!driverRecord) return [];
      raw = await ctx.db
        .query("driverAssignments")
        .withIndex("by_driver", (q) => q.eq("driverId", driverRecord._id))
        .collect();
    }

    const result = await Promise.all(
      raw.map(async (a: Doc<"driverAssignments">) => {
        const order = (await ctx.db.get(a.orderId)) as Doc<"orders"> | null;
        let destination: { lat: number; lng: number; formatted?: string } | null = null;
        if (order?.addressId) {
          const addr = (await ctx.db.get(order.addressId)) as
            | { lat: number; lng: number; formatted: string }
            | null;
          if (addr)
            destination = { lat: addr.lat, lng: addr.lng, formatted: addr.formatted };
        }
        return {
          ...a,
          orderNumber: order?.orderNumber ?? "?",
          destination,
          contactPhone: order?.contactPhone ?? null,
          addressFormatted: destination?.formatted ?? null,
        };
      })
    );
    return result;
  },
});

export const updateStatus = mutation({
  args: {
    assignmentId: v.id("driverAssignments"),
    status: v.union(v.literal("assigned"), v.literal("en_route"), v.literal("delivered")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "driver", "dispatcher", "admin");
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) throw new Error("Assignment not found");

    const now = Date.now();
    await ctx.db.patch(args.assignmentId, {
      status: args.status,
      updatedAt: now,
    });

    await ctx.db.insert("orderEvents", {
      orderId: assignment.orderId,
      status: args.status === "delivered" ? "delivered" : "out_for_delivery",
      actorType: "driver",
      createdAt: now,
    });
    if (args.status === "delivered") {
      await ctx.db.patch(assignment.orderId, {
        status: "delivered",
        updatedAt: now,
        lastReminderLevel: undefined,
      });
      const order = await ctx.db.get(assignment.orderId);
      if (order) {
        const settingsRows = await ctx.db.query("siteSettings").collect();
        const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
        const smsEnabled = settings.smsEnabled !== "false";
        const storeName = settings.storeName ?? "TheTipsyCake";
        const siteUrl = settings.siteUrl ?? "https://order.thetipsycake.com";
        if (order.contactEmail || order.contactPhone) {
          const rendered = await renderStatusUpdate(ctx, {
            storeName,
            orderNumber: order.orderNumber,
            status: "delivered",
          });
          await ctx.scheduler.runAfter(0, internal.notifications.sendOrderStatusUpdate, {
            email: order.contactEmail?.trim() || undefined,
            phone: smsEnabled ? order.contactPhone?.trim() || undefined : undefined,
            orderNumber: order.orderNumber,
            orderId: order._id,
            status: "delivered",
            statusLink: `${siteUrl}/orders/${order.guestToken}`,
            subjectOverride: rendered.subject,
            htmlOverride: rendered.html,
          });
        }
        const storeEmail = settings.storeEmail?.trim();
        const notifyOwner = settings.notifyOwnerOnOrder !== "false";
        if (storeEmail && notifyOwner) {
          const rendered = await renderOwnerOrderComplete(ctx, {
            siteUrl,
            orderNumber: order.orderNumber,
            status: "delivered",
            orderId: order._id,
          });
          await ctx.scheduler.runAfter(0, internal.notifications.sendOwnerOrderComplete, {
            email: storeEmail,
            phone: smsEnabled ? settings.storePhone?.trim() || undefined : undefined,
            orderNumber: order.orderNumber,
            orderId: order._id,
            status: "delivered",
            subjectOverride: rendered.subject,
            htmlOverride: rendered.html,
          });
        }
      }
    }
    return args.assignmentId;
  },
});

export const pingLocation = mutation({
  args: {
    assignmentId: v.id("driverAssignments"),
    lat: v.number(),
    lng: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "driver", "dispatcher", "admin");
    await ctx.db.insert("driverLocations", {
      assignmentId: args.assignmentId,
      lat: args.lat,
      lng: args.lng,
      createdAt: Date.now(),
    });
    return args.assignmentId;
  },
});

export const uploadProofOfDelivery = mutation({
  args: {
    assignmentId: v.id("driverAssignments"),
    storageId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "driver", "dispatcher", "admin");
    await ctx.db.insert("proofOfDeliveryFiles", {
      assignmentId: args.assignmentId,
      storageId: args.storageId,
      createdAt: Date.now(),
    });
    return args.assignmentId;
  },
});
