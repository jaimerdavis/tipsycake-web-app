---
name: pricing-engine
description: Implement the TipsyCake pricing and totals computation engine. Use when working on cart totals, order pricing snapshots, coupon discounts, loyalty redemptions, delivery/shipping fees, or tips.
---

# Pricing Engine

Implements SPEC.md section 9 (Pricing and totals computation).

## Canonical Computation Order

**All pricing MUST be computed server-side in Convex. Never trust client-computed totals.**

```
1. subtotalCents     = Σ(unitPriceSnapshotCents × qty) + modifier deltas
2. discountCents     = coupon discount (PRM rules) + loyalty redemption (LOY rules)
3. deliveryFeeCents  = delivery tier/zone fee (if fulfillment = delivery)
   shippingFeeCents  = shipping fee (if fulfillment = shipping)
4. tipCents          = customer tip
5. taxCents          = stored even if tax-inclusive (PAY-003)
6. totalCents        = subtotalCents - discountCents + deliveryFeeCents + shippingFeeCents + tipCents
```

## Unit Price Computation

```typescript
function computeUnitPriceCents(
  basePriceCents: number,
  variantDeltaCents: number,
  modifiers: Array<{ priceDeltaCents: number }>
): number {
  return basePriceCents
    + variantDeltaCents
    + modifiers.reduce((sum, m) => sum + m.priceDeltaCents, 0);
}
```

## Coupon Discount Rules (PRM-001)

```typescript
function computeCouponDiscount(
  coupon: Coupon,
  subtotalCents: number,
  cartItems: CartItem[]
): number {
  if (coupon.minSubtotalCents && subtotalCents < coupon.minSubtotalCents) {
    return 0; // minimum not met
  }

  // Filter eligible items
  const eligibleSubtotal = filterEligibleItems(coupon, cartItems);

  switch (coupon.type) {
    case "percent":
      return Math.round(eligibleSubtotal * (coupon.value / 100));
    case "fixed":
      return Math.min(coupon.value, eligibleSubtotal);
    case "free_delivery":
      return 0; // handled in fee calculation
  }
}
```

## Delivery Fee Rules (FUL-004)

```typescript
function computeDeliveryFee(
  distanceMiles: number,
  tiers: DeliveryTier[],
  coupon?: Coupon
): { eligible: boolean; feeCents: number } {
  if (coupon?.type === "free_delivery") {
    return { eligible: true, feeCents: 0 };
  }

  const tier = tiers.find(
    (t) => distanceMiles >= t.minMiles && distanceMiles < t.maxMiles && t.enabled
  );

  if (!tier) {
    return { eligible: false, feeCents: 0 };
  }

  return { eligible: true, feeCents: tier.feeCents };
}
```

## Loyalty Redemption (LOY-004)

Points redemption converts to cents discount:
```typescript
function computeLoyaltyDiscount(
  pointsToRedeem: number,
  pointsPerDollar: number
): number {
  return Math.round((pointsToRedeem / pointsPerDollar) * 100);
}
```

## Pricing Snapshot (ORD-002)

When creating an order, store the immutable pricing snapshot:

```typescript
const pricingSnapshot = {
  subtotalCents,
  discountCents,
  deliveryFeeCents,
  shippingFeeCents,
  tipCents,
  taxCents,
  totalCents,
};
```

## Price Integrity (INV-004)

- Fee/discount shown to customer must match what is charged
- If customer changes address, fulfillment, or slot, recompute everything
- The `checkout.getEligibility` query must return a stable fee quote
- Final pricing is locked at order creation time from cart state

## Implementation Location

All pricing logic lives in a shared Convex helper:

```
convex/lib/pricing.ts    — pure computation functions
convex/cart.ts           — uses pricing.ts to compute cart totals
convex/orders.ts         — uses pricing.ts to create pricingSnapshot
convex/checkout.ts       — uses pricing.ts for eligibility quotes
```

## Testing (SPEC section 15)

- Unit test: fee calculation for each delivery tier
- Unit test: coupon percent/fixed/free_delivery on eligible items
- Unit test: loyalty points → cents conversion
- Unit test: full totals pipeline with all components
