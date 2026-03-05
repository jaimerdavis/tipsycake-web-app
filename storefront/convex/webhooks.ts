"use node";

import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import Stripe from "stripe";

function ok() {
  return new Response("OK", { status: 200 });
}

export const handleStripeEvent = httpAction(async (ctx, request) => {
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeSecret || !webhookSecret) {
    return new Response("Stripe webhook not configured", { status: 500 });
  }

  const stripe = new Stripe(stripeSecret);
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
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

  return ok();
});

export const handlePayPalEvent = httpAction(async (ctx, request) => {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const baseUrl = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";

  if (!webhookId || !clientId || !clientSecret) {
    return new Response("PayPal webhook not configured", { status: 500 });
  }

  const body = await request.text();
  const headers: Record<string, string> = {};
  for (const [key, value] of request.headers.entries()) {
    headers[key.toLowerCase()] = value;
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
    return new Response("PayPal auth failed", { status: 500 });
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
        auth_algo: headers["paypal-auth-algo"] ?? "",
        cert_url: headers["paypal-cert-url"] ?? "",
        transmission_id: headers["paypal-transmission-id"] ?? "",
        transmission_sig: headers["paypal-transmission-sig"] ?? "",
        transmission_time: headers["paypal-transmission-time"] ?? "",
        webhook_id: webhookId,
        webhook_event: JSON.parse(body),
      }),
    }
  );
  const verifyData = (await verifyResponse.json()) as {
    verification_status?: string;
  };

  if (verifyData.verification_status !== "SUCCESS") {
    return new Response("Invalid PayPal signature", { status: 400 });
  }

  const event = JSON.parse(body) as {
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

  return ok();
});
