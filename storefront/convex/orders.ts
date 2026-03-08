import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { internal } from "./_generated/api";

import { getCurrentUser } from "./lib/auth";
import { computePricingSnapshot } from "./lib/pricing";
import { computeCouponDiscount } from "./coupons";
import {
  renderOrderConfirmation,
  renderOwnerNotification,
  renderPaymentFailed,
} from "./lib/emailTemplates";
import {
  POINTS_PER_ORDER,
  REDEEM_POINTS_PER_DOLLAR,
} from "./lib/loyaltyConstants";

function randomOrderNumber() {
  return `TC-${Math.floor(100000 + Math.random() * 900000)}`;
}

function randomGuestToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

async function finalizeFromPaymentEvent(
  ctx: MutationCtx,
  params: {
    provider: "stripe" | "paypal";
    eventId: string;
    referenceId: string;
    cartId: string;
  }
) {
  const existingEvent = await ctx.db
    .query("webhookEvents")
    .withIndex("by_provider_eventId", (q) =>
      q.eq("provider", params.provider).eq("eventId", params.eventId)
    )
    .unique();

  if (existingEvent?.status === "processed") {
    return { deduped: true, orderId: null };
  }

  const now = Date.now();
  const eventDocId =
    existingEvent?._id ??
    (await ctx.db.insert("webhookEvents", {
      provider: params.provider,
      eventId: params.eventId,
      payloadHash: params.referenceId,
      status: "received",
      createdAt: now,
    }));

  const cart = await ctx.db.get(params.cartId as Id<"carts">);
  if (!cart) {
    await ctx.db.patch(eventDocId, {
      status: "failed",
      error: "Cart not found",
      processedAt: now,
    });
    throw new Error("Cart not found");
  }

    const items = await ctx.db
      .query("cartItems")
      .withIndex("by_cart", (q) => q.eq("cartId", cart._id))
      .collect();
    if (items.length === 0) throw new Error("Cart is empty");

    let userId: string | undefined;
  if (cart.ownerType === "user") {
    let user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", cart.ownerId))
      .unique();
    if (!user) {
      const nowUser = Date.now();
      const inserted = await ctx.db.insert("users", {
        tokenIdentifier: cart.ownerId,
        email: (cart.contactEmail ?? "").toLowerCase(),
        name: "Customer",
        role: "customer",
        isActive: true,
        createdAt: nowUser,
        updatedAt: nowUser,
      });
      await ctx.scheduler.runAfter(0, internal.loyalty.awardSignupBonus, {
        userId: inserted,
      });
      user = await ctx.db.get(inserted);
    }
    userId = user?._id as unknown as string | undefined;
  }

  const subtotalCents = items.reduce(
    (sum, item) => sum + item.unitPriceSnapshotCents * item.qty,
    0
  );
  let couponDiscountCents = 0;
  let couponIdForRedemption: string | undefined;

  if (cart.appliedCouponId) {
    const coupon = await ctx.db.get(cart.appliedCouponId as Id<"coupons">);
    if (coupon && coupon.enabled && (!coupon.expiresAt || coupon.expiresAt > now)) {
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

      if (coupon.maxRedemptionsPerCustomer !== undefined && userId) {
        const userRedemptions = await ctx.db
          .query("couponRedemptions")
          .withIndex("by_user_coupon", (q) =>
            q.eq("userId", userId as never).eq("couponId", coupon._id)
          )
          .collect();
        if (userRedemptions.length >= coupon.maxRedemptionsPerCustomer) {
          throw new Error("Per-customer coupon limit reached");
        }
      }

      couponDiscountCents = computeCouponDiscount({
        coupon: {
          type: coupon.type,
          value: coupon.value,
          minSubtotalCents: coupon.minSubtotalCents,
        },
        subtotalCents,
      });
      couponIdForRedemption = coupon._id as unknown as string;
    }
  }

  let loyaltyDiscountCents = 0;
  let loyaltyPointsRedeemed = 0;
  let loyaltyAccountId: string | undefined;
  if (cart.appliedLoyaltyPoints && cart.appliedLoyaltyPoints > 0 && userId) {
    const account = await ctx.db
      .query("loyaltyAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId as never))
      .unique();
    if (account) {
      loyaltyAccountId = account._id as unknown as string;
      loyaltyPointsRedeemed = Math.min(account.pointsBalance, cart.appliedLoyaltyPoints);
      loyaltyDiscountCents = Math.floor((loyaltyPointsRedeemed / REDEEM_POINTS_PER_DOLLAR) * 100);
    }
  }

    const pricingSnapshot = computePricingSnapshot({
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

    if (pricingSnapshot.totalCents > 0) {
      throw new Error("Order total must be $0 to complete as free order");
    }

    const orderId = await ctx.db.insert("orders", {
    orderNumber: randomOrderNumber(),
    cartId: params.cartId as never,
    userId: userId ? (userId as never) : undefined,
    guestToken: randomGuestToken(),
    status: "paid_confirmed",
    contactEmail: cart.contactEmail,
    contactPhone: cart.contactPhone,
    fulfillmentMode: cart.fulfillmentMode ?? "pickup",
    addressId: (cart.addressId as never) ?? undefined,
    scheduledSlotKey: undefined,
    pricingSnapshot,
    appliedCouponCode: cart.appliedCouponCode,
    loyaltyPointsEarned: undefined,
    loyaltyPointsRedeemed: loyaltyPointsRedeemed || undefined,
    paymentProvider: params.provider,
    paymentIntentId: params.provider === "stripe" ? params.referenceId : undefined,
    paypalOrderId: params.provider === "paypal" ? params.referenceId : undefined,
    createdAt: now,
    updatedAt: now,
  });

  for (const item of items) {
    const product = await ctx.db.get(item.productId);
    const variant = item.variantId ? await ctx.db.get(item.variantId) : null;

    const modifierSnapshots = [];
    for (const selected of item.modifiers) {
      const group = await ctx.db.get(selected.groupId);
      const option = await ctx.db.get(selected.optionId);
      modifierSnapshots.push({
        groupId: selected.groupId,
        optionId: selected.optionId,
        groupName: group?.name,
        optionName: option?.name,
        priceDeltaCents: option?.priceDeltaCents ?? 0,
      });
    }

    await ctx.db.insert("orderItems", {
      orderId,
      productSnapshot: {
        productId: item.productId,
        name: product?.name,
      },
      variantSnapshot: variant
        ? {
            variantId: variant._id,
            label: variant.label,
            priceDeltaCents: variant.priceDeltaCents,
          }
        : undefined,
      modifiersSnapshot: modifierSnapshots,
      qty: item.qty,
      unitPriceCents: item.unitPriceSnapshotCents,
      createdAt: now,
    });
  }

  if (cart.slotHoldId) {
    const hold = await ctx.db.get(cart.slotHoldId as Id<"slotHolds">);
    if (hold && hold.status === "held" && hold.expiresAt > now) {
      const [, , mode] = hold.slotKey.split("|");
      await ctx.db.patch(hold._id, {
        status: "converted",
        updatedAt: now,
      });
      await ctx.db.insert("slotBookings", {
        orderId,
        cartId: cart._id,
        slotKey: hold.slotKey,
        mode: mode as "pickup" | "delivery" | "shipping",
        createdAt: now,
      });
      await ctx.db.patch(orderId, {
        scheduledSlotKey: hold.slotKey,
        updatedAt: now,
      });
    }
  }

  await ctx.db.insert("orderEvents", {
    orderId,
    status: "paid_confirmed",
    note: `${params.provider} payment confirmed`,
    actorType: "system",
    createdAt: now,
  });

  await ctx.db.patch(cart._id, {
    status: "converted",
    updatedAt: now,
  });

  if (couponIdForRedemption) {
    await ctx.db.insert("couponRedemptions", {
      couponId: couponIdForRedemption as never,
      code: cart.appliedCouponCode ?? "",
      orderId,
      userId: userId ? (userId as never) : undefined,
      contactEmail: cart.contactEmail,
      createdAt: now,
    });
  }

  if (loyaltyAccountId && loyaltyPointsRedeemed > 0) {
    const account = await ctx.db.get(loyaltyAccountId as Id<"loyaltyAccounts">);
    if (account) {
      await ctx.db.patch(account._id, {
        pointsBalance: account.pointsBalance - loyaltyPointsRedeemed,
        updatedAt: now,
      });
      await ctx.db.insert("pointsLedger", {
        accountId: account._id,
        type: "redeem",
        points: -loyaltyPointsRedeemed,
        orderId,
        createdAt: now,
      });
    }
  }

  if (userId) {
    const account = await ctx.db
      .query("loyaltyAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId as never))
      .unique();
    if (account) {
      const pointsEarned = POINTS_PER_ORDER;
      await ctx.db.patch(account._id, {
        pointsBalance: account.pointsBalance + pointsEarned,
        updatedAt: now,
      });
      await ctx.db.insert("pointsLedger", {
        accountId: account._id,
        type: "earn",
        points: pointsEarned,
        orderId,
        createdAt: now,
      });
      await ctx.db.patch(orderId, {
        loyaltyPointsEarned: pointsEarned,
        updatedAt: now,
      });
    }
  }

  await ctx.db.insert("paymentAttempts", {
    cartId: cart._id,
    provider: params.provider,
    status: "succeeded",
    referenceId: params.referenceId,
    createdAt: now,
  });

  await ctx.db.patch(eventDocId, {
    status: "processed",
    processedAt: now,
  });

  const finalOrder = await ctx.db.get(orderId);
  const settingsRows = await ctx.db.query("siteSettings").collect();
  const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
  const storeName = settings.storeName ?? "TheTipsyCake";
  const siteUrl = settings.siteUrl ?? "https://order.tipsycake.com";
  const storeEmail = settings.storeEmail?.trim();
  const notifyOwner = settings.notifyOwnerOnOrder !== "false";

  if (finalOrder?.contactEmail) {
    const rendered = await renderOrderConfirmation(ctx, {
      storeName,
      siteUrl,
      orderNumber: finalOrder.orderNumber,
      fulfillmentMode: finalOrder.fulfillmentMode,
      totalCents: finalOrder.pricingSnapshot.totalCents,
      scheduledSlotKey: finalOrder.scheduledSlotKey,
      guestToken: finalOrder.guestToken,
    });
    await ctx.scheduler.runAfter(0, internal.notifications.sendOrderConfirmation, {
      email: finalOrder.contactEmail,
      orderNumber: finalOrder.orderNumber,
      fulfillmentMode: finalOrder.fulfillmentMode,
      totalCents: finalOrder.pricingSnapshot.totalCents,
      scheduledSlotKey: finalOrder.scheduledSlotKey,
      guestToken: finalOrder.guestToken,
      subjectOverride: rendered.subject,
      htmlOverride: rendered.html,
    });
  }

  if (storeEmail && notifyOwner) {
    const rendered = await renderOwnerNotification(ctx, {
      storeName,
      siteUrl,
      orderNumber: finalOrder!.orderNumber,
      fulfillmentMode: finalOrder!.fulfillmentMode,
      totalCents: finalOrder!.pricingSnapshot.totalCents,
      scheduledSlotKey: finalOrder!.scheduledSlotKey,
      contactEmail: finalOrder!.contactEmail,
      contactPhone: finalOrder!.contactPhone,
    });
    await ctx.scheduler.runAfter(0, internal.notifications.sendOrderConfirmationToOwner, {
      email: storeEmail,
      orderNumber: finalOrder!.orderNumber,
      fulfillmentMode: finalOrder!.fulfillmentMode,
      totalCents: finalOrder!.pricingSnapshot.totalCents,
      scheduledSlotKey: finalOrder!.scheduledSlotKey,
      contactEmail: finalOrder!.contactEmail,
      contactPhone: finalOrder!.contactPhone,
      subjectOverride: rendered.subject,
      htmlOverride: rendered.html,
    });
  }

  return { deduped: false, orderId };
}

/** Complete a $0 order without payment. Idempotent by cartId. */
export const completeFreeOrder = mutation({
  args: { cartId: v.id("carts") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("orders")
      .withIndex("by_cartId", (q) => q.eq("cartId", args.cartId))
      .unique();
    if (existing) return existing._id;

    const cart = await ctx.db.get(args.cartId);
    if (!cart) throw new Error("Cart not found");
    if (cart.status !== "active") throw new Error("Cart is not active");

    if (!cart.contactEmail && !cart.contactPhone) {
      throw new Error("Contact info required");
    }

    const now = Date.now();

    const cartItems = await ctx.db
      .query("cartItems")
      .withIndex("by_cart", (q) => q.eq("cartId", cart._id))
      .collect();
    if (cartItems.length === 0) throw new Error("Cart is empty");

    let userId: string | undefined;
    if (cart.ownerType === "user") {
      let user = await ctx.db
        .query("users")
        .withIndex("by_token", (q) => q.eq("tokenIdentifier", cart.ownerId))
        .unique();
      if (!user) {
        const identity = await ctx.auth.getUserIdentity();
        if (identity?.tokenIdentifier === cart.ownerId) {
          const nowUser = Date.now();
          const inserted = await ctx.db.insert("users", {
            tokenIdentifier: identity.tokenIdentifier,
            email: identity.email ?? "",
            name: identity.name ?? "Unknown User",
            image: identity.pictureUrl,
            role: "customer",
            isActive: true,
            createdAt: nowUser,
            updatedAt: nowUser,
          });
          await ctx.scheduler.runAfter(0, internal.loyalty.awardSignupBonus, {
            userId: inserted,
          });
          user = await ctx.db.get(inserted);
        }
      }
      userId = user?._id as unknown as string | undefined;
    }

    const subtotalCents = cartItems.reduce(
      (sum, item) => sum + item.unitPriceSnapshotCents * item.qty,
      0
    );
    let couponDiscountCents = 0;
    let couponIdForRedemption: string | undefined;

    if (cart.appliedCouponId) {
      const coupon = await ctx.db.get(cart.appliedCouponId as Id<"coupons">);
      if (coupon && coupon.enabled && (!coupon.expiresAt || coupon.expiresAt > now)) {
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
        if (coupon.maxRedemptionsPerCustomer !== undefined && userId) {
          const userRedemptions = await ctx.db
            .query("couponRedemptions")
            .withIndex("by_user_coupon", (q) =>
              q.eq("userId", userId as never).eq("couponId", coupon._id)
            )
            .collect();
          if (userRedemptions.length >= coupon.maxRedemptionsPerCustomer) {
            throw new Error("Per-customer coupon limit reached");
          }
        }
        couponDiscountCents = computeCouponDiscount({
          coupon: {
            type: coupon.type,
            value: coupon.value,
            minSubtotalCents: coupon.minSubtotalCents,
          },
          subtotalCents,
        });
        couponIdForRedemption = coupon._id as unknown as string;
      }
    }

    let loyaltyDiscountCents = 0;
    let loyaltyPointsRedeemed = 0;
    let loyaltyAccountId: string | undefined;
    if (cart.appliedLoyaltyPoints && cart.appliedLoyaltyPoints > 0 && userId) {
      const account = await ctx.db
        .query("loyaltyAccounts")
        .withIndex("by_user", (q) => q.eq("userId", userId as never))
        .unique();
      if (account) {
        loyaltyAccountId = account._id as unknown as string;
        loyaltyPointsRedeemed = Math.min(account.pointsBalance, cart.appliedLoyaltyPoints);
        loyaltyDiscountCents = Math.floor((loyaltyPointsRedeemed / REDEEM_POINTS_PER_DOLLAR) * 100);
      }
    }

    const pricingSnapshot = computePricingSnapshot({
      items: cartItems.map((item) => ({
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

    if (pricingSnapshot.totalCents > 0) {
      throw new Error("Order total must be $0 to complete as free order");
    }

    const orderId = await ctx.db.insert("orders", {
      orderNumber: randomOrderNumber(),
      cartId: args.cartId,
      userId: userId ? (userId as never) : undefined,
      guestToken: randomGuestToken(),
      status: "paid_confirmed",
      contactEmail: cart.contactEmail,
      contactPhone: cart.contactPhone,
      fulfillmentMode: cart.fulfillmentMode ?? "pickup",
      addressId: (cart.addressId as never) ?? undefined,
      scheduledSlotKey: undefined,
      pricingSnapshot,
      appliedCouponCode: cart.appliedCouponCode,
      loyaltyPointsEarned: undefined,
      loyaltyPointsRedeemed: loyaltyPointsRedeemed || undefined,
      paymentProvider: undefined,
      paymentIntentId: undefined,
      paypalOrderId: undefined,
      createdAt: now,
      updatedAt: now,
    });

    for (const item of cartItems) {
      const product = await ctx.db.get(item.productId);
      const variant = item.variantId ? await ctx.db.get(item.variantId) : null;
      const modifierSnapshots = [];
      for (const selected of item.modifiers) {
        const group = await ctx.db.get(selected.groupId);
        const option = await ctx.db.get(selected.optionId);
        modifierSnapshots.push({
          groupId: selected.groupId,
          optionId: selected.optionId,
          groupName: group?.name,
          optionName: option?.name,
          priceDeltaCents: option?.priceDeltaCents ?? 0,
        });
      }
      await ctx.db.insert("orderItems", {
        orderId,
        productSnapshot: { productId: item.productId, name: product?.name },
        variantSnapshot: variant
          ? {
              variantId: variant._id,
              label: variant.label,
              priceDeltaCents: variant.priceDeltaCents,
            }
          : undefined,
        modifiersSnapshot: modifierSnapshots,
        qty: item.qty,
        unitPriceCents: item.unitPriceSnapshotCents,
        createdAt: now,
      });
    }

    if (cart.slotHoldId) {
      const hold = await ctx.db.get(cart.slotHoldId as Id<"slotHolds">);
      if (hold && hold.status === "held" && hold.expiresAt > now) {
        const [, , mode] = hold.slotKey.split("|");
        await ctx.db.patch(hold._id, { status: "converted", updatedAt: now });
        await ctx.db.insert("slotBookings", {
          orderId,
          cartId: cart._id,
          slotKey: hold.slotKey,
          mode: mode as "pickup" | "delivery" | "shipping",
          createdAt: now,
        });
        await ctx.db.patch(orderId, { scheduledSlotKey: hold.slotKey, updatedAt: now });
      }
    }

    await ctx.db.insert("orderEvents", {
      orderId,
      status: "paid_confirmed",
      note: "Free order completed",
      actorType: "system",
      createdAt: now,
    });

    await ctx.db.patch(cart._id, { status: "converted", updatedAt: now });

    if (couponIdForRedemption) {
      await ctx.db.insert("couponRedemptions", {
        couponId: couponIdForRedemption as never,
        code: cart.appliedCouponCode ?? "",
        orderId,
        userId: userId ? (userId as never) : undefined,
        contactEmail: cart.contactEmail,
        createdAt: now,
      });
    }

    if (loyaltyAccountId && loyaltyPointsRedeemed > 0) {
      const account = await ctx.db.get(loyaltyAccountId as Id<"loyaltyAccounts">);
      if (account) {
        await ctx.db.patch(account._id, {
          pointsBalance: account.pointsBalance - loyaltyPointsRedeemed,
          updatedAt: now,
        });
        await ctx.db.insert("pointsLedger", {
          accountId: account._id,
          type: "redeem",
          points: -loyaltyPointsRedeemed,
          orderId,
          createdAt: now,
        });
      }
    }

    if (userId) {
      const account = await ctx.db
        .query("loyaltyAccounts")
        .withIndex("by_user", (q) => q.eq("userId", userId as never))
        .unique();
      if (account) {
        const pointsEarned = POINTS_PER_ORDER;
        await ctx.db.patch(account._id, {
          pointsBalance: account.pointsBalance + pointsEarned,
          updatedAt: now,
        });
        await ctx.db.insert("pointsLedger", {
          accountId: account._id,
          type: "earn",
          points: pointsEarned,
          orderId,
          createdAt: now,
        });
        await ctx.db.patch(orderId, { loyaltyPointsEarned: pointsEarned, updatedAt: now });
      }
    }

    const finalOrder = await ctx.db.get(orderId);
    const settingsRows = await ctx.db.query("siteSettings").collect();
    const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
    const storeName = settings.storeName ?? "TheTipsyCake";
    const siteUrl = settings.siteUrl ?? "https://order.tipsycake.com";
    const storeEmail = settings.storeEmail?.trim();
    const notifyOwner = settings.notifyOwnerOnOrder !== "false";

    if (finalOrder?.contactEmail) {
      const rendered = await renderOrderConfirmation(ctx, {
        storeName,
        siteUrl,
        orderNumber: finalOrder.orderNumber,
        fulfillmentMode: finalOrder.fulfillmentMode,
        totalCents: finalOrder.pricingSnapshot.totalCents,
        scheduledSlotKey: finalOrder.scheduledSlotKey,
        guestToken: finalOrder.guestToken,
      });
      await ctx.scheduler.runAfter(0, internal.notifications.sendOrderConfirmation, {
        email: finalOrder.contactEmail,
        orderNumber: finalOrder.orderNumber,
        fulfillmentMode: finalOrder.fulfillmentMode,
        totalCents: finalOrder.pricingSnapshot.totalCents,
        scheduledSlotKey: finalOrder.scheduledSlotKey,
        guestToken: finalOrder.guestToken,
        subjectOverride: rendered.subject,
        htmlOverride: rendered.html,
      });
    }

    if (storeEmail && notifyOwner && finalOrder) {
      const rendered = await renderOwnerNotification(ctx, {
        storeName,
        siteUrl,
        orderNumber: finalOrder.orderNumber,
        fulfillmentMode: finalOrder.fulfillmentMode,
        totalCents: finalOrder.pricingSnapshot.totalCents,
        scheduledSlotKey: finalOrder.scheduledSlotKey,
        contactEmail: finalOrder.contactEmail,
        contactPhone: finalOrder.contactPhone,
      });
      await ctx.scheduler.runAfter(0, internal.notifications.sendOrderConfirmationToOwner, {
        email: storeEmail,
        orderNumber: finalOrder.orderNumber,
        fulfillmentMode: finalOrder.fulfillmentMode,
        totalCents: finalOrder.pricingSnapshot.totalCents,
        scheduledSlotKey: finalOrder.scheduledSlotKey,
        contactEmail: finalOrder.contactEmail,
        contactPhone: finalOrder.contactPhone,
        subjectOverride: rendered.subject,
        htmlOverride: rendered.html,
      });
    }

    return orderId;
  },
});

/** Used by checkout to poll for order after payment success. Returns minimal data for confirmation UI. */
export const getByCartId = query({
  args: { cartId: v.id("carts") },
  handler: async (ctx, args) => {
    const order = await ctx.db
      .query("orders")
      .withIndex("by_cartId", (q) => q.eq("cartId", args.cartId))
      .unique();
    if (!order) return null;
    return {
      orderNumber: order.orderNumber,
      guestToken: order.guestToken,
      fulfillmentMode: order.fulfillmentMode,
      totalCents: order.pricingSnapshot.totalCents,
    };
  },
});

export const getByPaymentIntent = query({
  args: { paymentIntentId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_paymentIntentId", (q) => q.eq("paymentIntentId", args.paymentIntentId))
      .unique();
  },
});

export const getByToken = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db
      .query("orders")
      .withIndex("by_guestToken", (q) => q.eq("guestToken", args.token))
      .unique();
    if (!order) return null;

    const events = await ctx.db
      .query("orderEvents")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();

    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();

    return { ...order, events, items };
  },
});

/** Orders for the current authenticated user. Used by customer account page. */
export const listByUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    // Fallback when Convex user not yet created (race with StoreUserSync): find orders by Clerk email
    if (!user) {
      const email = (identity as { email?: string }).email?.toLowerCase();
      if (!email) return [];
      const byEmail = await ctx.db
        .query("orders")
        .withIndex("by_contactEmail", (q) => q.eq("contactEmail", email))
        .collect();
      const sorted = byEmail.sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
      return await Promise.all(
        sorted.map(async (order) => {
          const events = await ctx.db
            .query("orderEvents")
            .withIndex("by_order", (q) => q.eq("orderId", order._id))
            .collect();
          const items = await ctx.db
            .query("orderItems")
            .withIndex("by_order", (q) => q.eq("orderId", order._id))
            .collect();
          return { ...order, events, items };
        })
      );
    }

    const byUserId = await ctx.db
      .query("orders")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(50);

    // Include unlinked orders matching either Convex user.email or Clerk identity.email
    const clerkEmail = (identity as { email?: string }).email?.toLowerCase();
    const userEmail = user.email?.toLowerCase();
    const emailsToCheck = [...new Set([userEmail, clerkEmail].filter(Boolean))];

    const extraByEmail: Doc<"orders">[] = [];
    const seenIds = new Set<string>();
    for (const email of emailsToCheck) {
      const byEmail = await ctx.db
        .query("orders")
        .withIndex("by_contactEmail", (q) => q.eq("contactEmail", email))
        .collect();
      for (const o of byEmail) {
        if (!o.userId && !seenIds.has(o._id)) {
          seenIds.add(o._id);
          extraByEmail.push(o);
        }
      }
    }

    const seen = new Set(byUserId.map((o) => o._id));
    const merged = [...byUserId];
    for (const o of extraByEmail) {
      if (!seen.has(o._id)) {
        seen.add(o._id);
        merged.push(o);
      }
    }
    merged.sort((a, b) => b.createdAt - a.createdAt);
    const orders = merged.slice(0, 50);

    return await Promise.all(
      orders.map(async (order) => {
        const events = await ctx.db
          .query("orderEvents")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();
        return { ...order, events, items };
      })
    );
  },
});

/** Link past orders (contactEmail match, no userId) to the current user. Uses Clerk identity.email when Convex user email doesn't match. */
export const linkOrdersByEmail = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;

    // Prefer Clerk's identity.email (authoritative for logged-in session) over Convex user.email
    const clerkEmail = (identity as { email?: string }).email?.toLowerCase();
    const userEmail = user.email?.toLowerCase();
    const emailsToTry = [...new Set([clerkEmail, userEmail].filter(Boolean))];
    if (emailsToTry.length === 0) return 0;

    const seen = new Set<string>();
    const toLink: { _id: Id<"orders"> }[] = [];
    for (const email of emailsToTry) {
      const unlinked = await ctx.db
        .query("orders")
        .withIndex("by_contactEmail", (q) => q.eq("contactEmail", email))
        .collect();
      for (const o of unlinked) {
        if (!o.userId && !seen.has(o._id)) {
          seen.add(o._id);
          toLink.push(o);
        }
      }
    }

    const now = Date.now();
    for (const order of toLink) {
      await ctx.db.patch(order._id, { userId: user._id, updatedAt: now });
    }

    // Sync Convex user email from Clerk when we linked orders — so future listByUser finds them via user.email
    if (toLink.length > 0 && clerkEmail && user.email?.toLowerCase() !== clerkEmail) {
      await ctx.db.patch(user._id, { email: clerkEmail, updatedAt: now });
    }
    return toLink.length;
  },
});

/**
 * TRK-002: Delivery tracking for customer. Token-scoped, read-only.
 * Returns assignment + latest driver location when fulfillmentMode is delivery.
 */
export const getDeliveryTrackingByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const order = await ctx.db
      .query("orders")
      .withIndex("by_guestToken", (q) => q.eq("guestToken", args.token))
      .unique();
    if (!order || order.fulfillmentMode !== "delivery") return null;

    const assignment = await ctx.db
      .query("driverAssignments")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .first();
    if (!assignment) return null;

    const driver = await ctx.db.get(assignment.driverId);
    const locations = await ctx.db
      .query("driverLocations")
      .withIndex("by_assignment", (q) => q.eq("assignmentId", assignment._id))
      .order("desc")
      .take(1);
    const latestLocation = locations[0] ?? null;

    let destination: { lat: number; lng: number; formatted: string } | null = null;
    if (order.addressId) {
      const addr = await ctx.db.get(order.addressId);
      if (addr) {
        destination = {
          lat: addr.lat,
          lng: addr.lng,
          formatted: addr.formatted,
        };
      }
    }

    return {
      assignment,
      latestLocation,
      destination,
      driverName: driver?.name ?? null,
      eta: assignment.eta ?? null,
    };
  },
});

export const finalizeFromStripe = internalMutation({
  args: {
    eventId: v.string(),
    paymentIntentId: v.string(),
    cartId: v.id("carts"),
  },
  handler: async (ctx, args) => {
    return await finalizeFromPaymentEvent(ctx, {
      provider: "stripe",
      eventId: args.eventId,
      referenceId: args.paymentIntentId,
      cartId: args.cartId as unknown as string,
    });
  },
});

export const finalizeFromPayPal = internalMutation({
  args: {
    eventId: v.string(),
    paypalOrderId: v.string(),
    cartId: v.id("carts"),
  },
  handler: async (ctx, args) => {
    return await finalizeFromPaymentEvent(ctx, {
      provider: "paypal",
      eventId: args.eventId,
      referenceId: args.paypalOrderId,
      cartId: args.cartId as unknown as string,
    });
  },
});

export const markPaymentFailed = mutation({
  args: {
    cartId: v.id("carts"),
    provider: v.union(v.literal("stripe"), v.literal("paypal")),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const cart = await ctx.db.get(args.cartId);
    if (!cart) throw new Error("Cart not found");

    const now = Date.now();
    if (cart.slotHoldId) {
      const hold = await ctx.db.get(cart.slotHoldId as Id<"slotHolds">);
      if (hold && hold.status === "held") {
        await ctx.db.patch(hold._id, {
          status: "released",
          updatedAt: now,
        });
      }
    }

    await ctx.db.insert("paymentAttempts", {
      cartId: args.cartId,
      provider: args.provider,
      status: "failed",
      error: args.reason,
      createdAt: now,
    });

    if (cart.contactEmail) {
      const settingsRows = await ctx.db.query("siteSettings").collect();
      const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
      const storeName = settings.storeName ?? "TheTipsyCake";
      const rendered = await renderPaymentFailed(ctx, { storeName, reason: args.reason });
      await ctx.scheduler.runAfter(0, internal.notifications.sendPaymentFailed, {
        email: cart.contactEmail,
        reason: args.reason,
        subjectOverride: rendered.subject,
        htmlOverride: rendered.html,
      });
    }

    return args.cartId;
  },
});
