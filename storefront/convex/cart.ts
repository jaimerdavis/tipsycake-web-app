import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";

import { computePricingSnapshot, computeUnitPriceCents } from "./lib/pricing";
import { computeCouponDiscount } from "./lib/couponLogic";
import { REDEEM_POINTS_PER_DOLLAR } from "./lib/loyaltyConstants";
import { isValidUSPhone, normalizePhoneToE164 } from "./lib/phoneUtils";

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

  // Include both global (productId undefined) and product-specific modifier groups
  const globalGroups = await ctx.db
    .query("modifierGroups")
    .filter((q) => q.eq(q.field("productId"), undefined))
    .collect();
  const productGroups = await ctx.db
    .query("modifierGroups")
    .withIndex("by_product", (q) => q.eq("productId", product._id))
    .collect();
  const globalNames = new Set(globalGroups.map((g) => g.name));
  const productOnly = productGroups.filter((g) => !globalNames.has(g.name));
  const groups = [...globalGroups, ...productOnly];

  const groupIds = new Set(groups.map((g) => g._id));
  const selectionsByGroup = new Map<string, Id<"modifierOptions">[]>();
  for (const selection of modifiers) {
    if (!groupIds.has(selection.groupId)) {
      throw new Error("Invalid modifier selection for this product");
    }
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

    const productCache = new Map<string, { name: string; images: string[] }>();
    for (const item of items) {
      if (!productCache.has(item.productId as string)) {
        const product = await ctx.db.get(item.productId);
        productCache.set(item.productId as string, {
          name: product?.name ?? "Item",
          images: product?.images ?? [],
        });
      }
    }

    let ownerUserId: Id<"users"> | undefined;
    let ownerStripeCustomerId: string | undefined;
    if (cart.ownerType === "user") {
      const user = await ctx.db
        .query("users")
        .withIndex("by_token", (q) => q.eq("tokenIdentifier", cart.ownerId))
        .unique();
      if (user) {
        ownerUserId = user._id;
        ownerStripeCustomerId = user.stripeCustomerId;
      }
    }

    return {
      cart,
      items: items.map((item) => {
        const cached = productCache.get(item.productId as string);
        return {
          ...item,
          productName: cached?.name ?? "Item",
          productImages: cached?.images ?? [],
        };
      }),
      ownerUserId,
      ownerStripeCustomerId,
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
        const hasProductFilters =
          (coupon.includeProductIds?.length ?? 0) > 0 ||
          (coupon.excludeProductIds?.length ?? 0) > 0 ||
          (coupon.includeCategoryTags?.length ?? 0) > 0 ||
          (coupon.excludeCategoryTags?.length ?? 0) > 0;

        if (hasProductFilters) {
          const productCache = new Map<
            string,
            { categories: string[]; tags: string[] }
          >();
          for (const item of items) {
            if (!productCache.has(item.productId as string)) {
              const p = await ctx.db.get(item.productId);
              productCache.set(item.productId as string, {
                categories: p?.categories ?? [],
                tags: p?.tags ?? [],
              });
            }
          }
          const getProductTags = (productId: string) =>
            productCache.get(productId);

          couponDiscountCents = computeCouponDiscount({
            coupon: {
              type: coupon.type,
              value: coupon.value,
              minSubtotalCents: coupon.minSubtotalCents,
              includeProductIds: coupon.includeProductIds?.map(String),
              includeCategoryTags: coupon.includeCategoryTags,
              excludeProductIds: coupon.excludeProductIds?.map(String),
              excludeCategoryTags: coupon.excludeCategoryTags,
            },
            items: items.map((item) => ({
              productId: item.productId as string,
              unitPriceSnapshotCents: item.unitPriceSnapshotCents,
              qty: item.qty,
            })),
            getProductTags,
          });
        } else {
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

    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const product = await ctx.db.get(item.productId);
        return {
          ...item,
          productName: product?.name ?? "Unknown product",
          productImages: product?.images ?? [],
        };
      })
    );

    return {
      ...cart,
      items: enrichedItems,
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
    preferredFulfillmentMode: v.optional(v.literal("pickup")),
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

    const patchPayload: { updatedAt: number; fulfillmentMode?: "pickup" } = {
      updatedAt: now,
    };
    if (
      args.preferredFulfillmentMode === "pickup" &&
      !cart.fulfillmentMode
    ) {
      patchPayload.fulfillmentMode = "pickup";
    }
    await ctx.db.patch(cart._id, patchPayload);
    return cart._id;
  },
});

export const getCartItem = query({
  args: {
    cartItemId: v.id("cartItems"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.cartItemId);
  },
});

export const updateItemFull = mutation({
  args: {
    cartItemId: v.id("cartItems"),
    variantId: v.optional(v.id("productVariants")),
    qty: v.number(),
    modifiers: modifierSelectionValidator,
    itemNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.qty <= 0) throw new Error("Quantity must be positive");

    const cartItem = await ctx.db.get(args.cartItemId);
    if (!cartItem) throw new Error("Cart item not found");

    const product = await ctx.db.get(cartItem.productId);
    if (!product) throw new Error("Product not found");
    if (product.maxQtyPerOrder && args.qty > product.maxQtyPerOrder) {
      throw new Error(`Max quantity for this item is ${product.maxQtyPerOrder}`);
    }

    const unitPriceSnapshotCents = await validateAndPriceItem(
      ctx,
      cartItem.productId,
      args.variantId,
      args.modifiers
    );

    const now = Date.now();
    await ctx.db.patch(args.cartItemId, {
      variantId: args.variantId,
      qty: args.qty,
      modifiers: args.modifiers,
      itemNote: args.itemNote,
      unitPriceSnapshotCents,
      updatedAt: now,
    });

    await ctx.db.patch(cartItem.cartId, { updatedAt: now });
    return args.cartItemId;
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
    const normalizeCode = (s: string) =>
      s
        .replace(/[\u2013\u2014\u2015]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
    const normalized = normalizeCode(args.code);
    if (!normalized) {
      throw new Error("Coupon code is required");
    }

    const cart = await ctx.db.get(args.cartId);
    if (!cart) throw new Error("Cart not found");

    let coupon = await ctx.db
      .query("coupons")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .unique();

    // Fallback: case-insensitive match for coupons stored with different casing or unicode (seed, dashboard, import, copy-paste)
    if (!coupon) {
      const all = await ctx.db.query("coupons").collect();
      coupon =
        all.find((c) => normalizeCode(c.code) === normalized) ?? null;
    }

    if (!coupon) {
      throw new Error("Coupon is invalid");
    }
    if (!coupon.enabled) {
      throw new Error("This coupon is no longer active");
    }
    if (coupon.expiresAt && coupon.expiresAt <= Date.now()) {
      throw new Error("Coupon expired");
    }

    const items = await ctx.db
      .query("cartItems")
      .withIndex("by_cart", (q) => q.eq("cartId", args.cartId))
      .collect();

    // minSubtotalCents is enforced at discount computation time, not at apply.
    // Allow apply regardless of cart contents; discount=0 until eligible items added.

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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(s: string): boolean {
  const trimmed = s.trim().toLowerCase();
  return trimmed.length > 0 && EMAIL_REGEX.test(trimmed);
}

export const setContact = mutation({
  args: {
    cartId: v.id("carts"),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const cart = await ctx.db.get(args.cartId);
    if (!cart) throw new Error("Cart not found");

    const email = args.email?.trim();
    const phone = args.phone?.trim();

    const hasValidEmail = email !== undefined && email !== "" && isValidEmail(email);
    const hasValidPhone = phone !== undefined && phone !== "" && isValidUSPhone(phone);

    if (!hasValidEmail || !hasValidPhone) {
      throw new Error("Both email and phone are required. Phone must be US format: +1 and 10 digits (e.g. +1-954-637-7608)");
    }

    const normalizedPhone = normalizePhoneToE164(phone!);
    if (!normalizedPhone) {
      throw new Error("Invalid phone. Use US format: +1 followed by 10 digits (e.g. +19546377608)");
    }

    await ctx.db.patch(args.cartId, {
      contactEmail: hasValidEmail ? email!.toLowerCase() : undefined,
      contactPhone: hasValidPhone ? normalizedPhone : undefined,
      updatedAt: Date.now(),
    });
    return args.cartId;
  },
});

/**
 * Merge guest cart into user cart when signing in at checkout.
 * Moves all items and metadata from guest cart to user cart so the order gets userId.
 * Call when a signed-in user lands on checkout with a guest session (e.g. after sign-in).
 */
export const convertGuestCartToUser = mutation({
  args: {
    guestSessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const tokenIdentifier = identity && typeof identity === "object" && identity !== null
      ? (identity as { tokenIdentifier?: string }).tokenIdentifier
      : undefined;
    if (!tokenIdentifier) return;

    const guestCart = await ctx.db
      .query("carts")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerType", "guest").eq("ownerId", args.guestSessionId).eq("status", "active")
      )
      .unique();

    if (!guestCart) return;

    const guestItems = await ctx.db
      .query("cartItems")
      .withIndex("by_cart", (q) => q.eq("cartId", guestCart._id))
      .collect();

    if (guestItems.length === 0) return;

    const userCart = await getOrCreateActiveCart(ctx, "user", tokenIdentifier);
    const now = Date.now();

    for (const item of guestItems) {
      await ctx.db.patch(item._id, { cartId: userCart._id, updatedAt: now });
    }

    await ctx.db.patch(userCart._id, {
      contactEmail: guestCart.contactEmail,
      contactPhone: guestCart.contactPhone,
      fulfillmentMode: guestCart.fulfillmentMode,
      addressId: guestCart.addressId,
      tipCents: guestCart.tipCents,
      appliedCouponId: guestCart.appliedCouponId,
      appliedCouponCode: guestCart.appliedCouponCode,
      appliedLoyaltyPoints: guestCart.appliedLoyaltyPoints,
      slotHoldId: guestCart.slotHoldId,
      updatedAt: now,
    });

    await ctx.db.patch(guestCart._id, {
      status: "abandoned",
      updatedAt: now,
    });
  },
});

/** Restore an abandoned cart when user clicks the link from abandoned cart email/SMS. */
export const restoreAbandonedCart = mutation({
  args: {
    cartId: v.id("carts"),
    guestSessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const cart = await ctx.db.get(args.cartId);
    if (!cart) throw new Error("Cart not found");
    if (cart.status !== "abandoned") throw new Error("This cart cannot be restored");

    let ownerType: "guest" | "user";
    let ownerId: string;
    try {
      const owner = await resolveOwner(ctx, args.guestSessionId ?? undefined);
      ownerType = owner.ownerType;
      ownerId = owner.ownerId;
    } catch {
      throw new Error("Session required to restore cart. Please try again.");
    }

    const now = Date.now();
    const existingActive = await ctx.db
      .query("carts")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerType", ownerType).eq("ownerId", ownerId).eq("status", "active")
      )
      .unique();

    if (existingActive && existingActive._id !== args.cartId) {
      await ctx.db.patch(existingActive._id, { status: "abandoned", updatedAt: now });
    }

    await ctx.db.patch(args.cartId, {
      status: "active",
      ownerType,
      ownerId,
      updatedAt: now,
    });

    return args.cartId;
  },
});
