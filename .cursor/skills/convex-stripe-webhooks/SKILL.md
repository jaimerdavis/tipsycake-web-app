---
name: convex-stripe-webhooks
description: Implement Stripe and PayPal payment flows with Convex HTTP actions and idempotent webhook handling. Use when working on PAY-001 through PAY-007, INV-002, or payment finalization.
---

# Convex + Stripe/PayPal Webhooks

Implements SPEC.md sections 11 (Payment finalization) and 5.5 (PAY requirements).

## Architecture

```
Client → Stripe Checkout / PayPal → Redirect back
                ↓
Stripe/PayPal webhook POST → convex/http.ts → webhook handler action
                ↓
Verify signature → dedupe via webhookEvents → run finalization mutation
```

## HTTP Router Setup

```typescript
// convex/http.ts
import { httpRouter } from "convex/server";
import { handleStripeWebhook } from "./webhooks";
import { handlePayPalWebhook } from "./webhooks";

const http = httpRouter();

http.route({
  path: "/webhooks/stripe",
  method: "POST",
  handler: handleStripeWebhook,
});

http.route({
  path: "/webhooks/paypal",
  method: "POST",
  handler: handlePayPalWebhook,
});

export default http;
```

## Webhook Idempotency (PAY-005, INV-002)

Every webhook event must be stored in `webhookEvents` before processing.

```typescript
// In finalization mutation:
const existing = await ctx.db
  .query("webhookEvents")
  .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
  .first();

if (existing?.status === "processed") {
  return; // Safe duplicate skip
}

// Record event
const eventDocId = await ctx.db.insert("webhookEvents", {
  provider: "stripe",
  eventId,
  payloadHash,
  status: "received",
  createdAt: Date.now(),
});

// ... process order ...

await ctx.db.patch(eventDocId, {
  status: "processed",
  processedAt: Date.now(),
});
```

## Stripe Flow

### Create Session (Action)

```typescript
// convex/payments.ts
"use node";

import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const createStripeSession = action({
  args: { cartId: v.id("carts") },
  handler: async (ctx, args) => {
    const cart = await ctx.runQuery(api.cart.getActive, { cartId: args.cartId });
    if (!cart) throw new Error("Cart not found");

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [/* build from cart snapshot */],
      metadata: { cartId: args.cartId },
      success_url: `${process.env.SITE_URL}/order/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_URL}/checkout`,
    });

    return { url: session.url };
  },
});
```

### Webhook Handler (Action → Mutation)

```typescript
// convex/webhooks.ts
"use node";

import { httpAction } from "convex/server";
import { internal } from "./_generated/api";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const handleStripeWebhook = httpAction(async (ctx, request) => {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    await ctx.runMutation(internal.orders.finalizeFromStripe, {
      eventId: event.id,
      sessionId: session.id,
      cartId: session.metadata?.cartId,
      paymentIntentId: session.payment_intent as string,
    });
  }

  return new Response("OK", { status: 200 });
});
```

## Success Flow (SPEC 11.3)

The `finalizeFromStripe` internal mutation must:

1. **Deduplicate** — check `webhookEvents` for existing `eventId`
2. **Fetch cart** — get cart with items, pricing, slot hold
3. **Validate hold** — check slot hold is still valid (or handle expired)
4. **Convert hold → booking** — update `slotHolds.status` to "converted", insert `slotBookings`
5. **Create order** — immutable snapshot of items, pricing, fulfillment
6. **Mark paid** — set order status to `paid_confirmed`
7. **Award loyalty** — if user has loyalty account
8. **Log event** — insert into `orderEvents`
9. **Mark cart converted** — update cart status
10. **Record webhook** — mark `webhookEvents` as processed

## Failure Flow (SPEC 11.4, PAY-006)

On payment failure or cancellation:
- Release the slot hold (`status = "released"`)
- Keep cart active for retry
- Log payment attempt

## Tables

```typescript
webhookEvents: defineTable({
  provider: v.union(v.literal("stripe"), v.literal("paypal")),
  eventId: v.string(),
  payloadHash: v.string(),
  status: v.union(
    v.literal("received"),
    v.literal("processed"),
    v.literal("ignored"),
    v.literal("failed")
  ),
  processedAt: v.optional(v.number()),
  error: v.optional(v.string()),
  createdAt: v.number(),
})
  .index("by_eventId", ["eventId"])
```

## PayPal Idempotency

PayPal uses the **same dedup pattern** as Stripe — both providers share `webhookEvents` and `finalizeFromPaymentEvent`.

### PayPal webhook flow
1. Receive POST at `/webhooks/paypal`
2. Verify signature via PayPal `/v1/notifications/verify-webhook-signature` API
3. Extract `cartId` from `resource.custom_id` or `purchase_units[0].custom_id`
4. Call `internal.orders.finalizeFromPayPal` which delegates to `finalizeFromPaymentEvent`
5. Same dedup: check `webhookEvents.by_provider_eventId` → skip if `processed`

### PayPal event types handled
- `CHECKOUT.ORDER.APPROVED` — order approved by buyer
- `PAYMENT.CAPTURE.COMPLETED` — payment captured (backup for client-side capture flow)

### Client-side capture flow (alternative to webhook-only)
For faster UX, the client can call `capturePayPalOrder` action after buyer approval, which captures and finalizes immediately. The webhook still fires and is safely deduped.

## Testing (SPEC section 15)

### Replay test
Send the same webhook event twice. Verify only one order is created. Applies to both Stripe and PayPal.

### Cancel test
Simulate payment cancel. Verify hold is released and cart remains active.

### Cross-provider test
Verify Stripe event `evt_001` and PayPal event `evt_001` are treated independently (different provider namespace in dedup key).
