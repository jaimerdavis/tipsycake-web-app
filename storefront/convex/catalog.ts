import { query } from "./_generated/server";
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

    const modifierGroups = await ctx.db
      .query("modifierGroups")
      .withIndex("by_product_sort", (q) => q.eq("productId", args.productId))
      .collect();

    const optionsByGroupId = new Map<string, unknown[]>();

    for (const group of modifierGroups) {
      const options = await ctx.db
        .query("modifierOptions")
        .withIndex("by_group_sort", (q) => q.eq("groupId", group._id))
        .collect();
      optionsByGroupId.set(group._id, options);
    }

    return {
      ...product,
      variants,
      modifierGroups: modifierGroups.map((group) => ({
        ...group,
        options: optionsByGroupId.get(group._id) ?? [],
      })),
    };
  },
});
