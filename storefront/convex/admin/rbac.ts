import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";
import { writeAuditLog } from "../lib/auditLog";

const roleValidator = v.union(
  v.literal("admin"),
  v.literal("manager"),
  v.literal("kitchen"),
  v.literal("dispatcher"),
  v.literal("driver"),
  v.literal("customer")
);

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin", "manager");
    return await ctx.db.query("users").collect();
  },
});

export const setUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: roleValidator,
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "admin");
    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) {
      throw new Error("User not found");
    }

    const previousRole = targetUser.role;
    await ctx.db.patch(args.userId, {
      role: args.role,
      updatedAt: Date.now(),
    });

    await writeAuditLog(ctx, {
      actorType: "admin",
      actorId: actor._id,
      action: "admin.user_role.updated",
      entityType: "users",
      entityId: args.userId,
      diff: {
        role: {
          from: previousRole,
          to: args.role,
        },
      },
    });

    return args.userId;
  },
});

export const setUserActiveState = mutation({
  args: {
    userId: v.id("users"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "admin", "manager");
    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) {
      throw new Error("User not found");
    }

    await ctx.db.patch(args.userId, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });

    await writeAuditLog(ctx, {
      actorType: "admin",
      actorId: actor._id,
      action: "admin.user_active_state.updated",
      entityType: "users",
      entityId: args.userId,
      diff: {
        isActive: {
          from: targetUser.isActive,
          to: args.isActive,
        },
      },
    });

    return args.userId;
  },
});
