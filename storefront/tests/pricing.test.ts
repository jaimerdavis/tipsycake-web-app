import { describe, it, expect } from "vitest";
import {
  computeSubtotal,
  computeUnitPriceCents,
  computePricingSnapshot,
} from "../convex/lib/pricing";

describe("computeSubtotal", () => {
  it("sums unit price × qty for all items", () => {
    const result = computeSubtotal([
      { unitPriceSnapshotCents: 500, qty: 2 },
      { unitPriceSnapshotCents: 300, qty: 1 },
    ]);
    expect(result).toBe(1300);
  });

  it("returns 0 for empty items", () => {
    expect(computeSubtotal([])).toBe(0);
  });
});

describe("computeUnitPriceCents", () => {
  it("base + variant + modifiers", () => {
    const result = computeUnitPriceCents(1000, 200, [50, -30]);
    expect(result).toBe(1220);
  });

  it("base only with no variant or modifiers", () => {
    expect(computeUnitPriceCents(500, 0, [])).toBe(500);
  });
});

describe("computePricingSnapshot", () => {
  it("computes total: subtotal - discounts + fees + tip", () => {
    const result = computePricingSnapshot({
      items: [{ unitPriceSnapshotCents: 1000, qty: 1 }],
      couponDiscountCents: 100,
      loyaltyDiscountCents: 0,
      deliveryFeeCents: 300,
      shippingFeeCents: 0,
      tipCents: 50,
      taxCents: 0,
    });
    expect(result.subtotalCents).toBe(1000);
    expect(result.discountCents).toBe(100);
    expect(result.deliveryFeeCents).toBe(300);
    expect(result.tipCents).toBe(50);
    expect(result.totalCents).toBe(1250);
  });

  it("total never negative", () => {
    const result = computePricingSnapshot({
      items: [{ unitPriceSnapshotCents: 100, qty: 1 }],
      couponDiscountCents: 500,
      loyaltyDiscountCents: 500,
      deliveryFeeCents: 0,
      shippingFeeCents: 0,
      tipCents: 0,
      taxCents: 0,
    });
    expect(result.totalCents).toBe(0);
  });
});
