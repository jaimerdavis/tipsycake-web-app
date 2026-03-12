"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import Stripe from "stripe";
import { internal } from "./_generated/api";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

/**
 * Migrate existing Stripe Customers into Convex users.
 * Links Stripe Customer IDs to Convex users by matching email.
 * Can get stuck/timeout if you have many Stripe customers — use linkStripeForUsersWithoutId instead.
 *
 * Run: npx convex run migrateStripeCustomers:run '{}'
 * Or with limit: npx convex run migrateStripeCustomers:run '{"limit": 500}'
 */
export const run = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const stripeSecret = requireEnv("STRIPE_SECRET_KEY");
    const stripe = new Stripe(stripeSecret);

    let linked = 0;
    let skipped = 0;
    let notFound = 0;
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const list = await stripe.customers.list({
        limit: 100,
        ...(startingAfter && { starting_after: startingAfter }),
      });

      for (const customer of list.data) {
        const email = customer.email?.trim()?.toLowerCase();
        if (!email) {
          skipped++;
          continue;
        }

        const match = await ctx.runQuery(internal.users.getUserByEmailForMigration, {
          email,
        });
        if (!match) {
          notFound++;
          continue;
        }

        await ctx.runMutation(internal.users.setStripeCustomerId, {
          userId: match.userId,
          stripeCustomerId: customer.id,
        });
        linked++;
      }

      hasMore = list.has_more;
      if (list.data.length > 0) {
        startingAfter = list.data[list.data.length - 1].id;
      }

      if (args.limit && linked + skipped + notFound >= args.limit) break;
    }

    return { linked, skipped, notFound };
  },
});

/**
 * User-first migration: process Convex users without stripeCustomerId, look up Stripe by email.
 * Fast for ~100 users (one Stripe API call each). Use instead of run() when it gets stuck.
 *
 * Run: npx convex run migrateStripeCustomers:linkStripeForUsersWithoutId '{}'
 * Or with limit: npx convex run migrateStripeCustomers:linkStripeForUsersWithoutId '{"limit": 50}'
 */
export const linkStripeForUsersWithoutId = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) return { ok: false, error: "STRIPE_SECRET_KEY not set" };

    const users = await ctx.runQuery(internal.users.listUsersWithoutStripeCustomerId, {
      limit: args.limit ?? 200,
    });
    if (users.length === 0) return { ok: true, linked: 0, processed: 0 };

    const stripe = new Stripe(stripeSecret);
    let linked = 0;

    for (const { userId, email } of users) {
      const list = await stripe.customers.list({ email, limit: 1 });
      if (list.data.length > 0) {
        await ctx.runMutation(internal.users.setStripeCustomerId, {
          userId,
          stripeCustomerId: list.data[0].id,
        });
        linked++;
      }
    }

    return { ok: true, linked, processed: users.length };
  },
});

/**
 * Look up Stripe Customer by email and link to a Convex user.
 * Called from storeUser when linking by email (import user) or when user lacks stripeCustomerId.
 */
export const linkStripeCustomerForUserByEmail = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const existing = await ctx.runQuery(internal.users.getStripeCustomerIdForUser, {
      userId: args.userId,
    });
    if (existing?.stripeCustomerId) return;

    const user = await ctx.runQuery(internal.users.getUserForStripeCustomer, {
      userId: args.userId,
    });
    if (!user?.email?.trim()) return;

    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) return;

    const stripe = new Stripe(stripeSecret);
    const email = user.email.trim().toLowerCase();
    const list = await stripe.customers.list({ email, limit: 1 });

    if (list.data.length === 0) return;

    await ctx.runMutation(internal.users.setStripeCustomerId, {
      userId: args.userId,
      stripeCustomerId: list.data[0].id,
    });
  },
});
