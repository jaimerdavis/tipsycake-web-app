import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

import { requireRole } from "./lib/auth";

export const myAssignments = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, "driver", "dispatcher", "admin");

    if (user.role === "dispatcher" || user.role === "admin") {
      return await ctx.db.query("driverAssignments").collect();
    }

    const driverRecord = await ctx.db
      .query("drivers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (!driverRecord) return [];

    return await ctx.db
      .query("driverAssignments")
      .withIndex("by_driver", (q) => q.eq("driverId", driverRecord._id))
      .collect();
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
