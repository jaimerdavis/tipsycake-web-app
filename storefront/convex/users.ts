import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./lib/auth";

const roleValidator = v.union(
  v.literal("admin"),
  v.literal("manager"),
  v.literal("kitchen"),
  v.literal("dispatcher"),
  v.literal("driver"),
  v.literal("customer")
);

export const storeUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: identity.email ?? existing.email,
        name: identity.name ?? existing.name,
        image: identity.pictureUrl ?? existing.image,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      email: identity.email ?? "",
      name: identity.name ?? "Unknown User",
      image: identity.pictureUrl,
      role: "customer",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    return await getCurrentUser(ctx);
  },
});

export const setMyActiveStatus = mutation({
  args: {
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await ctx.db.patch(user._id, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });
    return user._id;
  },
});

export const listByRole = query({
  args: {
    role: roleValidator,
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);
    if (currentUser.role !== "admin" && currentUser.role !== "manager") {
      throw new Error("Unauthorized");
    }

    return await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", args.role))
      .collect();
  },
});
