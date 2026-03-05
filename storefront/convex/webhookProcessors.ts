"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import Stripe from "stripe";
import { internal } from "./_generated/api";

export const processStripeWebhook = internalAction({
  args: {
    body: v.string(),
    signature: v.string(),
  },
  handler: async (ctx, args) => {
    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripeSecret || !webhookSecret) {
      throw new Error("Stripe webhook not configured");
    }

    const stripe = new Stripe(stripeSecret);
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(args.body, args.signature, webhookSecret);
    } catch {
      throw new Error("Invalid Stripe signature");
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const cartId = session.metadata?.cartId;
      const paymentIntentId = String(session.payment_intent ?? "");
      if (cartId && paymentIntentId) {
        await ctx.runMutation(internal.orders.finalizeFromStripe, {
          eventId: event.id,
          paymentIntentId,
          cartId: cartId as never,
        });
      }
    }

    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const cartId = pi.metadata?.cartId;
      if (cartId) {
        await ctx.runMutation(internal.orders.finalizeFromStripe, {
          eventId: event.id,
          paymentIntentId: pi.id,
          cartId: cartId as never,
        });
      }
    }
  },
});

export const processPayPalWebhook = internalAction({
  args: {
    body: v.string(),
    headers: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args) => {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    const baseUrl = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";

    if (!webhookId || !clientId || !clientSecret) {
      throw new Error("PayPal webhook not configured");
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
    if (!authData.access_token) {
      throw new Error("PayPal auth failed");
    }

    const verifyResponse = await fetch(
      `${baseUrl}/v1/notifications/verify-webhook-signature`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authData.access_token}`,
        },
        body: JSON.stringify({
          auth_algo: args.headers["paypal-auth-algo"] ?? "",
          cert_url: args.headers["paypal-cert-url"] ?? "",
          transmission_id: args.headers["paypal-transmission-id"] ?? "",
          transmission_sig: args.headers["paypal-transmission-sig"] ?? "",
          transmission_time: args.headers["paypal-transmission-time"] ?? "",
          webhook_id: webhookId,
          webhook_event: JSON.parse(args.body),
        }),
      }
    );
    const verifyData = (await verifyResponse.json()) as {
      verification_status?: string;
    };

    if (verifyData.verification_status !== "SUCCESS") {
      throw new Error("Invalid PayPal signature");
    }

    const event = JSON.parse(args.body) as {
      id?: string;
      event_type?: string;
      resource?: {
        id?: string;
        custom_id?: string;
        purchase_units?: Array<{ custom_id?: string }>;
      };
    };

    if (
      event.event_type === "CHECKOUT.ORDER.APPROVED" ||
      event.event_type === "PAYMENT.CAPTURE.COMPLETED"
    ) {
      const cartId =
        event.resource?.custom_id ??
        event.resource?.purchase_units?.[0]?.custom_id;
      const paypalOrderId = event.resource?.id;
      if (cartId && paypalOrderId) {
        await ctx.runMutation(internal.orders.finalizeFromPayPal, {
          eventId: event.id ?? `paypal-${paypalOrderId}`,
          paypalOrderId,
          cartId: cartId as never,
        });
      }
    }
  },
});
