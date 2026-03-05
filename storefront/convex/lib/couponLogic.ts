/** Pure coupon discount computation (no Convex deps). Used by coupons.ts and tests. */
export function computeCouponDiscount(params: {
  coupon: {
    type: "percent" | "fixed" | "free_delivery";
    value: number;
    minSubtotalCents?: number;
  };
  subtotalCents: number;
}) {
  const { coupon, subtotalCents } = params;
  if (coupon.minSubtotalCents && subtotalCents < coupon.minSubtotalCents) {
    return 0;
  }
  if (coupon.type === "free_delivery") return 0;
  if (coupon.type === "percent") {
    return Math.max(0, Math.floor((subtotalCents * coupon.value) / 100));
  }
  return Math.max(0, Math.min(subtotalCents, coupon.value));
}
