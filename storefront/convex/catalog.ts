import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";

export const listProducts = query({
  args: {
    status: v.optional(v.union(v.literal("active"), v.literal("hidden"))),
    category: v.optional(v.string()),
    tag: v.optional(v.string()),
    inStockTodayOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const baseProducts = args.status
      ? await ctx.db
          .query("products")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .collect()
      : await ctx.db.query("products").collect();

    return baseProducts.filter((product) => {
      if (args.category && !product.categories.includes(args.category)) {
        return false;
      }
      if (args.tag && !product.tags.includes(args.tag)) {
        return false;
      }
      if (args.inStockTodayOnly && !product.inStockToday) {
        return false;
      }
      return true;
    });
  },
});

export const getProduct = query({
  args: {
    productId: v.id("products"),
  },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) {
      return null;
    }

    const variants = await ctx.db
      .query("productVariants")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();

    // Global groups (productId undefined) apply to all products
    const globalGroups = await ctx.db
      .query("modifierGroups")
      .filter((q) => q.eq(q.field("productId"), undefined))
      .collect();

    const productGroups = await ctx.db
      .query("modifierGroups")
      .withIndex("by_product_sort", (q) => q.eq("productId", args.productId))
      .collect();

    // Merge: global first, then product-specific. Dedupe by name (global wins).
    const globalNames = new Set(globalGroups.map((g) => g.name));
    const productOnly = productGroups.filter((g) => !globalNames.has(g.name));
    const mergedGroups = [...globalGroups, ...productOnly].sort(
      (a, b) => a.sortOrder - b.sortOrder
    );

    const optionsByGroupId = new Map<string, Doc<"modifierOptions">[]>();
    for (const group of mergedGroups) {
      const options = await ctx.db
        .query("modifierOptions")
        .withIndex("by_group_sort", (q) => q.eq("groupId", group._id))
        .collect();
      optionsByGroupId.set(group._id, options);
    }

    return {
      ...product,
      variants,
      modifierGroups: mergedGroups.map((group) => ({
        ...group,
        options: optionsByGroupId.get(group._id) ?? [],
      })),
    };
  },
});

/** Return categories and tags for product IDs. Used for coupon product-filter discount computation. */
export const getTagsForProductIds = query({
  args: { productIds: v.array(v.id("products")) },
  handler: async (ctx, args) => {
    const result: Record<string, { categories: string[]; tags: string[] }> = {};
    const seen = new Set<string>();
    for (const id of args.productIds) {
      const key = id as string;
      if (seen.has(key)) continue;
      seen.add(key);
      const p = await ctx.db.get(id);
      if (p) result[key] = { categories: p.categories, tags: p.tags };
    }
    return result;
  },
});
