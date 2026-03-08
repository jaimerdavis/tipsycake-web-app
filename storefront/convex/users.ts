import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getCurrentUser, getCurrentUserOrNull } from "./lib/auth";

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

    const userId = await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      email: identity.email ?? "",
      name: identity.name ?? "Unknown User",
      image: identity.pictureUrl,
      role: "customer",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.loyalty.awardSignupBonus, {
      userId,
    });
    return userId;
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    return await getCurrentUser(ctx);
  },
});

/** Returns current user or null when not authenticated. Use for optional pre-fill (e.g. checkout contact). */
export const meOrNull = query({
  args: {},
  handler: async (ctx) => {
    return await getCurrentUserOrNull(ctx);
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

/** Debug: session state for order-account linking. Call from account page or admin to diagnose. */
export const debugSessionState = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const tokenIdentifier = identity.tokenIdentifier;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .unique();

    // Replicate extraction logic to see if we could get clerkUserId
    const clerkUserId =
      tokenIdentifier.includes("|")
        ? tokenIdentifier.split("|").pop() ?? tokenIdentifier
        : tokenIdentifier.includes("#")
          ? tokenIdentifier.split("#").pop() ?? tokenIdentifier
          : tokenIdentifier;
    const wouldSyncHaveEmail =
      clerkUserId.length > 0 && clerkUserId.startsWith("user_");

    return {
      tokenIdentifier: tokenIdentifier.slice(0, 60) + (tokenIdentifier.length > 60 ? "..." : ""),
      userEmail: user?.email ?? null,
      userId: user?._id ?? null,
      identityEmail: (identity as { email?: string }).email ?? null,
      clerkUserIdExtracted: clerkUserId,
      wouldSyncHaveEmail,
    };
  },
});

/** Internal: update Convex user email by tokenIdentifier. Called from syncUserEmailFromClerk action. */
export const updateEmailByToken = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", args.tokenIdentifier))
      .unique();
    if (!user) return;
    const normalized = args.email.trim().toLowerCase();
    if (!normalized) return;
    await ctx.db.patch(user._id, { email: normalized, updatedAt: Date.now() });
  },
});
