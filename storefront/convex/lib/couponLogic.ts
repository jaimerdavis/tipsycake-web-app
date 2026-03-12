/**
 * Pure coupon discount computation (no Convex deps). Used by coupons.ts, cart, orders, payments, and tests.
 *
 * Supports two modes:
 * - Legacy: pass subtotalCents when coupon has no product/category filters.
 * - Filtered: pass items + getProductTags when coupon has includeProductIds, excludeProductIds,
 *   includeCategoryTags, or excludeCategoryTags. Discount applies only to eligible items.
 */

export interface CartItemForCoupon {
  productId: string;
  unitPriceSnapshotCents: number;
  qty: number;
}

export interface ProductTags {
  categories: string[];
  tags: string[];
}

export interface CouponForDiscount {
  type: "percent" | "fixed" | "free_delivery";
  value: number;
  minSubtotalCents?: number;
  includeProductIds?: string[];
  includeCategoryTags?: string[];
  excludeProductIds?: string[];
  excludeCategoryTags?: string[];
}

function hasProductFilters(coupon: CouponForDiscount): boolean {
  return (
    (coupon.includeProductIds?.length ?? 0) > 0 ||
    (coupon.includeCategoryTags?.length ?? 0) > 0 ||
    (coupon.excludeProductIds?.length ?? 0) > 0 ||
    (coupon.excludeCategoryTags?.length ?? 0) > 0
  );
}

function isItemEligible(
  productId: string,
  coupon: CouponForDiscount,
  getProductTags: (productId: string) => ProductTags | undefined
): boolean {
  const tags = getProductTags(productId);
  const productTags = new Set([
    ...(tags?.categories ?? []),
    ...(tags?.tags ?? []),
  ]);

  const hasInclude =
    (coupon.includeProductIds?.length ?? 0) > 0 ||
    (coupon.includeCategoryTags?.length ?? 0) > 0;
  const hasExclude =
    (coupon.excludeProductIds?.length ?? 0) > 0 ||
    (coupon.excludeCategoryTags?.length ?? 0) > 0;

  // Exclude: item ineligible if productId in excludeProductIds OR tags intersect excludeCategoryTags
  if (hasExclude) {
    const excludedById =
      coupon.excludeProductIds?.includes(productId) ?? false;
    const excludedByTag =
      (coupon.excludeCategoryTags?.some((t) => productTags.has(t)) ?? false);
    if (excludedById || excludedByTag) return false;
  }

  // Include: when filters exist, item must match include; when no include filters, all match
  if (hasInclude) {
    const includedById =
      coupon.includeProductIds?.includes(productId) ?? false;
    const includedByTag =
      coupon.includeCategoryTags?.some((t) => productTags.has(t)) ?? false;
    if (!includedById && !includedByTag) return false;
  }

  return true;
}

/** Compute subtotal from eligible items only (product/category filters). */
export function computeEligibleSubtotalCents(
  items: CartItemForCoupon[],
  coupon: CouponForDiscount,
  getProductTags: (productId: string) => ProductTags | undefined
): number {
  if (!hasProductFilters(coupon)) {
    return items.reduce(
      (sum, i) => sum + i.unitPriceSnapshotCents * i.qty,
      0
    );
  }
  return items.reduce((sum, item) => {
    if (!isItemEligible(item.productId, coupon, getProductTags)) return sum;
    return sum + item.unitPriceSnapshotCents * item.qty;
  }, 0);
}

export type ComputeCouponDiscountParams =
  | {
      coupon: CouponForDiscount;
      subtotalCents: number;
    }
  | {
      coupon: CouponForDiscount;
      items: CartItemForCoupon[];
      getProductTags: (productId: string) => ProductTags | undefined;
    };

export function computeCouponDiscount(params: ComputeCouponDiscountParams): number {
  let subtotalCents: number;

  if ("subtotalCents" in params) {
    subtotalCents = params.subtotalCents;
  } else {
    subtotalCents = computeEligibleSubtotalCents(
      params.items,
      params.coupon,
      params.getProductTags
    );
  }

  const { coupon } = params;
  if (coupon.minSubtotalCents && subtotalCents < coupon.minSubtotalCents) {
    return 0;
  }
  if (coupon.type === "free_delivery") return 0;
  if (coupon.type === "percent") {
    return Math.max(0, Math.floor((subtotalCents * coupon.value) / 100));
  }
  return Math.max(0, Math.min(subtotalCents, coupon.value));
}
