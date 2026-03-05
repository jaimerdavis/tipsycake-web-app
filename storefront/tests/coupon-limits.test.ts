import { describe, it, expect } from "vitest";
import { computeCouponDiscount } from "../convex/lib/couponLogic";

/**
 * Tests for coupon invariants (INV-003: redemption limits and edge cases).
 */

function canRedeem(params: {
  totalRedemptions: number;
  maxRedemptions?: number;
  userRedemptions: number;
  maxRedemptionsPerCustomer?: number;
  enabled: boolean;
  expiresAt?: number;
  now: number;
}): { allowed: boolean; reason?: string } {
  if (!params.enabled) return { allowed: false, reason: "disabled" };
  if (params.expiresAt && params.expiresAt <= params.now)
    return { allowed: false, reason: "expired" };
  if (
    params.maxRedemptions !== undefined &&
    params.totalRedemptions >= params.maxRedemptions
  )
    return { allowed: false, reason: "global_limit" };
  if (
    params.maxRedemptionsPerCustomer !== undefined &&
    params.userRedemptions >= params.maxRedemptionsPerCustomer
  )
    return { allowed: false, reason: "per_customer_limit" };
  return { allowed: true };
}

describe("coupon redemption limits (INV-003)", () => {
  const now = Date.now();

  it("allows valid coupon", () => {
    expect(
      canRedeem({
        totalRedemptions: 0,
        maxRedemptions: 100,
        userRedemptions: 0,
        maxRedemptionsPerCustomer: 3,
        enabled: true,
        now,
      })
    ).toEqual({ allowed: true });
  });

  it("rejects disabled coupon", () => {
    expect(
      canRedeem({
        totalRedemptions: 0,
        userRedemptions: 0,
        enabled: false,
        now,
      })
    ).toEqual({ allowed: false, reason: "disabled" });
  });

  it("rejects expired coupon", () => {
    expect(
      canRedeem({
        totalRedemptions: 0,
        userRedemptions: 0,
        enabled: true,
        expiresAt: now - 1000,
        now,
      })
    ).toEqual({ allowed: false, reason: "expired" });
  });

  it("rejects when global limit reached", () => {
    expect(
      canRedeem({
        totalRedemptions: 100,
        maxRedemptions: 100,
        userRedemptions: 0,
        enabled: true,
        now,
      })
    ).toEqual({ allowed: false, reason: "global_limit" });
  });

  it("rejects when per-customer limit reached", () => {
    expect(
      canRedeem({
        totalRedemptions: 5,
        maxRedemptions: 100,
        userRedemptions: 3,
        maxRedemptionsPerCustomer: 3,
        enabled: true,
        now,
      })
    ).toEqual({ allowed: false, reason: "per_customer_limit" });
  });

  it("allows when under both limits", () => {
    expect(
      canRedeem({
        totalRedemptions: 50,
        maxRedemptions: 100,
        userRedemptions: 1,
        maxRedemptionsPerCustomer: 3,
        enabled: true,
        now,
      })
    ).toEqual({ allowed: true });
  });

  it("allows with no limits set", () => {
    expect(
      canRedeem({
        totalRedemptions: 999,
        userRedemptions: 999,
        enabled: true,
        now,
      })
    ).toEqual({ allowed: true });
  });
});

describe("coupon discount edge cases", () => {
  it("100% coupon takes full subtotal", () => {
    expect(
      computeCouponDiscount({
        coupon: { type: "percent", value: 100 },
        subtotalCents: 5000,
      })
    ).toBe(5000);
  });

  it("fixed coupon larger than subtotal caps at subtotal", () => {
    expect(
      computeCouponDiscount({
        coupon: { type: "fixed", value: 10000 },
        subtotalCents: 3000,
      })
    ).toBe(3000);
  });

  it("0% coupon returns 0", () => {
    expect(
      computeCouponDiscount({
        coupon: { type: "percent", value: 0 },
        subtotalCents: 5000,
      })
    ).toBe(0);
  });

  it("fixed 0 returns 0", () => {
    expect(
      computeCouponDiscount({
        coupon: { type: "fixed", value: 0 },
        subtotalCents: 5000,
      })
    ).toBe(0);
  });
});
