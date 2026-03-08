import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

const productStatus = v.union(v.literal("active"), v.literal("hidden"));

const fulfillmentFlags = v.object({
  pickup: v.boolean(),
  delivery: v.boolean(),
  shipping: v.boolean(),
});

const shapeImagesValidator = v.optional(
  v.object({
    mixed: v.optional(v.array(v.string())),
    even20: v.optional(v.array(v.string())),
    rose: v.optional(v.array(v.string())),
    blossom: v.optional(v.array(v.string())),
  })
);

export const listProducts = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin", "manager");
    return await ctx.db.query("products").collect();
  },
});

export const listGlobalModifierGroups = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin", "manager");
    const allGroups = await ctx.db.query("modifierGroups").collect();
    const groups = allGroups.filter((g) => g.productId === undefined);
    const sorted = groups.sort((a, b) => a.sortOrder - b.sortOrder);
    const result = [];
    for (const group of sorted) {
      const options = await ctx.db
        .query("modifierOptions")
        .withIndex("by_group_sort", (q) => q.eq("groupId", group._id))
        .collect();
      result.push({ ...group, options });
    }
    return result;
  },
});

export const createProduct = mutation({
  args: {
    productCode: v.optional(v.string()),
    name: v.string(),
    slug: v.string(),
    description: v.string(),
    images: v.array(v.string()),
    status: productStatus,
    categories: v.array(v.string()),
    tags: v.array(v.string()),
    basePriceCents: v.number(),
    fulfillmentFlags,
    leadTimeHoursOverride: v.optional(v.number()),
    inStockToday: v.boolean(),
    maxQtyPerOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");
    const code = args.productCode?.trim();
    if (code) {
      const existing = await ctx.db
        .query("products")
        .withIndex("by_productCode", (q) => q.eq("productCode", code))
        .first();
      if (existing) throw new Error(`Product code "${code}" is already in use`);
    }
    const now = Date.now();
    return await ctx.db.insert("products", {
      ...args,
      productCode: code || undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateProduct = mutation({
  args: {
    productId: v.id("products"),
    productCode: v.optional(v.string()),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    images: v.optional(v.array(v.string())),
    status: v.optional(productStatus),
    categories: v.optional(v.array(v.string())),
    tags: v.optional(v.array(v.string())),
    basePriceCents: v.optional(v.number()),
    fulfillmentFlags: v.optional(fulfillmentFlags),
    leadTimeHoursOverride: v.optional(v.number()),
    inStockToday: v.optional(v.boolean()),
    maxQtyPerOrder: v.optional(v.number()),
    shapeImages: shapeImagesValidator,
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");
    const { productId, productCode, ...updates } = args;
    const product = await ctx.db.get(productId);
    if (!product) throw new Error("Product not found");
    const code = productCode?.trim();
    if (code) {
      const existing = await ctx.db
        .query("products")
        .withIndex("by_productCode", (q) => q.eq("productCode", code))
        .first();
      if (existing && existing._id !== productId) {
        throw new Error(`Product code "${code}" is already in use`);
      }
    }
    await ctx.db.patch(productId, {
      ...updates,
      productCode: code || undefined,
      updatedAt: Date.now(),
    });
    return productId;
  },
});

export const deleteProduct = mutation({
  args: {
    productId: v.id("products"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const groups = await ctx.db
      .query("modifierGroups")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();

    for (const group of groups) {
      const options = await ctx.db
        .query("modifierOptions")
        .withIndex("by_group", (q) => q.eq("groupId", group._id))
        .collect();
      for (const option of options) {
        await ctx.db.delete(option._id);
      }
      await ctx.db.delete(group._id);
    }

    const variants = await ctx.db
      .query("productVariants")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();

    for (const variant of variants) {
      await ctx.db.delete(variant._id);
    }

    await ctx.db.delete(args.productId);
    return args.productId;
  },
});

export const createVariant = mutation({
  args: {
    productId: v.id("products"),
    label: v.string(),
    priceDeltaCents: v.number(),
    sku: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");
    const now = Date.now();
    return await ctx.db.insert("productVariants", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateVariant = mutation({
  args: {
    variantId: v.id("productVariants"),
    label: v.optional(v.string()),
    priceDeltaCents: v.optional(v.number()),
    sku: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");
    const { variantId, ...updates } = args;
    await ctx.db.patch(variantId, {
      ...updates,
      updatedAt: Date.now(),
    });
    return variantId;
  },
});

export const deleteVariant = mutation({
  args: {
    variantId: v.id("productVariants"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");
    await ctx.db.delete(args.variantId);
    return args.variantId;
  },
});

export const createModifierGroup = mutation({
  args: {
    /** Omit for global groups (apply to all products). */
    productId: v.optional(v.id("products")),
    name: v.string(),
    description: v.optional(v.string()),
    required: v.boolean(),
    minSelect: v.number(),
    maxSelect: v.number(),
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");
    const now = Date.now();
    return await ctx.db.insert("modifierGroups", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateModifierGroup = mutation({
  args: {
    groupId: v.id("modifierGroups"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    required: v.optional(v.boolean()),
    minSelect: v.optional(v.number()),
    maxSelect: v.optional(v.number()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");
    const { groupId, ...updates } = args;
    await ctx.db.patch(groupId, {
      ...updates,
      updatedAt: Date.now(),
    });
    return groupId;
  },
});

export const deleteModifierGroup = mutation({
  args: {
    groupId: v.id("modifierGroups"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");
    const options = await ctx.db
      .query("modifierOptions")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .collect();
    for (const option of options) {
      await ctx.db.delete(option._id);
    }
    await ctx.db.delete(args.groupId);
    return args.groupId;
  },
});

export const createModifierOption = mutation({
  args: {
    groupId: v.id("modifierGroups"),
    name: v.string(),
    priceDeltaCents: v.number(),
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");
    const now = Date.now();
    return await ctx.db.insert("modifierOptions", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateModifierOption = mutation({
  args: {
    optionId: v.id("modifierOptions"),
    name: v.optional(v.string()),
    priceDeltaCents: v.optional(v.number()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");
    const { optionId, ...updates } = args;
    await ctx.db.patch(optionId, {
      ...updates,
      updatedAt: Date.now(),
    });
    return optionId;
  },
});

export const deleteModifierOption = mutation({
  args: {
    optionId: v.id("modifierOptions"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");
    await ctx.db.delete(args.optionId);
    return args.optionId;
  },
});
