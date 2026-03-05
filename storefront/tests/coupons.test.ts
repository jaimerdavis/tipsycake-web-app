import { describe, it, expect } from "vitest";
import { computeCouponDiscount } from "../convex/lib/couponLogic";

describe("computeCouponDiscount", () => {
  it("percent: applies percentage to subtotal", () => {
    const result = computeCouponDiscount({
      coupon: { type: "percent", value: 10 },
      subtotalCents: 1000,
    });
    expect(result).toBe(100);
  });

  it("percent: rounds down", () => {
    const result = computeCouponDiscount({
      coupon: { type: "percent", value: 15 },
      subtotalCents: 333,
    });
    expect(result).toBe(49);
  });

  it("percent: returns 0 when subtotal below minSubtotalCents", () => {
    const result = computeCouponDiscount({
      coupon: { type: "percent", value: 10, minSubtotalCents: 500 },
      subtotalCents: 400,
    });
    expect(result).toBe(0);
  });

  it("percent: applies when subtotal meets minSubtotalCents", () => {
    const result = computeCouponDiscount({
      coupon: { type: "percent", value: 10, minSubtotalCents: 500 },
      subtotalCents: 1000,
    });
    expect(result).toBe(100);
  });

  it("fixed: deducts fixed amount up to subtotal", () => {
    const result = computeCouponDiscount({
      coupon: { type: "fixed", value: 300 },
      subtotalCents: 1000,
    });
    expect(result).toBe(300);
  });

  it("fixed: caps at subtotal", () => {
    const result = computeCouponDiscount({
      coupon: { type: "fixed", value: 500 },
      subtotalCents: 300,
    });
    expect(result).toBe(300);
  });

  it("fixed: returns 0 when below minSubtotalCents", () => {
    const result = computeCouponDiscount({
      coupon: { type: "fixed", value: 100, minSubtotalCents: 500 },
      subtotalCents: 400,
    });
    expect(result).toBe(0);
  });

  it("free_delivery: always returns 0", () => {
    const result = computeCouponDiscount({
      coupon: { type: "free_delivery", value: 0 },
      subtotalCents: 10000,
    });
    expect(result).toBe(0);
  });
});
