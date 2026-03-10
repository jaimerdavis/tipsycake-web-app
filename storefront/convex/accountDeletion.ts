import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const getUserForDeletion = internalQuery({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", args.tokenIdentifier))
      .unique();
  },
});

export const deleteUserData = internalMutation({
  args: {
    userId: v.id("users"),
    tokenIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId, tokenIdentifier } = args;
    const now = Date.now();

    const loyaltyAccount = await ctx.db
      .query("loyaltyAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (loyaltyAccount) {
      const ledgerEntries = await ctx.db
        .query("pointsLedger")
        .withIndex("by_account", (q) => q.eq("accountId", loyaltyAccount._id))
        .collect();
      for (const e of ledgerEntries) {
        await ctx.db.delete(e._id);
      }
      await ctx.db.delete(loyaltyAccount._id);
    }

    const bonusClaims = await ctx.db
      .query("bonusClaims")
      .withIndex("by_user_type", (q) => q.eq("userId", userId))
      .collect();
    for (const b of bonusClaims) {
      await ctx.db.delete(b._id);
    }

    const triviaCompletions = await ctx.db
      .query("triviaDailyCompletions")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .collect();
    for (const t of triviaCompletions) {
      await ctx.db.delete(t._id);
    }

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    for (const o of orders) {
      await ctx.db.patch(o._id, { userId: undefined, updatedAt: now });
    }

    const carts = await ctx.db
      .query("carts")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerType", "user").eq("ownerId", tokenIdentifier).eq("status", "active")
      )
      .collect();
    for (const c of carts) {
      await ctx.db.patch(c._id, {
        status: "abandoned",
        updatedAt: now,
      });
    }

    const addresses = await ctx.db
      .query("addresses")
      .withIndex("by_owner", (q) => q.eq("ownerId", tokenIdentifier))
      .collect();
    for (const a of addresses) {
      await ctx.db.delete(a._id);
    }

    const driversWithUser = await ctx.db
      .query("drivers")
      .filter((q) => q.eq(q.field("userId"), userId))
      .collect();
    for (const d of driversWithUser) {
      await ctx.db.patch(d._id, { userId: undefined, updatedAt: now });
    }

    await ctx.db.delete(userId);
    return { deleted: true };
  },
});
