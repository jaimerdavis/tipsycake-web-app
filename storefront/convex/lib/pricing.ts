/**
 * Pricing engine — pure computation functions.
 * All pricing MUST be computed server-side (AI-DEV-003, SPEC section 9).
 *
 * Computation order:
 *   1. subtotal = Σ(unitPrice × qty) + modifier deltas
 *   2. coupon discount
 *   3. loyalty redemption discount
 *   4. delivery/shipping fee
 *   5. tip
 *   6. tax (stored even if inclusive)
 *   7. total = subtotal - discounts + fees + tip
 */

export interface PricingInput {
  items: Array<{
    unitPriceSnapshotCents: number;
    qty: number;
  }>;
  couponDiscountCents: number;
  loyaltyDiscountCents: number;
  deliveryFeeCents: number;
  shippingFeeCents: number;
  tipCents: number;
  taxCents: number;
}

export interface PricingSnapshot {
  subtotalCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  shippingFeeCents: number;
  tipCents: number;
  taxCents: number;
  totalCents: number;
}

export function computeSubtotal(
  items: Array<{ unitPriceSnapshotCents: number; qty: number }>
): number {
  return items.reduce(
    (sum, item) => sum + item.unitPriceSnapshotCents * item.qty,
    0
  );
}

export function computeUnitPriceCents(
  basePriceCents: number,
  variantDeltaCents: number,
  modifierDeltas: number[]
): number {
  return (
    basePriceCents +
    variantDeltaCents +
    modifierDeltas.reduce((sum, d) => sum + d, 0)
  );
}

export function computePricingSnapshot(input: PricingInput): PricingSnapshot {
  const subtotalCents = computeSubtotal(input.items);
  const discountCents = input.couponDiscountCents + input.loyaltyDiscountCents;
  const totalCents =
    subtotalCents -
    discountCents +
    input.deliveryFeeCents +
    input.shippingFeeCents +
    input.tipCents;

  return {
    subtotalCents,
    discountCents,
    deliveryFeeCents: input.deliveryFeeCents,
    shippingFeeCents: input.shippingFeeCents,
    tipCents: input.tipCents,
    taxCents: input.taxCents,
    totalCents: Math.max(0, totalCents),
  };
}
