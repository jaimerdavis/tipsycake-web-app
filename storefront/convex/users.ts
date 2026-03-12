import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
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
    const tokenIdentifier = identity.tokenIdentifier;

    const claimAddressesOnSignIn = async (email: string) => {
      const norm = email?.trim()?.toLowerCase();
      if (!norm) return;
      for (const ownerKey of [`email:${norm}`, `import:${norm}`]) {
        const addrs = await ctx.db
          .query("addresses")
          .withIndex("by_owner", (q) => q.eq("ownerId", ownerKey))
          .collect();
        for (const a of addrs) {
          await ctx.db.patch(a._id, { ownerId: tokenIdentifier });
        }
      }
    };

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: identity.email ?? existing.email,
        name: identity.name ?? existing.name,
        image: identity.pictureUrl ?? existing.image,
        updatedAt: now,
      });
      await claimAddressesOnSignIn(identity.email ?? existing.email ?? "");
      if (!existing.stripeCustomerId) {
        await ctx.scheduler.runAfter(0, internal.migrateStripeCustomers.linkStripeCustomerForUserByEmail, {
          userId: existing._id,
        });
      }
      return existing._id;
    }

    // Link by email: when switching Clerk instances (dev→prod) or re-auth, claim existing
    // user to preserve order history, roles, loyalty, etc.
    const rawEmail = identity.email?.trim();
    if (rawEmail) {
      const normalized = rawEmail.toLowerCase();
      const byEmail = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", normalized))
        .unique();
      if (byEmail) {
        await ctx.db.patch(byEmail._id, {
          tokenIdentifier,
          email: normalized,
          name: identity.name ?? byEmail.name,
          image: identity.pictureUrl ?? byEmail.image,
          updatedAt: now,
        });
        await claimAddressesOnSignIn(normalized);
        if (!byEmail.stripeCustomerId) {
          await ctx.scheduler.runAfter(0, internal.migrateStripeCustomers.linkStripeCustomerForUserByEmail, {
            userId: byEmail._id,
          });
        }
        return byEmail._id;
      }
    }

    const userId = await ctx.db.insert("users", {
      tokenIdentifier,
      email: (identity.email ?? "").trim().toLowerCase(),
      name: identity.name ?? "Unknown User",
      image: identity.pictureUrl,
      role: "customer",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    await claimAddressesOnSignIn(identity.email ?? "");
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

/**
 * Internal: promote a user to admin by email. Run from Convex Dashboard (Functions > Run)
 * or: npx convex run users:promoteToAdminByEmail '{"email":"user@example.com"}'
 */
export const promoteToAdminByEmail = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const normalized = args.email.trim().toLowerCase();
    if (!normalized) throw new Error("Email is required");
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .unique();
    if (!user) throw new Error(`User not found: ${args.email}`);
    await ctx.db.patch(user._id, { role: "admin", updatedAt: Date.now() });
    return { userId: user._id, email: user.email };
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

/** Internal: return email/name for Stripe Customer creation. Called from createPaymentIntent. */
export const getUserForStripeCustomer = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    return { email: user.email, name: user.name };
  },
});

/** Internal: list users without stripeCustomerId for Stripe migration. */
export const listUsersWithoutStripeCustomerId = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("users").collect();
    return all
      .filter((u) => !u.stripeCustomerId && u.email?.trim())
      .slice(0, args.limit ?? 200)
      .map((u) => ({ userId: u._id, email: u.email!.trim().toLowerCase() }));
  },
});

/** Internal: get user by email for Stripe migration. */
export const getUserByEmailForMigration = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const normalized = args.email.trim().toLowerCase();
    if (!normalized) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .unique();
    if (user) return { userId: user._id };
    // Fallback: case-insensitive match when stored email has different casing (e.g. from Clerk)
    const all = await ctx.db.query("users").collect();
    const match = all.find((u) => u.email?.trim()?.toLowerCase() === normalized);
    return match ? { userId: match._id } : null;
  },
});

/** Internal: get stripeCustomerId for a user. Used by admin payment method actions. */
export const getStripeCustomerIdForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user?.stripeCustomerId) return null;
    return { stripeCustomerId: user.stripeCustomerId };
  },
});

/** Internal: set Stripe Customer ID for saved payments. Called from createPaymentIntent. */
export const setStripeCustomerId = internalMutation({
  args: {
    userId: v.id("users"),
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return;
    await ctx.db.patch(args.userId, {
      stripeCustomerId: args.stripeCustomerId,
      updatedAt: Date.now(),
    });
  },
});
