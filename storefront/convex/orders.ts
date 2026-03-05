import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

import { computePricingSnapshot } from "./lib/pricing";
import { computeCouponDiscount } from "./coupons";

const REDEEM_POINTS_PER_DOLLAR = 100;
const EARN_POINTS_PER_DOLLAR = 1;

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

  const cart = await ctx.db.get(params.cartId as never);
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

  let userId: string | undefined;
  if (cart.ownerType === "user") {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", cart.ownerId))
      .unique();
    userId = user?._id as unknown as string | undefined;
  }

  const subtotalCents = items.reduce(
    (sum, item) => sum + item.unitPriceSnapshotCents * item.qty,
    0
  );
  let couponDiscountCents = 0;
  let couponIdForRedemption: string | undefined;

  if (cart.appliedCouponId) {
    const coupon = await ctx.db.get(cart.appliedCouponId as never);
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

  const orderId = await ctx.db.insert("orders", {
    orderNumber: randomOrderNumber(),
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
    const hold = await ctx.db.get(cart.slotHoldId as never);
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
    const account = await ctx.db.get(loyaltyAccountId as never);
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
      const earnBaseCents = Math.max(0, pricingSnapshot.subtotalCents - pricingSnapshot.discountCents);
      const pointsEarned = Math.floor((earnBaseCents / 100) * EARN_POINTS_PER_DOLLAR);
      if (pointsEarned > 0) {
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
  if (finalOrder?.contactEmail) {
    await ctx.scheduler.runAfter(0, internal.notifications.sendOrderConfirmation, {
      email: finalOrder.contactEmail,
      orderNumber: finalOrder.orderNumber,
      fulfillmentMode: finalOrder.fulfillmentMode,
      totalCents: finalOrder.pricingSnapshot.totalCents,
      scheduledSlotKey: finalOrder.scheduledSlotKey,
    });
  }

  return { deduped: false, orderId };
}

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
      const hold = await ctx.db.get(cart.slotHoldId as never);
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

    return args.cartId;
  },
});
