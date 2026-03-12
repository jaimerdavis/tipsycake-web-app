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

  describe("product filters", () => {
    const p1 = "prod_a";
    const p2 = "prod_b";
    const p3 = "prod_c";
    const getTags = (pid: string) => {
      if (pid === p1) return { categories: [], tags: ["new_flavor"] };
      if (pid === p2) return { categories: ["bundt"], tags: [] };
      if (pid === p3) return { categories: ["bundt"], tags: ["new_flavor"] };
      return undefined;
    };

    it("includeProductIds: discount only on matching products", () => {
      const items = [
        { productId: p1, unitPriceSnapshotCents: 3000, qty: 1 },
        { productId: p2, unitPriceSnapshotCents: 2500, qty: 1 },
      ];
      const result = computeCouponDiscount({
        coupon: {
          type: "percent",
          value: 10,
          includeProductIds: [p1],
        },
        items,
        getProductTags: getTags,
      });
      // Eligible subtotal = 3000 (only p1). 10% = 300
      expect(result).toBe(300);
    });

    it("excludeProductIds: excludes products from discount", () => {
      const items = [
        { productId: p1, unitPriceSnapshotCents: 3000, qty: 1 },
        { productId: p2, unitPriceSnapshotCents: 2500, qty: 1 },
      ];
      const result = computeCouponDiscount({
        coupon: {
          type: "percent",
          value: 10,
          excludeProductIds: [p1],
        },
        items,
        getProductTags: getTags,
      });
      // Eligible subtotal = 2500 (p2 only). 10% = 250
      expect(result).toBe(250);
    });

    it("includeCategoryTags: discount on products with matching tags", () => {
      const items = [
        { productId: p1, unitPriceSnapshotCents: 3000, qty: 1 },
        { productId: p2, unitPriceSnapshotCents: 2500, qty: 1 },
      ];
      const result = computeCouponDiscount({
        coupon: {
          type: "percent",
          value: 10,
          includeCategoryTags: ["new_flavor"],
        },
        items,
        getProductTags: getTags,
      });
      // p1 has new_flavor. Eligible = 3000. 10% = 300
      expect(result).toBe(300);
    });

    it("minSubtotalCents applies to eligible subtotal only", () => {
      const items = [
        { productId: p1, unitPriceSnapshotCents: 2000, qty: 1 },
        { productId: p2, unitPriceSnapshotCents: 4000, qty: 1 },
      ];
      const result = computeCouponDiscount({
        coupon: {
          type: "percent",
          value: 10,
          minSubtotalCents: 3000,
          includeProductIds: [p1],
        },
        items,
        getProductTags: getTags,
      });
      // Eligible = 2000 (p1 only). Below min 3000, so 0
      expect(result).toBe(0);
    });

    it("no eligible items returns 0", () => {
      const items = [
        { productId: p2, unitPriceSnapshotCents: 5000, qty: 1 },
      ];
      const result = computeCouponDiscount({
        coupon: {
          type: "percent",
          value: 10,
          includeProductIds: [p1],
        },
        items,
        getProductTags: getTags,
      });
      expect(result).toBe(0);
    });
  });
});

describe("computeCouponDiscount with product filters", () => {
  const prodA = "prod_a";
  const prodB = "prod_b";
  const prodC = "prod_c";

  const getTags = (pid: string) => {
    if (pid === prodA) return { categories: ["cakes"], tags: ["new_flavor"] };
    if (pid === prodB) return { categories: ["cakes"], tags: [] };
    if (pid === prodC) return { categories: ["bundt"], tags: ["best_seller"] };
    return undefined;
  };

  it("includeProductIds: discount only on matching products", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 2000, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 1500, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeProductIds: [prodA],
      },
      items,
      getProductTags: getTags,
    });
    // Eligible: prodA = 2000. 10% = 200
    expect(result).toBe(200);
  });

  it("includeProductIds: 0 discount when no matching products in cart", () => {
    const items = [{ productId: prodB, unitPriceSnapshotCents: 1500, qty: 1 }];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeProductIds: [prodA],
      },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(0);
  });

  it("excludeProductIds: excludes products from eligible subtotal", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 2000, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 1500, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        excludeProductIds: [prodB],
      },
      items,
      getProductTags: getTags,
    });
    // Eligible: prodA = 2000. 10% = 200
    expect(result).toBe(200);
  });

  it("includeCategoryTags: discount on products with matching tags", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 2000, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 1500, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeCategoryTags: ["new_flavor"],
      },
      items,
      getProductTags: getTags,
    });
    // prodA has new_flavor tag, eligible = 2000. 10% = 200
    expect(result).toBe(200);
  });

  it("minSubtotalCents applies to eligible subtotal only", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 1000, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 5000, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        minSubtotalCents: 2000,
        includeProductIds: [prodA],
      },
      items,
      getProductTags: getTags,
    });
    // Eligible subtotal = 1000 (prodA only), below min 2000 -> 0
    expect(result).toBe(0);
  });

  it("minSubtotalCents: applies when eligible meets min", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 2000, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 1000, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        minSubtotalCents: 1500,
        includeProductIds: [prodA],
      },
      items,
      getProductTags: getTags,
    });
    // Eligible = 2000 >= 1500, 10% = 200
    expect(result).toBe(200);
  });
});

describe("computeCouponDiscount with product filters", () => {
  const prodA = "prod_a";
  const prodB = "prod_b";
  const prodC = "prod_c";

  const getTags = (pid: string) => {
    if (pid === prodA) return { categories: ["bundt"], tags: ["new_flavor"] };
    if (pid === prodB) return { categories: ["bundt"], tags: ["popular"] };
    if (pid === prodC) return { categories: ["bundt"], tags: [] };
    return undefined;
  };

  it("includeProductIds: discount only on matching products", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 3000, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 2500, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeProductIds: [prodA],
      },
      items,
      getProductTags: getTags,
    });
    // Eligible subtotal = 3000 (prodA only). 10% = 300
    expect(result).toBe(300);
  });

  it("includeProductIds: 0 when no matching products in cart", () => {
    const items = [
      { productId: prodB, unitPriceSnapshotCents: 2500, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeProductIds: [prodA],
      },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(0);
  });

  it("excludeProductIds: excludes products from discount", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 3000, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 2500, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        excludeProductIds: [prodB],
      },
      items,
      getProductTags: getTags,
    });
    // Eligible = 3000 (prodA). 10% = 300
    expect(result).toBe(300);
  });

  it("includeCategoryTags: discount on products with matching tags", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 3000, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 2500, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeCategoryTags: ["new_flavor"],
      },
      items,
      getProductTags: getTags,
    });
    // prodA has new_flavor. Eligible = 3000. 10% = 300
    expect(result).toBe(300);
  });

  it("minSubtotalCents applies to eligible subtotal only", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 2000, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 3000, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        minSubtotalCents: 3000,
        includeProductIds: [prodA],
      },
      items,
      getProductTags: getTags,
    });
    // Eligible = 2000 (prodA). Below min 3000 => 0
    expect(result).toBe(0);
  });

  it("minSubtotalCents passes when eligible subtotal meets minimum", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 4000, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 1000, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        minSubtotalCents: 3000,
        includeProductIds: [prodA],
      },
      items,
      getProductTags: getTags,
    });
    // Eligible = 4000. 10% = 400
    expect(result).toBe(400);
  });
});

describe("computeCouponDiscount product filters", () => {
  const prodA = "prod_a";
  const prodB = "prod_b";
  const prodC = "prod_c";

  const getTags = (pid: string) => {
    if (pid === prodA) return { categories: ["cakes"], tags: ["new_flavor"] };
    if (pid === prodB) return { categories: ["cakes"], tags: [] };
    if (pid === prodC) return { categories: ["other"], tags: ["new_flavor"] };
    return undefined;
  };

  it("includeProductIds: discount only on matching products", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 3000, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 2000, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeProductIds: [prodA],
      },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(300);
  });

  it("includeCategoryTags: discount on products with matching tag", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 3000, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 2000, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeCategoryTags: ["new_flavor"],
      },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(300);
  });

  it("excludeProductIds: excludes products from discount", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 3000, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 2000, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        excludeProductIds: [prodA],
      },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(200);
  });

  it("minSubtotalCents applies to eligible subtotal only", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 2000, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 3000, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeProductIds: [prodA],
        minSubtotalCents: 2500,
      },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(0);
  });

  it("no eligible items returns 0", () => {
    const items = [{ productId: prodB, unitPriceSnapshotCents: 3000, qty: 1 }];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeProductIds: [prodA],
      },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(0);
  });
});

describe("computeCouponDiscount with product filters", () => {
  const p1 = "prod_1";
  const p2 = "prod_2";
  const p3 = "prod_3";

  const getProductTags = (productId: string) => {
    const map: Record<string, { categories: string[]; tags: string[] }> = {
      [p1]: { categories: ["bundt"], tags: ["new_flavor"] },
      [p2]: { categories: ["bundt"], tags: [] },
      [p3]: { categories: ["bundt"], tags: ["best_seller"] },
    };
    return map[productId];
  };

  it("includeProductIds: discount only on matching products", () => {
    const items = [
      { productId: p1, unitPriceSnapshotCents: 2000, qty: 1 },
      { productId: p2, unitPriceSnapshotCents: 1500, qty: 1 },
      { productId: p3, unitPriceSnapshotCents: 1800, qty: 1 },
    ];
    // 10% off, only p1 and p3 eligible. Eligible = 2000 + 1800 = 3800. Discount = 380.
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeProductIds: [p1, p3],
      },
      items,
      getProductTags,
    });
    expect(result).toBe(380);
  });

  it("excludeProductIds: excludes products from discount", () => {
    const items = [
      { productId: p1, unitPriceSnapshotCents: 2000, qty: 1 },
      { productId: p2, unitPriceSnapshotCents: 1500, qty: 1 },
      { productId: p3, unitPriceSnapshotCents: 1800, qty: 1 },
    ];
    // 10% off, exclude p2. Eligible = 2000 + 1800 = 3800. Discount = 380.
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        excludeProductIds: [p2],
      },
      items,
      getProductTags,
    });
    expect(result).toBe(380);
  });

  it("includeCategoryTags: discount on products with matching tags", () => {
    const items = [
      { productId: p1, unitPriceSnapshotCents: 2000, qty: 1 },
      { productId: p2, unitPriceSnapshotCents: 1500, qty: 1 },
      { productId: p3, unitPriceSnapshotCents: 1800, qty: 1 },
    ];
    // p1 has new_flavor, p3 has best_seller. Eligible = 2000 + 1800 = 3800.
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeCategoryTags: ["new_flavor", "best_seller"],
      },
      items,
      getProductTags,
    });
    expect(result).toBe(380);
  });

  it("minSubtotalCents applies to eligible subtotal only", () => {
    const items = [
      { productId: p1, unitPriceSnapshotCents: 1000, qty: 1 },
      { productId: p2, unitPriceSnapshotCents: 2000, qty: 1 },
    ];
    // Only p1 eligible = 1000. minSubtotalCents = 1500. Below min -> 0.
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 20,
        minSubtotalCents: 1500,
        includeProductIds: [p1],
      },
      items,
      getProductTags,
    });
    expect(result).toBe(0);
  });

  it("no eligible items returns 0", () => {
    const items = [
      { productId: p2, unitPriceSnapshotCents: 2000, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeProductIds: [p1, p3],
      },
      items,
      getProductTags,
    });
    expect(result).toBe(0);
  });

  it("exclude overrides include", () => {
    const items = [
      { productId: p1, unitPriceSnapshotCents: 2000, qty: 1 },
      { productId: p3, unitPriceSnapshotCents: 1800, qty: 1 },
    ];
    // Include p1, p3 but exclude p3. Eligible = p1 only = 2000.
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeProductIds: [p1, p3],
        excludeProductIds: [p3],
      },
      items,
      getProductTags,
    });
    expect(result).toBe(200);
  });
});

describe("computeCouponDiscount with product filters", () => {
  const prodA = "prod_a";
  const prodB = "prod_b";
  const prodC = "prod_c";

  const getTags = (productId: string) => {
    const tags: Record<string, { categories: string[]; tags: string[] }> = {
      [prodA]: { categories: ["bundt"], tags: ["new_flavor"] },
      [prodB]: { categories: ["bundt"], tags: ["popular"] },
      [prodC]: { categories: ["bundt"], tags: [] },
    };
    return tags[productId];
  };

  it("includeProductIds: discount only on matching products", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 500, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 300, qty: 2 },
    ];
    // 10% off, only prodA eligible: 500 eligible → 50 discount
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeProductIds: [prodA],
      },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(50);
  });

  it("includeProductIds: returns 0 when no matching items", () => {
    const items = [
      { productId: prodB, unitPriceSnapshotCents: 1000, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeProductIds: [prodA],
      },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(0);
  });

  it("excludeProductIds: excludes those from discount", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 500, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 500, qty: 1 },
    ];
    // 10% off, exclude prodB: only 500 eligible → 50 discount
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        excludeProductIds: [prodB],
      },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(50);
  });

  it("includeCategoryTags: discount on products with matching tag", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 400, qty: 1 },
      { productId: prodC, unitPriceSnapshotCents: 600, qty: 1 },
    ];
    // 10% off, only new_flavor (prodA): 400 eligible → 40 discount
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeCategoryTags: ["new_flavor"],
      },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(40);
  });

  it("minSubtotalCents applies to eligible subtotal only", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 300, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 700, qty: 1 },
    ];
    // 10% off, include only prodA, min 500. Eligible=300 < 500 → 0
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeProductIds: [prodA],
        minSubtotalCents: 500,
      },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(0);
  });

  it("exclude overrides include", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 500, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 500, qty: 1 },
    ];
    // Include prodA and prodB, but exclude prodB → only prodA (500) eligible
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeProductIds: [prodA, prodB],
        excludeProductIds: [prodB],
      },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(50);
  });
});

describe("computeCouponDiscount product filters", () => {
  const prodA = "prod_a";
  const prodB = "prod_b";
  const prodC = "prod_c";

  const getTags = (pid: string) => {
    const map: Record<string, { categories: string[]; tags: string[] }> = {
      [prodA]: { categories: ["cake"], tags: ["new_flavor"] },
      [prodB]: { categories: ["cake"], tags: ["popular"] },
      [prodC]: { categories: ["cake"], tags: [] },
    };
    return map[pid];
  };

  it("includeProductIds: discount only on matching products", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 500, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 500, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 20,
        includeProductIds: [prodA],
      },
      items,
      getProductTags: getTags,
    });
    // Only prodA (500) is eligible: 20% of 500 = 100
    expect(result).toBe(100);
  });

  it("includeProductIds: returns 0 when no matching products", () => {
    const items = [
      { productId: prodB, unitPriceSnapshotCents: 500, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 20,
        includeProductIds: [prodA],
      },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(0);
  });

  it("excludeProductIds: excludes products from discount", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 500, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 500, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 20,
        excludeProductIds: [prodB],
      },
      items,
      getProductTags: getTags,
    });
    // prodB excluded, only prodA (500) eligible: 20% of 500 = 100
    expect(result).toBe(100);
  });

  it("includeCategoryTags: discount on products with matching tag", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 400, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 600, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeCategoryTags: ["new_flavor"],
      },
      items,
      getProductTags: getTags,
    });
    // Only prodA has new_flavor: 10% of 400 = 40
    expect(result).toBe(40);
  });

  it("minSubtotalCents applies to eligible subtotal only", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 300, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 800, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        minSubtotalCents: 500,
        includeProductIds: [prodA],
      },
      items,
      getProductTags: getTags,
    });
    // Eligible subtotal = 300 (prodA only), below min 500 -> 0
    expect(result).toBe(0);
  });

  it("minSubtotalCents passes when eligible subtotal meets threshold", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 600, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 400, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        minSubtotalCents: 500,
        includeProductIds: [prodA],
      },
      items,
      getProductTags: getTags,
    });
    // Eligible = 600, 10% = 60
    expect(result).toBe(60);
  });
});

describe("computeCouponDiscount product filters", () => {
  const prodA = "prod_a";
  const prodB = "prod_b";
  const prodC = "prod_c";

  const getTags = (pid: string) => {
    if (pid === prodA) return { categories: ["cakes"], tags: ["new_flavor"] };
    if (pid === prodB) return { categories: ["cakes"], tags: [] };
    if (pid === prodC) return { categories: ["treats"], tags: ["new_flavor"] };
    return undefined;
  };

  it("includeProductIds: discount only on matching products", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 1000, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 500, qty: 1 },
      { productId: prodC, unitPriceSnapshotCents: 300, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeProductIds: [prodA, prodC],
      },
      items,
      getProductTags: getTags,
    });
    const eligibleSubtotal = 1000 + 300;
    expect(result).toBe(Math.floor((eligibleSubtotal * 10) / 100));
  });

  it("excludeProductIds: excludes products from eligible subtotal", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 1000, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 500, qty: 1 },
      { productId: prodC, unitPriceSnapshotCents: 300, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        excludeProductIds: [prodB],
      },
      items,
      getProductTags: getTags,
    });
    const eligibleSubtotal = 1000 + 300;
    expect(result).toBe(Math.floor((eligibleSubtotal * 10) / 100));
  });

  it("includeCategoryTags: discount on products with matching tag", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 1000, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 500, qty: 1 },
      { productId: prodC, unitPriceSnapshotCents: 300, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 20,
        includeCategoryTags: ["new_flavor"],
      },
      items,
      getProductTags: getTags,
    });
    const eligibleSubtotal = 1000 + 300;
    expect(result).toBe(Math.floor((eligibleSubtotal * 20) / 100));
  });

  it("minSubtotalCents applies to eligible subtotal only", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 500, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 500, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        minSubtotalCents: 600,
        includeProductIds: [prodA],
      },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(0);
  });

  it("minSubtotalCents passes when eligible subtotal meets minimum", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 800, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 200, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        minSubtotalCents: 500,
        includeProductIds: [prodA],
      },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(80);
  });

  it("no eligible items returns 0", () => {
    const items = [
      { productId: prodB, unitPriceSnapshotCents: 1000, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeProductIds: [prodA],
      },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(0);
  });
});

describe("computeCouponDiscount product filters", () => {
  const prodA = "prod_a";
  const prodB = "prod_b";
  const prodC = "prod_c";

  const getTags = (productId: string) => {
    const map: Record<string, { categories: string[]; tags: string[] }> = {
      prod_a: { categories: ["bundt"], tags: ["new_flavor"] },
      prod_b: { categories: ["bundt"], tags: [] },
      prod_c: { categories: ["bundt"], tags: ["best_seller"] },
    };
    return map[productId];
  };

  it("includeProductIds: discount only on matching products", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 2000, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 1500, qty: 1 },
      { productId: prodC, unitPriceSnapshotCents: 1000, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: { type: "percent", value: 20, includeProductIds: [prodA, prodC] },
      items,
      getProductTags: getTags,
    });
    const eligibleSubtotal = 2000 + 1000;
    expect(result).toBe(Math.floor((eligibleSubtotal * 20) / 100));
  });

  it("excludeProductIds: excludes products from discount", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 2000, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 1500, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: { type: "percent", value: 10, excludeProductIds: [prodB] },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(200);
  });

  it("includeCategoryTags: discount on products with matching tag", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 1000, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 1000, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: { type: "fixed", value: 300, includeCategoryTags: ["new_flavor"] },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(300);
  });

  it("eligible subtotal 0 returns 0 discount", () => {
    const items = [
      { productId: prodB, unitPriceSnapshotCents: 1000, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: { type: "percent", value: 20, includeProductIds: [prodA] },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(0);
  });

  it("minSubtotalCents applies to eligible subtotal only", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 800, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 2000, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeProductIds: [prodA],
        minSubtotalCents: 1000,
      },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(0);
  });

  it("exclude overrides include", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 1000, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeProductIds: [prodA],
        excludeProductIds: [prodA],
      },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(0);
  });
});

describe("computeCouponDiscount with product filters", () => {
  const pid1 = "prod_1";
  const pid2 = "prod_2";
  const pid3 = "prod_3";

  const getTags = (productId: string) => {
    if (productId === pid1) return { categories: ["cakes"], tags: ["new_flavor"] };
    if (productId === pid2) return { categories: ["cakes"], tags: ["popular"] };
    if (productId === pid3) return { categories: ["seasonal"], tags: [] };
    return undefined;
  };

  const items = [
    { productId: pid1, unitPriceSnapshotCents: 1000, qty: 1 },
    { productId: pid2, unitPriceSnapshotCents: 1200, qty: 1 },
    { productId: pid3, unitPriceSnapshotCents: 800, qty: 1 },
  ];

  it("includeProductIds: discount only on matching products", () => {
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeProductIds: [pid1, pid3],
      },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(180); // 10% of 1000 + 800 = 1800 -> 180
  });

  it("includeProductIds: 10% of eligible subtotal (1000+800=1800) = 180", () => {
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeProductIds: [pid1, pid3],
      },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(180);
  });

  it("includeCategoryTags: discount on products with matching tag", () => {
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeCategoryTags: ["new_flavor"],
      },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(100);
  });

  it("excludeProductIds: excludes items from eligible subtotal", () => {
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        excludeProductIds: [pid2],
      },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(180);
  });

  it("eligible subtotal 0 returns 0 discount", () => {
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeProductIds: ["nonexistent"],
      },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(0);
  });

  it("minSubtotalCents applies to eligible subtotal only", () => {
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        minSubtotalCents: 1500,
        includeProductIds: [pid1],
      },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(0);
  });

  it("minSubtotalCents met on eligible subtotal applies discount", () => {
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        minSubtotalCents: 1000,
        includeProductIds: [pid1],
      },
      items,
      getProductTags: getTags,
    });
    expect(result).toBe(100);
  });
});

describe("computeCouponDiscount with product filters", () => {
  const prodA = "prod_a";
  const prodB = "prod_b";
  const prodC = "prod_c";

  const getProductTags = (productId: string) => {
    const tags: Record<string, { categories: string[]; tags: string[] }> = {
      [prodA]: { categories: ["bundt"], tags: ["new_flavor"] },
      [prodB]: { categories: ["bundt"], tags: ["best_seller"] },
      [prodC]: { categories: ["bundt"], tags: [] },
    };
    return tags[productId];
  };

  it("includeProductIds: discount only on matching products", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 3000, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 3000, qty: 1 },
      { productId: prodC, unitPriceSnapshotCents: 2000, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 20,
        includeProductIds: [prodA, prodB],
      },
      items,
      getProductTags,
    });
    expect(result).toBe(1200);
  });

  it("includeProductIds: 0 discount when no matching products", () => {
    const items = [
      { productId: prodC, unitPriceSnapshotCents: 2000, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 20,
        includeProductIds: [prodA, prodB],
      },
      items,
      getProductTags,
    });
    expect(result).toBe(0);
  });

  it("excludeProductIds: excludes matching products from eligible subtotal", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 3000, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 3000, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 20,
        excludeProductIds: [prodB],
      },
      items,
      getProductTags,
    });
    expect(result).toBe(600);
  });

  it("includeCategoryTags: discount on products with matching tag", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 3000, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 2000, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 10,
        includeCategoryTags: ["new_flavor"],
      },
      items,
      getProductTags,
    });
    expect(result).toBe(300);
  });

  it("minSubtotalCents applies to eligible subtotal only", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 2000, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 5000, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 20,
        minSubtotalCents: 3000,
        includeProductIds: [prodA],
      },
      items,
      getProductTags,
    });
    expect(result).toBe(0);
  });

  it("minSubtotalCents applies when eligible subtotal meets minimum", () => {
    const items = [
      { productId: prodA, unitPriceSnapshotCents: 3000, qty: 1 },
      { productId: prodB, unitPriceSnapshotCents: 5000, qty: 1 },
    ];
    const result = computeCouponDiscount({
      coupon: {
        type: "percent",
        value: 20,
        minSubtotalCents: 2500,
        includeProductIds: [prodA],
      },
      items,
      getProductTags,
    });
    expect(result).toBe(600);
  });
});
