/**
 * Shared logic for computing delivery and shipping fees.
 * Used by checkout.getEligibility, orders.finalizeFromPaymentEvent, and payments.
 */
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { STORE_ORIGIN, DELIVERY_MAX_MILES, SHIPPING_FEE_PER_CAKE_CENTS } from "./storeConfig";

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function getDeliveryConfig(ctx: Pick<QueryCtx, "db">): Promise<{
  deliveryMaxMiles: number;
  shippingFeePerCakeCents: number;
}> {
  const rows = await ctx.db.query("siteSettings").collect();
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  const deliveryMaxMiles =
    map.deliveryMaxMiles != null && map.deliveryMaxMiles !== ""
      ? Math.max(0, Number(map.deliveryMaxMiles) || DELIVERY_MAX_MILES)
      : DELIVERY_MAX_MILES;
  const shippingFeePerCakeCents =
    map.shippingFeePerCakeCents != null && map.shippingFeePerCakeCents !== ""
      ? Math.max(0, Number(map.shippingFeePerCakeCents) || SHIPPING_FEE_PER_CAKE_CENTS)
      : SHIPPING_FEE_PER_CAKE_CENTS;
  return { deliveryMaxMiles, shippingFeePerCakeCents };
}

/**
 * Compute delivery and shipping fees for order creation.
 * Callable from mutations (only uses ctx.db).
 */
export async function computeFeesForOrder(
  ctx: Pick<QueryCtx, "db">,
  addressId: Id<"addresses"> | undefined,
  fulfillmentMode: string | undefined,
  cakeCount: number
): Promise<{ deliveryFeeCents: number; shippingFeeCents: number }> {
  if (!addressId || (fulfillmentMode !== "delivery" && fulfillmentMode !== "shipping")) {
    const { shippingFeePerCakeCents } = await getDeliveryConfig(ctx);
    return {
      deliveryFeeCents: 0,
      shippingFeeCents: fulfillmentMode === "shipping" ? cakeCount * shippingFeePerCakeCents : 0,
    };
  }

  const { deliveryMaxMiles, shippingFeePerCakeCents } = await getDeliveryConfig(ctx);
  const address = await ctx.db.get(addressId);
  if (!address) {
    return {
      deliveryFeeCents: 0,
      shippingFeeCents: fulfillmentMode === "shipping" ? cakeCount * shippingFeePerCakeCents : 0,
    };
  }

  const deliveryTiers = await ctx.db
    .query("deliveryTiers")
    .withIndex("by_enabled", (q) => q.eq("enabled", true))
    .collect();

  // Always compute distance fresh — cache can be stale if STORE_ORIGIN changed
  const distanceMiles = haversineMiles(
    address.lat,
    address.lng,
    STORE_ORIGIN.lat,
    STORE_ORIGIN.lng
  );

  if (fulfillmentMode === "delivery" && distanceMiles <= deliveryMaxMiles) {
    const tier = deliveryTiers.find(
      (t) =>
        distanceMiles >= t.minMiles &&
        distanceMiles < t.maxMiles &&
        t.enabled
    );
    return {
      deliveryFeeCents: tier?.feeCents ?? 0,
      shippingFeeCents: 0,
    };
  }

  return {
    deliveryFeeCents: 0,
    shippingFeeCents: cakeCount * shippingFeePerCakeCents,
  };
}
