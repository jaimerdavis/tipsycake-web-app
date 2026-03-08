import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

const uploadRecordValidator = v.object({
  storageId: v.string(),
  filename: v.string(),
  contentType: v.string(),
  size: v.number(),
});

export const listMedia = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin", "manager");
    return await ctx.db
      .query("mediaLibrary")
      .withIndex("by_createdAt")
      .order("desc")
      .take(200);
  },
});

export const registerUpload = mutation({
  args: {
    storageId: v.string(),
    filename: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");
    const now = Date.now();
    return await ctx.db.insert("mediaLibrary", {
      ...args,
      createdAt: now,
    });
  },
});

export const bulkRegisterUploads = mutation({
  args: {
    uploads: v.array(uploadRecordValidator),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");
    const now = Date.now();
    const ids: string[] = [];
    for (const u of args.uploads) {
      const id = await ctx.db.insert("mediaLibrary", {
        ...u,
        createdAt: now,
      });
      ids.push(id);
    }
    return ids;
  },
});

export const deleteMedia = mutation({
  args: {
    id: v.id("mediaLibrary"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");
    const doc = await ctx.db.get(args.id);
    if (!doc) throw new Error("Media not found");
    await ctx.storage.delete(doc.storageId as never);
    await ctx.db.delete(args.id);
    return args.id;
  },
});

export const deleteMediaBatch = mutation({
  args: {
    ids: v.array(v.id("mediaLibrary")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");
    let deleted = 0;
    for (const id of args.ids) {
      const doc = await ctx.db.get(id);
      if (doc) {
        await ctx.storage.delete(doc.storageId as never);
        await ctx.db.delete(id);
        deleted++;
      }
    }
    return deleted;
  },
});
