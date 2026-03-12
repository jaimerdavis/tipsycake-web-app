import { action, internalAction, internalMutation, query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { api } from "../_generated/api";
import { v } from "convex/values";

import { requireRole } from "../lib/auth";

const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 500;

/** Create a new blast, queue it for sending, and return its id. NTF-004 */
export const createBlast = action({
  args: {
    subject: v.string(),
    bodyHtml: v.string(),
    lastOrderWithinDays: v.optional(v.number()),
    /** When set, send only to this email (test mode). Skips customer recipient logic. */
    testEmail: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"emailBlasts">> => {
    const me = await ctx.runQuery(api.users.meOrNull, {});
    if (!me || typeof me !== "object" || !("role" in me) || !("_id" in me))
      throw new Error("Not authenticated");
    const role = (me as { role: string }).role;
    if (role !== "admin" && role !== "manager") throw new Error("Admin or manager role required");
    const actorId = (me as { _id: Id<"users"> })._id;

    let total: number;
    const testEmails: string[] | undefined = args.testEmail?.trim()
      ? [args.testEmail.trim()]
      : undefined;

    if (testEmails) {
      total = 1;
    } else {
      const result = await ctx.runQuery(api.admin.customers.listEmailsForBlast, {
        skip: 0,
        limit: 1,
        lastOrderWithinDays: args.lastOrderWithinDays,
      });
      total = result.total;
      if (total === 0) {
        throw new Error("No recipients match the selected filters.");
      }
    }

    const blastId = (await ctx.runMutation(internal.admin.blast.insertBlast, {
      subject: args.subject.trim(),
      bodyHtml: args.bodyHtml.trim(),
      lastOrderWithinDays: args.lastOrderWithinDays,
      isTest: !!testEmails,
      totalRecipients: total,
      actorId: String(actorId),
    })) as Id<"emailBlasts">;

    await ctx.runMutation(internal.admin.blast.auditBlastCreated, {
      blastId,
      actorId: String(actorId),
      subject: args.subject,
      totalRecipients: total,
    });

    await ctx.scheduler.runAfter(0, internal.admin.blast.processBlastBatch, {
      blastId,
      skip: 0,
      subject: args.subject.trim(),
      bodyHtml: args.bodyHtml.trim(),
      lastOrderWithinDays: args.lastOrderWithinDays,
      testEmails,
    });

    return blastId;
  },
});

/** Insert blast record. Called by createBlast action. */
export const insertBlast = internalMutation({
  args: {
    subject: v.string(),
    bodyHtml: v.string(),
    lastOrderWithinDays: v.optional(v.number()),
    isTest: v.optional(v.boolean()),
    totalRecipients: v.number(),
    actorId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("emailBlasts", {
      subject: args.subject,
      bodyHtml: args.bodyHtml,
      lastOrderWithinDays: args.lastOrderWithinDays,
      isTest: args.isTest,
      status: "pending",
      totalRecipients: args.totalRecipients,
      sentCount: 0,
      actorId: args.actorId,
      createdAt: now,
    });
  },
});

/** Audit log for blast creation. */
export const auditBlastCreated = internalMutation({
  args: {
    blastId: v.id("emailBlasts"),
    actorId: v.string(),
    subject: v.string(),
    totalRecipients: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLogs", {
      actorType: "admin",
      actorId: args.actorId,
      action: "email_blast_created",
      entityType: "emailBlasts",
      entityId: args.blastId,
      diff: { subject: args.subject, totalRecipients: args.totalRecipients },
      createdAt: Date.now(),
    });
  },
});

/** Update blast progress (sent count, status). Called by processBlastBatch. */
export const updateBlastProgress = internalMutation({
  args: {
    blastId: v.id("emailBlasts"),
    sentCount: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("sending"),
      v.literal("completed"),
      v.literal("failed")
    ),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const blast = await ctx.db.get(args.blastId);
    if (!blast) return;
    await ctx.db.patch(args.blastId, {
      sentCount: args.sentCount,
      status: args.status,
      ...(args.completedAt != null && { completedAt: args.completedAt }),
    });
  },
});

/** List recent blasts for admin UI. */
export const listBlasts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");
    return await ctx.db
      .query("emailBlasts")
      .withIndex("by_createdAt")
      .order("desc")
      .take(args.limit ?? 20);
  },
});

/** Process one batch of blast emails. Schedules next batch if needed. */
export const processBlastBatch = internalAction({
  args: {
    blastId: v.id("emailBlasts"),
    skip: v.number(),
    subject: v.string(),
    bodyHtml: v.string(),
    lastOrderWithinDays: v.optional(v.number()),
    /** When set, send only to these emails (test mode). Skips customer query. */
    testEmails: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    let emails: string[];
    let total: number;

    if (args.testEmails && args.testEmails.length > 0) {
      emails = args.testEmails.slice(args.skip, args.skip + BATCH_SIZE);
      total = args.testEmails.length;
    } else {
      const result = await ctx.runQuery(
        internal.admin.customers.listEmailsForBlastInternal,
        {
          skip: args.skip,
          limit: BATCH_SIZE,
          lastOrderWithinDays: args.lastOrderWithinDays,
        }
      );
      emails = result.emails;
      total = result.total;
    }

    await ctx.runMutation(internal.admin.blast.updateBlastProgress, {
      blastId: args.blastId,
      sentCount: args.skip,
      status: "sending",
    });

    let sent = 0;
    for (const to of emails) {
      try {
        await ctx.runAction(internal.notifications.sendEmail, {
          to,
          subject: args.subject,
          body: args.bodyHtml,
          template: "email_blast",
        });
        sent += 1;
      } catch {
        // Logged by sendEmail; continue with batch
      }
    }

    const newSentCount = args.skip + sent;
    const done = newSentCount >= total || emails.length < BATCH_SIZE;

    await ctx.runMutation(internal.admin.blast.updateBlastProgress, {
      blastId: args.blastId,
      sentCount: newSentCount,
      status: done ? "completed" : "sending",
      completedAt: done ? Date.now() : undefined,
    });

    if (!done && emails.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        BATCH_DELAY_MS,
        internal.admin.blast.processBlastBatch,
        {
          blastId: args.blastId,
          skip: newSentCount,
          subject: args.subject,
          bodyHtml: args.bodyHtml,
          lastOrderWithinDays: args.lastOrderWithinDays,
          testEmails: args.testEmails,
        }
      );
    }
  },
});

