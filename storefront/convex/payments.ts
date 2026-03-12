"use node";

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import Stripe from "stripe";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { REDEEM_POINTS_PER_DOLLAR } from "./lib/loyaltyConstants";

interface CartItem {
  productId: string;
  productName: string;
  unitPriceSnapshotCents: number;
  qty: number;
}

interface CartForPayment {
  _id: string;
  addressId?: string;
  appliedCouponId?: string;
  appliedCouponCode?: string;
  appliedLoyaltyPoints?: number;
  tipCents: number;
  contactEmail?: string;
  contactPhone?: string;
  fulfillmentMode?: string;
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export const createStripeSession = action({
  args: {
    cartId: v.id("carts"),
    guestSessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const stripeSecret = requireEnv("STRIPE_SECRET_KEY");
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

    const cartData = await ctx.runQuery(api.cart.getCartForPayment, {
      cartId: args.cartId,
      guestSessionId: args.guestSessionId,
    });
    if (!cartData) throw new Error("Cart not found or access denied");

    const { cart, items } = cartData as { cart: CartForPayment; items: CartItem[] };
    const cakeCount = items.reduce((s, i) => s + i.qty, 0);
    let deliveryFeeCents = 0;
    let shippingFeeCents = 0;

    if (cart.addressId && cart.fulfillmentMode) {
      const eligibility = await ctx.runQuery(api.checkout.getEligibility, {
        addressId: cart.addressId as never,
        cakeCount,
      });
      if (cart.fulfillmentMode === "delivery") {
        deliveryFeeCents = eligibility.delivery.feeCents;
      } else if (cart.fulfillmentMode === "shipping") {
        shippingFeeCents = eligibility.shipping.feeCents;
      }
    }

    const subtotalCents = items.reduce(
      (sum, item) => sum + item.unitPriceSnapshotCents * item.qty,
      0
    );

    let couponDiscountCents = 0;
    if (cart.appliedCouponId && (cart.appliedCouponCode ?? "").trim()) {
      const coupon = await ctx.runQuery(api.coupons.getByCode, {
        code: cart.appliedCouponCode!,
      });
      if (coupon) {
        const { computeCouponDiscount } = await import("./coupons");
        const hasProductFilters =
          (coupon.includeProductIds?.length ?? 0) > 0 ||
          (coupon.excludeProductIds?.length ?? 0) > 0 ||
          (coupon.includeCategoryTags?.length ?? 0) > 0 ||
          (coupon.excludeCategoryTags?.length ?? 0) > 0;
        if (hasProductFilters) {
          const productIds = [...new Set(items.map((i) => i.productId))];
          const tagsMap = await ctx.runQuery(api.catalog.getTagsForProductIds, {
            productIds: productIds as never[],
          });
          const getProductTags = (pid: string) => tagsMap[pid];
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
            items: items.map((i) => ({
              productId: i.productId,
              unitPriceSnapshotCents: i.unitPriceSnapshotCents,
              qty: i.qty,
            })),
            getProductTags,
          });
        } else {
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

    const discountCents = couponDiscountCents + loyaltyDiscountCents;

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    for (const item of items) {
      lineItems.push({
        quantity: item.qty,
        price_data: {
          currency: "usd",
          product_data: {
            name: item.productName,
          },
          unit_amount: item.unitPriceSnapshotCents,
        },
      });
    }

    if (deliveryFeeCents > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "usd",
          product_data: { name: "Delivery fee" },
          unit_amount: deliveryFeeCents,
        },
      });
    }

    if (shippingFeeCents > 0) {
      const cakeCount = items.reduce((s, i) => s + i.qty, 0);
      const label = cakeCount > 1 ? `Shipping (${cakeCount} cakes × $${(shippingFeeCents / cakeCount / 100).toFixed(0)})` : "Shipping";
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "usd",
          product_data: { name: label },
          unit_amount: shippingFeeCents,
        },
      });
    }

    if ((cart.tipCents ?? 0) > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "usd",
          product_data: { name: "Tip" },
          unit_amount: cart.tipCents!,
        },
      });
    }

    if (discountCents > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "usd",
          product_data: { name: "Discount" },
          unit_amount: -discountCents,
        },
      });
    }

    const stripe = new Stripe(stripeSecret);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      metadata: {
        cartId: String(args.cartId),
      },
      success_url: `${siteUrl}/checkout?status=success&cartId=${args.cartId}`,
      cancel_url: `${siteUrl}/checkout?status=cancelled`,
    });

    return {
      provider: "stripe",
      sessionId: session.id,
      checkoutUrl: session.url,
    };
  },
});

export const createPaymentIntent = action({
  args: {
    cartId: v.id("carts"),
    guestSessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const stripeSecret = requireEnv("STRIPE_SECRET_KEY");

    const cartData = await ctx.runQuery(api.cart.getCartForPayment, {
      cartId: args.cartId,
      guestSessionId: args.guestSessionId,
    });
    if (!cartData) throw new Error("Cart not found or access denied");

    const {
      cart,
      items,
      ownerUserId,
      ownerStripeCustomerId,
    } = cartData as {
      cart: CartForPayment;
      items: CartItem[];
      ownerUserId?: Id<"users">;
      ownerStripeCustomerId?: string;
    };
    if (items.length === 0) throw new Error("Cart is empty");

    const cakeCount = items.reduce((s, i) => s + i.qty, 0);
    let deliveryFeeCents = 0;
    let shippingFeeCents = 0;

    if (cart.addressId && cart.fulfillmentMode) {
      const eligibility = await ctx.runQuery(api.checkout.getEligibility, {
        addressId: cart.addressId as never,
        cakeCount,
      });
      if (cart.fulfillmentMode === "delivery") {
        deliveryFeeCents = eligibility.delivery.feeCents;
      } else if (cart.fulfillmentMode === "shipping") {
        shippingFeeCents = eligibility.shipping.feeCents;
      }
    }

    const subtotalCents = items.reduce(
      (sum, item) => sum + item.unitPriceSnapshotCents * item.qty,
      0
    );

    let couponDiscountCents = 0;
    if (cart.appliedCouponId && (cart.appliedCouponCode ?? "").trim()) {
      const coupon = await ctx.runQuery(api.coupons.getByCode, {
        code: cart.appliedCouponCode!,
      });
      if (coupon) {
        const { computeCouponDiscount } = await import("./coupons");
        const hasProductFilters =
          (coupon.includeProductIds?.length ?? 0) > 0 ||
          (coupon.excludeProductIds?.length ?? 0) > 0 ||
          (coupon.includeCategoryTags?.length ?? 0) > 0 ||
          (coupon.excludeCategoryTags?.length ?? 0) > 0;
        if (hasProductFilters) {
          const productIds = [...new Set(items.map((i) => i.productId))];
          const tagsMap = await ctx.runQuery(api.catalog.getTagsForProductIds, {
            productIds: productIds as never[],
          });
          const getProductTags = (pid: string) => tagsMap[pid];
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
            items: items.map((i) => ({
              productId: i.productId,
              unitPriceSnapshotCents: i.unitPriceSnapshotCents,
              qty: i.qty,
            })),
            getProductTags,
          });
        } else {
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

    const discountCents = couponDiscountCents + loyaltyDiscountCents;
    const totalCents = Math.max(
      50, // Stripe minimum is 50 cents USD
      subtotalCents -
        discountCents +
        deliveryFeeCents +
        shippingFeeCents +
        (cart.tipCents ?? 0)
    );

    let stripeCustomerId: string | undefined;
    if (ownerUserId) {
      if (ownerStripeCustomerId) {
        stripeCustomerId = ownerStripeCustomerId;
      } else {
        const userDoc = await ctx.runQuery(internal.users.getUserForStripeCustomer, {
          userId: ownerUserId,
        });
        if (userDoc) {
          const stripe = new Stripe(stripeSecret);
          const customer = await stripe.customers.create({
            email: userDoc.email,
            name: userDoc.name,
            metadata: { convexUserId: String(ownerUserId) },
          });
          stripeCustomerId = customer.id;
          await ctx.runMutation(internal.users.setStripeCustomerId, {
            userId: ownerUserId,
            stripeCustomerId: customer.id,
          });
        }
      }
    }

    const stripe = new Stripe(stripeSecret);
    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: totalCents,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: {
        cartId: String(args.cartId),
      },
    };

    if (stripeCustomerId) {
      paymentIntentParams.customer = stripeCustomerId;
      paymentIntentParams.setup_future_usage = "off_session";
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    await ctx.runMutation(api.paymentLogs.recordPaymentAttempt, {
      cartId: args.cartId,
      provider: "stripe",
      referenceId: paymentIntent.id,
    });

    return {
      clientSecret: paymentIntent.client_secret!,
      amount: totalCents,
    };
  },
});

/** Get or create Stripe Customer for current user. Returns stripeCustomerId or null. */
async function getOrCreateStripeCustomerForUser(
  ctx: { runQuery: (fn: never, args: Record<string, never>) => Promise<{ _id: Id<"users">; email: string; name: string; stripeCustomerId?: string } | null>; runMutation: (fn: never, args: { userId: Id<"users">; stripeCustomerId: string }) => Promise<never> },
  stripeSecret: string
): Promise<string | null> {
  const me = await ctx.runQuery(api.users.meOrNull, {});
  if (!me) return null;

  if (me.stripeCustomerId) return me.stripeCustomerId;

  const stripe = new Stripe(stripeSecret);
  const customer = await stripe.customers.create({
    email: me.email,
    name: me.name,
    metadata: { convexUserId: String(me._id) },
  });
  await ctx.runMutation(internal.users.setStripeCustomerId, {
    userId: me._id,
    stripeCustomerId: customer.id,
  });
  return customer.id;
}

/** List saved payment methods for the current user. */
export const listPaymentMethods = action({
  args: {},
  handler: async (ctx) => {
    const stripeSecret = requireEnv("STRIPE_SECRET_KEY");
    const stripeCustomerId = await getOrCreateStripeCustomerForUser(ctx, stripeSecret);
    if (!stripeCustomerId) return [];

    const stripe = new Stripe(stripeSecret);
    const { data } = await stripe.paymentMethods.list({
      customer: stripeCustomerId,
      type: "card",
    });

    return data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand ?? "card",
      last4: pm.card?.last4 ?? "····",
      expMonth: pm.card?.exp_month ?? 0,
      expYear: pm.card?.exp_year ?? 0,
    }));
  },
});

/** Create SetupIntent for adding a new payment method. Returns clientSecret for Stripe Elements. */
export const createSetupIntent = action({
  args: {},
  handler: async (ctx) => {
    const stripeSecret = requireEnv("STRIPE_SECRET_KEY");
    const stripeCustomerId = await getOrCreateStripeCustomerForUser(ctx, stripeSecret);
    if (!stripeCustomerId) throw new Error("Sign in to add a payment method");

    const stripe = new Stripe(stripeSecret);
    const si = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      usage: "off_session",
    });

    return { clientSecret: si.client_secret! };
  },
});

/** Detach (remove) a payment method. Verifies it belongs to the current user's customer. */
export const detachPaymentMethod = action({
  args: { paymentMethodId: v.string() },
  handler: async (ctx, args) => {
    const stripeSecret = requireEnv("STRIPE_SECRET_KEY");
    const stripeCustomerId = await getOrCreateStripeCustomerForUser(ctx, stripeSecret);
    if (!stripeCustomerId) throw new Error("Sign in to manage payment methods");

    const stripe = new Stripe(stripeSecret);
    const pm = await stripe.paymentMethods.retrieve(args.paymentMethodId);
    if (pm.customer !== stripeCustomerId) {
      throw new Error("Payment method not found");
    }
    await stripe.paymentMethods.detach(args.paymentMethodId);
  },
});

/** Admin: list payment methods for a customer by email. Includes PaymentMethods (pm_*) and legacy card sources (card_*). */
export const listPaymentMethodsForCustomer = action({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const me = await ctx.runQuery(api.users.meOrNull, {});
    if (!me || (me.role !== "admin" && me.role !== "manager")) {
      throw new Error("Unauthorized");
    }
    const stripeSecret = requireEnv("STRIPE_SECRET_KEY");
    const user = await ctx.runQuery(internal.users.getUserByEmailForMigration, {
      email: args.email.trim().toLowerCase(),
    });
    if (!user) return [];
    const stripeUser = await ctx.runQuery(internal.users.getStripeCustomerIdForUser, { userId: user.userId });
    if (!stripeUser?.stripeCustomerId) return [];

    const cusId = stripeUser.stripeCustomerId;
    if (!cusId.startsWith("cus_")) {
      return [];
    }

    const stripe = new Stripe(stripeSecret);

    // Modern PaymentMethods (pm_xxx)
    const { data: pmData } = await stripe.paymentMethods.list({
      customer: cusId,
      type: "card",
    });
    const fromPm = pmData.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand ?? "card",
      last4: pm.card?.last4 ?? "····",
      expMonth: pm.card?.exp_month ?? 0,
      expYear: pm.card?.exp_year ?? 0,
    }));

    // Legacy card sources (card_xxx) from WooCommerce or older Stripe integrations
    let fromSources: Array<{ id: string; brand: string; last4: string; expMonth: number; expYear: number }> = [];
    try {
      const sources = await stripe.customers.listSources(cusId, { limit: 100 });
      const pmIds = new Set(fromPm.map((p) => p.id));
      for (const src of sources.data) {
        if (src.object === "card" && src.id && !pmIds.has(src.id)) {
          fromSources.push({
            id: src.id,
            brand: src.brand ?? "card",
            last4: src.last4 ?? "····",
            expMonth: src.exp_month ?? 0,
            expYear: src.exp_year ?? 0,
          });
        }
      }
    } catch {
      // listSources can fail for some accounts; ignore and return PaymentMethods only
    }

    return [...fromPm, ...fromSources];
  },
});

/** Admin: retry linking Stripe customer ID for a customer by email. Use when payment methods don't show (e.g. 4 accounts that didn't get linked by migration). */
export const retryStripeLinkForCustomer = action({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const me = await ctx.runQuery(api.users.meOrNull, {});
    if (!me || (me.role !== "admin" && me.role !== "manager")) {
      throw new Error("Unauthorized");
    }
    const normalized = args.email.trim().toLowerCase();
    if (!normalized) return { ok: false, reason: "Email required" };

    const user = await ctx.runQuery(internal.users.getUserByEmailForMigration, { email: normalized });
    if (!user) return { ok: false, reason: "Customer not found" };

    const existing = await ctx.runQuery(internal.users.getStripeCustomerIdForUser, { userId: user.userId });
    if (existing?.stripeCustomerId) return { ok: true, linked: false, reason: "Already linked" };

    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) return { ok: false, reason: "STRIPE_SECRET_KEY not set" };

    const stripe = new Stripe(stripeSecret);
    const list = await stripe.customers.list({ email: normalized, limit: 1 });
    if (list.data.length === 0) return { ok: true, linked: false, reason: "No Stripe customer with that email" };

    await ctx.runMutation(internal.users.setStripeCustomerId, {
      userId: user.userId,
      stripeCustomerId: list.data[0].id,
    });
    return { ok: true, linked: true, stripeCustomerId: list.data[0].id };
  },
});

/** Admin: detach a payment method for a customer by email. Handles both PaymentMethods (pm_*) and legacy card sources (card_*). */
export const detachPaymentMethodForCustomer = action({
  args: { email: v.string(), paymentMethodId: v.string() },
  handler: async (ctx, args) => {
    const me = await ctx.runQuery(api.users.meOrNull, {});
    if (!me || (me.role !== "admin" && me.role !== "manager")) {
      throw new Error("Unauthorized");
    }
    const stripeSecret = requireEnv("STRIPE_SECRET_KEY");
    const user = await ctx.runQuery(internal.users.getUserByEmailForMigration, {
      email: args.email.trim().toLowerCase(),
    });
    if (!user) throw new Error("Customer not found");
    const stripeUser = await ctx.runQuery(internal.users.getStripeCustomerIdForUser, { userId: user.userId });
    if (!stripeUser?.stripeCustomerId) throw new Error("No payment methods on file");

    const stripe = new Stripe(stripeSecret);
    const id = args.paymentMethodId;

    if (id.startsWith("card_")) {
      await stripe.customers.deleteSource(stripeUser.stripeCustomerId, id);
    } else {
      const pm = await stripe.paymentMethods.retrieve(id);
      if (pm.customer !== stripeUser.stripeCustomerId) {
        throw new Error("Payment method not found for this customer");
      }
      await stripe.paymentMethods.detach(id);
    }
  },
});

export const createPayPalOrder = action({
  args: {
    cartId: v.id("carts"),
    guestSessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    const baseUrl = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";

    if (!clientId || !clientSecret) {
      throw new Error("PayPal credentials not configured");
    }

    const cartData = await ctx.runQuery(api.cart.getCartForPayment, {
      cartId: args.cartId,
      guestSessionId: args.guestSessionId,
    });
    if (!cartData) throw new Error("Cart not found or access denied");

    const { cart, items } = cartData as { cart: CartForPayment; items: CartItem[] };
    if (items.length === 0) throw new Error("Cart is empty");
    const cakeCount = items.reduce((s, i) => s + i.qty, 0);
    let deliveryFeeCents = 0;
    let shippingFeeCents = 0;
    if (cart.addressId && cart.fulfillmentMode) {
      const eligibility = await ctx.runQuery(api.checkout.getEligibility, {
        addressId: cart.addressId as never,
        cakeCount,
      });
      if (cart.fulfillmentMode === "delivery") {
        deliveryFeeCents = eligibility.delivery.feeCents;
      } else if (cart.fulfillmentMode === "shipping") {
        shippingFeeCents = eligibility.shipping.feeCents;
      }
    }

    const subtotalCents = items.reduce(
      (sum, item) => sum + item.unitPriceSnapshotCents * item.qty,
      0
    );

    let couponDiscountCents = 0;
    if (cart.appliedCouponId && (cart.appliedCouponCode ?? "").trim()) {
      const coupon = await ctx.runQuery(api.coupons.getByCode, {
        code: cart.appliedCouponCode!,
      });
      if (coupon) {
        const { computeCouponDiscount } = await import("./coupons");
        const hasProductFilters =
          (coupon.includeProductIds?.length ?? 0) > 0 ||
          (coupon.excludeProductIds?.length ?? 0) > 0 ||
          (coupon.includeCategoryTags?.length ?? 0) > 0 ||
          (coupon.excludeCategoryTags?.length ?? 0) > 0;
        if (hasProductFilters) {
          const productIds = [...new Set(items.map((i) => i.productId))];
          const tagsMap = await ctx.runQuery(api.catalog.getTagsForProductIds, {
            productIds: productIds as never[],
          });
          const getProductTags = (pid: string) => tagsMap[pid];
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
            items: items.map((i) => ({
              productId: i.productId,
              unitPriceSnapshotCents: i.unitPriceSnapshotCents,
              qty: i.qty,
            })),
            getProductTags,
          });
        } else {
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

    const discountCents = couponDiscountCents + loyaltyDiscountCents;
    const totalCents = Math.max(
      100,
      subtotalCents - discountCents + deliveryFeeCents + shippingFeeCents + (cart.tipCents ?? 0)
    );
    const totalDollars = (totalCents / 100).toFixed(2);

    const authResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    });
    const authData = (await authResponse.json()) as { access_token?: string };
    if (!authData.access_token) throw new Error("PayPal auth failed");

    const ppItems = items.map((item) => ({
      name: item.productName,
      quantity: String(item.qty),
      unit_amount: {
        currency_code: "USD",
        value: (item.unitPriceSnapshotCents / 100).toFixed(2),
      },
    }));

    const itemTotal = (subtotalCents / 100).toFixed(2);
    const discountTotal = (discountCents / 100).toFixed(2);
    const shippingTotal = ((deliveryFeeCents + shippingFeeCents) / 100).toFixed(2);

    const orderResponse = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authData.access_token}`,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            custom_id: String(args.cartId),
            amount: {
              currency_code: "USD",
              value: totalDollars,
              breakdown: {
                item_total: { currency_code: "USD", value: itemTotal },
                discount: { currency_code: "USD", value: discountTotal },
                shipping: { currency_code: "USD", value: shippingTotal },
              },
            },
            items: ppItems,
          },
        ],
      }),
    });
    const orderData = (await orderResponse.json()) as {
      id?: string;
      status?: string;
      links?: Array<{ rel: string; href: string }>;
    };

    if (!orderData.id) throw new Error("PayPal order creation failed");

    await ctx.runMutation(api.paymentLogs.recordPaymentAttempt, {
      cartId: args.cartId,
      provider: "paypal",
      referenceId: orderData.id,
    });

    const approveLink = orderData.links?.find((l) => l.rel === "approve")?.href;

    return {
      provider: "paypal" as const,
      orderId: orderData.id,
      approveUrl: approveLink ?? null,
      amount: totalCents,
    };
  },
});

export const capturePayPalOrder = action({
  args: {
    paypalOrderId: v.string(),
    cartId: v.id("carts"),
  },
  handler: async (ctx, args) => {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    const baseUrl = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";

    if (!clientId || !clientSecret) {
      throw new Error("PayPal credentials not configured");
    }

    const authResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    });
    const authData = (await authResponse.json()) as { access_token?: string };
    if (!authData.access_token) throw new Error("PayPal auth failed");

    const captureResponse = await fetch(
      `${baseUrl}/v2/checkout/orders/${args.paypalOrderId}/capture`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authData.access_token}`,
        },
      }
    );
    const captureData = (await captureResponse.json()) as {
      id?: string;
      status?: string;
    };

    if (captureData.status !== "COMPLETED") {
      throw new Error(`PayPal capture failed: ${captureData.status ?? "unknown"}`);
    }

    await ctx.runMutation(internal.orders.finalizeFromPayPal, {
      eventId: `paypal-capture-${captureData.id}`,
      paypalOrderId: args.paypalOrderId,
      cartId: args.cartId as never,
    });

    return { status: "captured", paypalOrderId: args.paypalOrderId };
  },
});

export const reconcileOrphans = internalAction({
  args: {},
  handler: async (ctx) => {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return { status: "skipped", message: "Stripe not configured" };

    const stripe = new Stripe(stripeKey);
    const cutoff = Math.floor((Date.now() - 2 * 60 * 60 * 1000) / 1000);
    const intents = await stripe.paymentIntents.list({
      created: { gte: cutoff },
      limit: 50,
    });

    let reconciled = 0;
    for (const pi of intents.data) {
      if (pi.status === "succeeded" && pi.metadata?.cartId) {
        const existing = await ctx.runQuery(api.orders.getByPaymentIntent, {
          paymentIntentId: pi.id,
        });
        if (!existing) {
          await ctx.runMutation(internal.orders.finalizeFromStripe, {
            eventId: `reconcile-${pi.id}`,
            paymentIntentId: pi.id,
            cartId: pi.metadata.cartId as never,
          });
          reconciled++;
        }
      }
    }

    return { status: "ok", reconciled };
  },
});
