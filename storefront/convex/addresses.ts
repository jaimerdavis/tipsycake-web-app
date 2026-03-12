import { mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

async function resolveOwner(
  ctx: QueryCtx | MutationCtx,
  guestSessionId?: string
): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity && typeof identity === "object" && identity !== null) {
    const tokenIdentifier = (identity as { tokenIdentifier?: string }).tokenIdentifier;
    if (tokenIdentifier) return tokenIdentifier;
  }
  return guestSessionId ?? null;
}

export const getAddressById = query({
  args: { addressId: v.id("addresses") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.addressId);
  },
});

export const listAddresses = query({
  args: {
    guestSessionId: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx, args.guestSessionId);
    const seen = new Set<string>();
    const result: Awaited<ReturnType<typeof ctx.db.get>>[] = [];

    if (ownerId) {
      const owned = await ctx.db
        .query("addresses")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .collect();
      for (const a of owned) {
        result.push(a);
        seen.add(a._id);
      }
    }

    if (args.contactEmail?.trim()) {
      const emailKey = `email:${args.contactEmail.trim().toLowerCase()}`;
      const byEmail = await ctx.db
        .query("addresses")
        .withIndex("by_owner", (q) => q.eq("ownerId", emailKey))
        .collect();
      for (const a of byEmail) {
        if (!seen.has(a._id)) {
          result.push(a);
          seen.add(a._id);
        }
      }
    }

    return result;
  },
});

export const createAddress = mutation({
  args: {
    ownerId: v.optional(v.string()),
    formatted: v.string(),
    line1: v.string(),
    line2: v.optional(v.string()),
    city: v.string(),
    state: v.string(),
    zip: v.string(),
    lat: v.number(),
    lng: v.number(),
    placeId: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx, args.ownerId ?? undefined) ?? args.ownerId;
    if (!ownerId) throw new Error("Owner required");
    const { ownerId: _omit, ...rest } = args;
    const addressId = await ctx.db.insert("addresses", {
      ...rest,
      ownerId,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, api.maps.computeDistanceAndZone, { addressId });
    return addressId;
  },
});

export const deleteAddress = mutation({
  args: {
    addressId: v.id("addresses"),
    guestSessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveOwner(ctx, args.guestSessionId);
    if (!ownerId) throw new Error("Not authorized");
    const addr = await ctx.db.get(args.addressId);
    if (!addr) throw new Error("Address not found");
    if (addr.ownerId !== ownerId) throw new Error("Not your address");
    await ctx.db.delete(args.addressId);
    return { deleted: args.addressId };
  },
});

export const listDeliveryZones = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("deliveryZones").collect();
  },
});

export const upsertAddressCache = mutation({
  args: {
    addressId: v.id("addresses"),
    distanceMiles: v.number(),
    zoneId: v.optional(v.id("deliveryZones")),
    eligibleDelivery: v.boolean(),
    eligibleShipping: v.boolean(),
    computedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("addressCache")
      .withIndex("by_address", (q) => q.eq("addressId", args.addressId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args });
      return existing._id;
    }
    return await ctx.db.insert("addressCache", args);
  },
});
