"use node";

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import Stripe from "stripe";
import { api, internal } from "./_generated/api";
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
    let deliveryFeeCents = 0;
    let shippingFeeCents = 0;

    if (cart.addressId && cart.fulfillmentMode) {
      const eligibility = await ctx.runQuery(api.checkout.getEligibility, {
        addressId: cart.addressId as never,
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
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "usd",
          product_data: { name: "Shipping fee" },
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
      success_url: `${siteUrl}/checkout?status=success`,
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

    const { cart, items } = cartData as { cart: CartForPayment; items: CartItem[] };
    if (items.length === 0) throw new Error("Cart is empty");

    let deliveryFeeCents = 0;
    let shippingFeeCents = 0;

    if (cart.addressId && cart.fulfillmentMode) {
      const eligibility = await ctx.runQuery(api.checkout.getEligibility, {
        addressId: cart.addressId as never,
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

    const discountCents = couponDiscountCents + loyaltyDiscountCents;
    const totalCents = Math.max(
      50, // Stripe minimum is 50 cents USD
      subtotalCents -
        discountCents +
        deliveryFeeCents +
        shippingFeeCents +
        (cart.tipCents ?? 0)
    );

    const stripe = new Stripe(stripeSecret);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: {
        cartId: String(args.cartId),
      },
    });

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

    let deliveryFeeCents = 0;
    let shippingFeeCents = 0;
    if (cart.addressId && cart.fulfillmentMode) {
      const eligibility = await ctx.runQuery(api.checkout.getEligibility, {
        addressId: cart.addressId as never,
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
