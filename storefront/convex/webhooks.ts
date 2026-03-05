import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const handleStripeEvent = httpAction(async (ctx, request) => {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  try {
    await ctx.runAction(internal.webhookProcessors.processStripeWebhook, {
      body,
      signature,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    if (message.includes("Invalid") || message.includes("not configured")) {
      return new Response(message, { status: 400 });
    }
    return new Response(message, { status: 500 });
  }

  return new Response("OK", { status: 200 });
});

const PAYPAL_HEADER_KEYS = [
  "paypal-auth-algo",
  "paypal-cert-url",
  "paypal-transmission-id",
  "paypal-transmission-sig",
  "paypal-transmission-time",
] as const;

export const handlePayPalEvent = httpAction(async (ctx, request) => {
  const body = await request.text();
  const headers: Record<string, string> = {};
  for (const key of PAYPAL_HEADER_KEYS) {
    const value = request.headers.get(key);
    if (value) headers[key] = value;
  }

  try {
    await ctx.runAction(internal.webhookProcessors.processPayPalWebhook, {
      body,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    if (message.includes("Invalid") || message.includes("not configured")) {
      return new Response(message, { status: 400 });
    }
    return new Response(message, { status: 500 });
  }

  return new Response("OK", { status: 200 });
});
