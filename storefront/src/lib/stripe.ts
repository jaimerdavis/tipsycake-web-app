import { loadStripe, type Stripe } from "@stripe/stripe-js";

// Cache Stripe promise per key to avoid repeated loadStripe calls and reduce console noise
const stripeCache = new Map<string, Promise<Stripe | null>>();

export function getStripePromise(publishableKey: string | null | undefined) {
  if (!publishableKey || !publishableKey.startsWith("pk_")) return null;
  let p = stripeCache.get(publishableKey);
  if (!p) {
    p = loadStripe(publishableKey);
    stripeCache.set(publishableKey, p);
  }
  return p;
}
