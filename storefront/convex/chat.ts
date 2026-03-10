/**
 * Live chat API — Convex-native, indexed queries.
 * Conversations are keyed by orderId, guestToken, or contactEmail.
 */

import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { getCurrentUser, getCurrentUserOrNull, requireRole } from "./lib/auth";

function randomAccessToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 15)}`;
}

/** Create or return conversation for a guest who provides email, name, phone. No auth. Returns accessToken for subsequent getMessages/sendMessage. */
export const createOrGetConversationForGuestByContact = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const name = args.name.trim();
    if (!email) throw new Error("Email is required");
    if (!name) throw new Error("Name is required");

    const existing = await ctx.db
      .query("chatConversations")
      .withIndex("by_contactEmail", (q) => q.eq("contactEmail", email))
      .first();

    if (existing) {
      const accessToken = randomAccessToken();
      await ctx.db.patch(existing._id, {
        accessToken,
        contactName: name,
        contactPhone: args.phone?.trim() || undefined,
        updatedAt: Date.now(),
      });
      return { conversationId: existing._id, accessToken };
    }

    const now = Date.now();
    const accessToken = randomAccessToken();
    const conversationId = await ctx.db.insert("chatConversations", {
      contactEmail: email,
      contactName: name,
      contactPhone: args.phone?.trim() || undefined,
      accessToken,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
    return { conversationId, accessToken };
  },
});

/** Create or return existing conversation for a logged-in customer. Links any guest conversation with matching email (Clerk/Convex integration). */
export const createOrGetConversationForUser = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (["admin", "manager", "dispatcher"].includes(user.role)) {
      throw new Error("Staff should use the admin chat page");
    }

    const existingByUserId = await ctx.db
      .query("chatConversations")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();
    if (existingByUserId) return existingByUserId._id;

    const userEmail = user.email?.trim().toLowerCase();
    if (userEmail) {
      const existingByEmail = await ctx.db
        .query("chatConversations")
        .withIndex("by_contactEmail", (q) => q.eq("contactEmail", userEmail))
        .first();
      if (existingByEmail && !existingByEmail.userId) {
        await ctx.db.patch(existingByEmail._id, {
          userId: user._id,
          accessToken: undefined,
          updatedAt: Date.now(),
        });
        return existingByEmail._id;
      }
    }

    const now = Date.now();
    return await ctx.db.insert("chatConversations", {
      userId: user._id,
      contactEmail: user.email ?? undefined,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Create or return existing conversation for a guest (by guestToken from order tracking URL). */
export const createOrGetConversationForGuest = mutation({
  args: {
    guestToken: v.string(),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db
      .query("orders")
      .withIndex("by_guestToken", (q) => q.eq("guestToken", args.guestToken))
      .unique();
    if (!order) throw new Error("Order not found");

    const existing = await ctx.db
      .query("chatConversations")
      .withIndex("by_guestToken", (q) => q.eq("guestToken", args.guestToken))
      .first();
    if (existing) return existing._id;

    const now = Date.now();
    return await ctx.db.insert("chatConversations", {
      orderId: order._id,
      guestToken: args.guestToken,
      contactEmail: order.contactEmail,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Staff: list open conversations by recent activity. */
export const listConversations = query({
  args: {
    status: v.optional(v.union(v.literal("open"), v.literal("closed"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager", "dispatcher");
    const limit = args.limit ?? 50;
    const status = args.status ?? "open";

    const conversations = await ctx.db
      .query("chatConversations")
      .withIndex("by_status_updatedAt", (q) => q.eq("status", status))
      .order("desc")
      .take(limit);

    return conversations;
  },
});

/** Get messages for a conversation. Caller must have access (guestToken, accessToken, userId, or staff). */
export const getMessages = query({
  args: {
    conversationId: v.id("chatConversations"),
    guestToken: v.optional(v.string()),
    accessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) return [];

    const user = await getCurrentUserOrNull(ctx);
    const isStaff = user ? ["admin", "manager", "dispatcher"].includes(user.role) : false;
    if (isStaff) {
      return await ctx.db
        .query("chatMessages")
        .withIndex("by_conversation_createdAt", (q) =>
          q.eq("conversationId", args.conversationId)
        )
        .order("asc")
        .collect();
    }

    if (args.guestToken && conv.guestToken === args.guestToken) {
      return await ctx.db
        .query("chatMessages")
        .withIndex("by_conversation_createdAt", (q) =>
          q.eq("conversationId", args.conversationId)
        )
        .order("asc")
        .collect();
    }

    if (user && conv.userId === user._id) {
      return await ctx.db
        .query("chatMessages")
        .withIndex("by_conversation_createdAt", (q) =>
          q.eq("conversationId", args.conversationId)
        )
        .order("asc")
        .collect();
    }

    if (args.accessToken && conv.accessToken === args.accessToken) {
      return await ctx.db
        .query("chatMessages")
        .withIndex("by_conversation_createdAt", (q) =>
          q.eq("conversationId", args.conversationId)
        )
        .order("asc")
        .collect();
    }

    return [];
  },
});

/** Send a message. Customer uses guestToken, accessToken, or auth; staff uses auth. */
export const sendMessage = mutation({
  args: {
    conversationId: v.id("chatConversations"),
    body: v.string(),
    guestToken: v.optional(v.string()),
    accessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const body = args.body.trim();
    if (!body) throw new Error("Message body cannot be empty");

    const conv = await ctx.db.get(args.conversationId);
    if (!conv) throw new Error("Conversation not found");

    let authorType: "customer" | "staff";
    let authorId: Id<"users"> | undefined;

    const user = await getCurrentUserOrNull(ctx);
    if (user != null && ["admin", "manager", "dispatcher"].includes(user.role)) {
      authorType = "staff";
      authorId = user._id;
    } else if (args.guestToken && conv.guestToken === args.guestToken) {
      authorType = "customer";
    } else if (args.accessToken && conv.accessToken === args.accessToken) {
      authorType = "customer";
    } else if (user && conv.userId === user._id) {
      authorType = "customer";
      authorId = user._id;
    } else {
      throw new Error("Unauthorized to send in this conversation");
    }

    const now = Date.now();
    await ctx.db.insert("chatMessages", {
      conversationId: args.conversationId,
      authorType,
      authorId,
      body,
      createdAt: now,
    });

    await ctx.db.patch(args.conversationId, {
      status: "open",
      updatedAt: now,
    });

    return { ok: true };
  },
});

/** Staff: close a conversation. */
export const closeConversation = mutation({
  args: { conversationId: v.id("chatConversations") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager", "dispatcher");
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) throw new Error("Conversation not found");

    const now = Date.now();
    await ctx.db.patch(args.conversationId, {
      status: "closed",
      updatedAt: now,
    });
    return args.conversationId;
  },
});
