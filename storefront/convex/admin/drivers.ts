import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

import { requireRole } from "../lib/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin", "manager", "dispatcher");
    return await ctx.db.query("drivers").collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    phone: v.string(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager", "dispatcher");
    const now = Date.now();
    return await ctx.db.insert("drivers", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    driverId: v.id("drivers"),
    name: v.string(),
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager", "dispatcher");
    await ctx.db.patch(args.driverId, {
      name: args.name,
      phone: args.phone,
      updatedAt: Date.now(),
    });
    return args.driverId;
  },
});

export const setActive = mutation({
  args: {
    driverId: v.id("drivers"),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager", "dispatcher");
    await ctx.db.patch(args.driverId, {
      active: args.active,
      updatedAt: Date.now(),
    });
    return args.driverId;
  },
});
