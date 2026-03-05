import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";

import { computePricingSnapshot, computeUnitPriceCents } from "./lib/pricing";
import { computeCouponDiscount } from "./coupons";

const REDEEM_POINTS_PER_DOLLAR = 100;

const modifierSelectionValidator = v.array(
  v.object({
    groupId: v.id("modifierGroups"),
    optionId: v.id("modifierOptions"),
  })
);

async function getOrCreateActiveCart(
  ctx: MutationCtx,
  ownerType: "guest" | "user",
  ownerId: string
) {
  const existing = await ctx.db
    .query("carts")
    .withIndex("by_owner_status", (q) =>
      q.eq("ownerType", ownerType).eq("ownerId", ownerId).eq("status", "active")
    )
    .unique();

  if (existing) return existing;

  const now = Date.now();
  const cartId = await ctx.db.insert("carts", {
    ownerType,
    ownerId,
    status: "active",
    tipCents: 0,
    createdAt: now,
    updatedAt: now,
  });
  const created = await ctx.db.get(cartId);
  if (!created) throw new Error("Failed to create cart");
  return created;
}

async function resolveOwner(
  ctx: QueryCtx | MutationCtx,
  guestSessionId?: string
) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity && typeof identity === "object" && identity !== null) {
    const tokenIdentifier = (identity as { tokenIdentifier?: string }).tokenIdentifier;
    if (tokenIdentifier) {
      return { ownerType: "user" as const, ownerId: tokenIdentifier };
    }
  }
  if (!guestSessionId) {
    throw new Error("Guest session required");
  }
  return { ownerType: "guest" as const, ownerId: guestSessionId };
}

async function validateAndPriceItem(
  ctx: MutationCtx,
  productId: Id<"products">,
  variantId: Id<"productVariants"> | undefined,
  modifiers: Array<{ groupId: Id<"modifierGroups">; optionId: Id<"modifierOptions"> }>
) {
  const product = await ctx.db.get(productId);
  if (!product) throw new Error("Product not found");

  let variantDelta = 0;
  if (variantId) {
    const variant = await ctx.db.get(variantId);
    if (!variant || variant.productId !== product._id) {
      throw new Error("Invalid variant for product");
    }
    variantDelta = variant.priceDeltaCents;
  }

  const groups = await ctx.db
    .query("modifierGroups")
    .withIndex("by_product", (q) => q.eq("productId", product._id))
    .collect();

  const selectionsByGroup = new Map<string, Id<"modifierOptions">[]>();
  for (const selection of modifiers) {
    const existing = selectionsByGroup.get(selection.groupId) ?? [];
    existing.push(selection.optionId);
    selectionsByGroup.set(selection.groupId, existing);
  }

  const modifierDeltas: number[] = [];
  for (const group of groups) {
    const selectedOptionIds = selectionsByGroup.get(group._id) ?? [];
    if (group.required && selectedOptionIds.length === 0) {
      throw new Error(`${group.name} is required`);
    }
    if (selectedOptionIds.length < group.minSelect) {
      throw new Error(`${group.name} requires at least ${group.minSelect} selection(s)`);
    }
    if (selectedOptionIds.length > group.maxSelect) {
      throw new Error(`${group.name} allows at most ${group.maxSelect} selection(s)`);
    }

    for (const optionId of selectedOptionIds) {
      const option = await ctx.db.get(optionId);
      if (!option || option.groupId !== group._id) {
        throw new Error("Invalid modifier option selection");
      }
      modifierDeltas.push(option.priceDeltaCents);
    }
  }

  return computeUnitPriceCents(product.basePriceCents, variantDelta, modifierDeltas);
}

export const getCartForPayment = query({
  args: {
    cartId: v.id("carts"),
    guestSessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await resolveOwner(ctx, args.guestSessionId);
    const cart = await ctx.db.get(args.cartId);
    if (
      !cart ||
      cart.status !== "active" ||
      cart.ownerType !== owner.ownerType ||
      cart.ownerId !== owner.ownerId
    )
      return null;

    const items = await ctx.db
      .query("cartItems")
      .withIndex("by_cart", (q) => q.eq("cartId", args.cartId))
      .collect();

    const productNames = new Map<string, string>();
    for (const item of items) {
      if (!productNames.has(item.productId as string)) {
        const product = await ctx.db.get(item.productId);
        productNames.set(item.productId as string, product?.name ?? "Item");
      }
    }

    return {
      cart,
      items: items.map((item) => ({
        ...item,
        productName: productNames.get(item.productId as string) ?? "Item",
      })),
    };
  },
});

export const getActive = query({
  args: {
    guestSessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await resolveOwner(ctx, args.guestSessionId);
    const cart = await ctx.db
      .query("carts")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerType", owner.ownerType).eq("ownerId", owner.ownerId).eq("status", "active")
      )
      .unique();

    if (!cart) {
      return null;
    }

    const items = await ctx.db
      .query("cartItems")
      .withIndex("by_cart", (q) => q.eq("cartId", cart._id))
      .collect();

    let couponDiscountCents = 0;
    if (cart.appliedCouponId) {
      const coupon = await ctx.db.get(cart.appliedCouponId as Id<"coupons">);
      if (coupon && coupon.enabled && (!coupon.expiresAt || coupon.expiresAt > Date.now())) {
        const subtotalCents = items.reduce(
          (sum, item) => sum + item.unitPriceSnapshotCents * item.qty,
          0
        );
        couponDiscountCents = computeCouponDiscount({
          coupon: {
            type: coupon.type,
            value: coupon.value,
            minSubtotalCents: coupon.minSubtotalCents,
          },
          subtotalCents,
        });
      }
    }

    const loyaltyDiscountCents = cart.appliedLoyaltyPoints
      ? Math.floor((cart.appliedLoyaltyPoints / REDEEM_POINTS_PER_DOLLAR) * 100)
      : 0;

    const pricing = computePricingSnapshot({
      items: items.map((item) => ({
        unitPriceSnapshotCents: item.unitPriceSnapshotCents,
        qty: item.qty,
      })),
      couponDiscountCents,
      loyaltyDiscountCents,
      deliveryFeeCents: 0,
      shippingFeeCents: 0,
      tipCents: cart.tipCents,
      taxCents: 0,
    });

    return {
      ...cart,
      items,
      pricing,
    };
  },
});

export const addItem = mutation({
  args: {
    guestSessionId: v.optional(v.string()),
    productId: v.id("products"),
    variantId: v.optional(v.id("productVariants")),
    qty: v.number(),
    modifiers: modifierSelectionValidator,
    itemNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.qty <= 0) throw new Error("Quantity must be positive");

    const owner = await resolveOwner(ctx, args.guestSessionId);
    const cart = await getOrCreateActiveCart(ctx, owner.ownerType, owner.ownerId);

    const product = await ctx.db.get(args.productId);
    if (!product) throw new Error("Product not found");
    if (product.maxQtyPerOrder && args.qty > product.maxQtyPerOrder) {
      throw new Error(`Max quantity for this item is ${product.maxQtyPerOrder}`);
    }

    const unitPriceSnapshotCents = await validateAndPriceItem(
      ctx,
      args.productId,
      args.variantId,
      args.modifiers
    );

    const now = Date.now();
    await ctx.db.insert("cartItems", {
      cartId: cart._id,
      productId: args.productId,
      variantId: args.variantId,
      qty: args.qty,
      modifiers: args.modifiers,
      itemNote: args.itemNote,
      unitPriceSnapshotCents,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(cart._id, { updatedAt: now });
    return cart._id;
  },
});

export const updateItem = mutation({
  args: {
    cartItemId: v.id("cartItems"),
    qty: v.optional(v.number()),
    itemNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const cartItem = await ctx.db.get(args.cartItemId);
    if (!cartItem) throw new Error("Cart item not found");

    if (args.qty !== undefined) {
      if (args.qty <= 0) {
        await ctx.db.delete(args.cartItemId);
      } else {
        await ctx.db.patch(args.cartItemId, {
          qty: args.qty,
          itemNote: args.itemNote ?? cartItem.itemNote,
          updatedAt: Date.now(),
        });
      }
    } else if (args.itemNote !== undefined) {
      await ctx.db.patch(args.cartItemId, {
        itemNote: args.itemNote,
        updatedAt: Date.now(),
      });
    }

    return args.cartItemId;
  },
});

export const removeItem = mutation({
  args: {
    cartItemId: v.id("cartItems"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.cartItemId);
    return args.cartItemId;
  },
});

export const applyCoupon = mutation({
  args: {
    cartId: v.id("carts"),
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const normalized = args.code.trim().toUpperCase();
    if (!normalized) {
      throw new Error("Coupon code is required");
    }

    const cart = await ctx.db.get(args.cartId);
    if (!cart) throw new Error("Cart not found");

    const coupon = await ctx.db
      .query("coupons")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .unique();
    if (!coupon || !coupon.enabled) {
      throw new Error("Coupon is invalid");
    }
    if (coupon.expiresAt && coupon.expiresAt <= Date.now()) {
      throw new Error("Coupon expired");
    }

    const items = await ctx.db
      .query("cartItems")
      .withIndex("by_cart", (q) => q.eq("cartId", args.cartId))
      .collect();
    const subtotalCents = items.reduce(
      (sum, item) => sum + item.unitPriceSnapshotCents * item.qty,
      0
    );

    if (coupon.minSubtotalCents && subtotalCents < coupon.minSubtotalCents) {
      throw new Error(`Minimum subtotal is ${coupon.minSubtotalCents} cents`);
    }

    const totalRedemptions = await ctx.db
      .query("couponRedemptions")
      .withIndex("by_coupon", (q) => q.eq("couponId", coupon._id))
      .collect();
    if (
      coupon.maxRedemptions !== undefined &&
      totalRedemptions.length >= coupon.maxRedemptions
    ) {
      throw new Error("Coupon usage limit reached");
    }

    if (coupon.maxRedemptionsPerCustomer !== undefined) {
      let userId: string | undefined;
      if (cart.ownerType === "user") {
        const user = await ctx.db
          .query("users")
          .withIndex("by_token", (q) => q.eq("tokenIdentifier", cart.ownerId))
          .unique();
        userId = user?._id as unknown as string | undefined;
      }

      if (userId) {
        const byUser = await ctx.db
          .query("couponRedemptions")
          .withIndex("by_user_coupon", (q) =>
            q.eq("userId", userId as never).eq("couponId", coupon._id)
          )
          .collect();
        if (byUser.length >= coupon.maxRedemptionsPerCustomer) {
          throw new Error("Per-customer usage limit reached");
        }
      }
    }

    await ctx.db.patch(args.cartId, {
      appliedCouponId: coupon._id,
      appliedCouponCode: normalized,
      updatedAt: Date.now(),
    });
    return { appliedCouponCode: normalized, couponId: coupon._id };
  },
});

export const removeCoupon = mutation({
  args: {
    cartId: v.id("carts"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.cartId, {
      appliedCouponCode: undefined,
      appliedCouponId: undefined,
      updatedAt: Date.now(),
    });
    return args.cartId;
  },
});

export const setTip = mutation({
  args: {
    cartId: v.id("carts"),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.amount < 0) throw new Error("Tip cannot be negative");
    await ctx.db.patch(args.cartId, {
      tipCents: Math.round(args.amount),
      updatedAt: Date.now(),
    });
    return args.cartId;
  },
});

export const setContact = mutation({
  args: {
    cartId: v.id("carts"),
    email: v.string(),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const cart = await ctx.db.get(args.cartId);
    if (!cart) throw new Error("Cart not found");

    const email = args.email.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      throw new Error("Valid email is required");
    }

    await ctx.db.patch(args.cartId, {
      contactEmail: email,
      contactPhone: args.phone?.trim() || undefined,
      updatedAt: Date.now(),
    });
    return args.cartId;
  },
});
