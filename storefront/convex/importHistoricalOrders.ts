/**
 * Historical order import from WooCommerce CSV export.
 *
 * IMPORTANT: This import does NOT send any notifications. Orders are inserted
 * with status "completed" and bypass all notification triggers (confirmation emails,
 * owner notifications, status updates, reminders).
 *
 * Prerequisites:
 * 1. Run seed:seedImportProducts to add Piña Colada and Create Your Own (Legacy)
 * 2. Ensure Shape modifier group exists (seed:seedModifiers)
 */

import { internalMutation, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireRole } from "./lib/auth";
import { STORE_ORIGIN } from "./lib/storeConfig";

function base64Decode(str: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  const bytes: number[] = [];
  str = str.replace(/[^A-Za-z0-9+/=]/g, "");
  for (let i = 0; i < str.length; i += 4) {
    const enc1 = chars.indexOf(str[i]);
    const enc2 = chars.indexOf(str[i + 1]);
    const enc3 = chars.indexOf(str[i + 2]);
    const enc4 = chars.indexOf(str[i + 3]);
    bytes.push((enc1 << 2) | (enc2 >> 4));
    if (enc3 !== 64) bytes.push(((enc2 & 15) << 4) | (enc3 >> 2));
    if (enc4 !== 64) bytes.push(((enc3 & 3) << 6) | enc4);
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function randomGuestToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `import-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

/** Parse CSV line handling quoted fields. */
function parseCsvLine(line: string, delimiter = ","): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (inQuotes) {
      current += c;
    } else if (c === delimiter) {
      result.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

/** Detect delimiter: tab if more tabs than commas in first line (typical when pasting from Excel). */
function detectDelimiter(line: string): "," | "\t" {
  const tabs = (line.match(/\t/g) ?? []).length;
  const commas = (line.match(/,/g) ?? []).length;
  return tabs >= commas ? "\t" : ",";
}

/** Map CSV Item Name -> { productSlug, shape } */
function mapItemNameToProductAndShape(itemName: string): {
  productSlug: string;
  shape: "Mixed" | "Even 20" | "Rose" | "Blossom";
} | null {
  const n = itemName.trim().toLowerCase();
  const shapes = ["even 20", "mixed", "rose", "blossom"] as const;
  let shape: (typeof shapes)[number] = "even 20";
  for (const s of shapes) {
    if (n.includes(s)) {
      shape = s;
      break;
    }
  }
  const shapeMap = { "even 20": "Even 20", mixed: "Mixed", rose: "Rose", blossom: "Blossom" } as const;

  // Order matters: more specific first
  const patterns: Array<{ pattern: RegExp | ((n: string) => boolean); slug: string }> = [
    { pattern: (x) => x.includes("create your own") && !x.includes("rum"), slug: "create-your-own-legacy" },
    { pattern: /piña colada|pina colada/i, slug: "pina-colada-cake" },
    { pattern: /jamaican fruit.*seasonal.*mixed/i, slug: "jamaican-fruit-cake" },
    { pattern: /jamaican fruit.*seasonal.*even/i, slug: "jamaican-fruit-cake" },
    { pattern: /jamaican fruit.*blossom/i, slug: "jamaican-fruit-cake" },
    { pattern: /jamaican fruit.*even 20/i, slug: "jamaican-fruit-cake" },
    { pattern: /jamaican fruit.*mixed/i, slug: "jamaican-fruit-cake" },
    { pattern: /vanilla rum or baileys.*appleton|vanilla rum\/baileys.*appleton/i, slug: "vanilla-rum-cake" },
    { pattern: /vanilla rum or baileys.*baileys|vanilla rum\/baileys.*baileys/i, slug: "vanilla-baileys-cake" },
    { pattern: /vanilla rum cake/i, slug: "vanilla-rum-cake" },
    { pattern: /vanilla baileys cake/i, slug: "vanilla-baileys-cake" },
    { pattern: /chocolate rum or baileys.*appleton|chocolate rum\/baileys.*appleton/i, slug: "chocolate-rum-cake" },
    { pattern: /chocolate rum or baileys.*baileys|chocolate rum\/baileys.*baileys/i, slug: "chocolate-baileys-cake" },
    { pattern: /chocolate rum cake/i, slug: "chocolate-rum-cake" },
    { pattern: /chocolate baileys cake/i, slug: "chocolate-baileys-cake" },
    { pattern: /red velvet rum or baileys.*appleton|red velvet rum\/baileys.*appleton/i, slug: "red-velvet-rum-cake" },
    { pattern: /red velvet rum or baileys.*baileys|red velvet rum\/baileys.*baileys/i, slug: "red-velvet-baileys-cake" },
    { pattern: /red velvet rum cake/i, slug: "red-velvet-rum-cake" },
    { pattern: /red velvet baileys cake/i, slug: "red-velvet-baileys-cake" },
    { pattern: /rum raisin cake|rum raisin -/i, slug: "rum-raisin-cake" },
    { pattern: /french connection cake|french connection -/i, slug: "french-connection-cake" },
    { pattern: /egg nog cake|egg nog -/i, slug: "egg-nog-cake-seasonal" },
    { pattern: /caramel apple/i, slug: "caramel-apple-cake-seasonal" },
    { pattern: /buttery nipple/i, slug: "buttery-nipple-cake" },
    { pattern: /spice -/i, slug: "spice-rum-cake" },
  ];

  for (const { pattern, slug } of patterns) {
    const match = typeof pattern === "function" ? pattern(n) : pattern.test(n);
    if (match) {
      return { productSlug: slug, shape: shapeMap[shape] };
    }
  }
  return null;
}

interface CsvRow {
  orderNumber: string;
  orderDate: string;
  email: string;
  phone: string;
  contactName?: string;
  billingFirstName: string;
  billingLastName: string;
  billingAddress: string;
  billingAddress2: string;
  billingCity: string;
  billingState: string;
  billingZip: string;
  billingCountry: string;
  deliveryFirstName: string;
  deliveryLastName: string;
  deliveryAddress: string;
  deliveryAddress2: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryZip: string;
  deliveryCountry: string;
  cartDiscountAmount: number;
  orderSubtotal: number;
  orderDeliveryAmount: number;
  orderTotal: number;
  itemName: string;
  quantity: number;
  itemCost: number;
  couponCode: string;
}

function parseCsv(csvContent: string): CsvRow[] {
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]);
  const idx = (name: string) => {
    const i = header.findIndex((h) => h.toLowerCase().includes(name.toLowerCase()));
    return i >= 0 ? i : -1;
  };

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const get = (name: string) => {
      const i = idx(name);
      return i >= 0 && cells[i] !== undefined ? cells[i] : "";
    };
    const num = (name: string) => {
      const s = get(name).replace(/[^0-9.-]/g, "");
      return parseFloat(s) || 0;
    };

    const billingFirst = get("First Name (Billing)");
    const billingLast = get("Last Name (Billing)");
    const contactName = [billingFirst, billingLast].filter(Boolean).join(" ").trim() || undefined;
    rows.push({
      orderNumber: get("Order Number"),
      orderDate: get("Order Date"),
      email: get("Email (Billing)").trim(),
      phone: get("Phone (Billing)").trim(),
      contactName,
      billingFirstName: billingFirst,
      billingLastName: billingLast,
      billingAddress: (get("Address 1&2 (Billing)") || get("Address 1 (Billing)") || "").replace(/&/g, " ").trim(),
      billingAddress2: (get("Address 2 (Billing)") || "").trim(),
      billingCity: get("City (Billing)"),
      billingState: get("State Code (Billing)"),
      billingZip: get("Postcode (Billing)"),
      billingCountry: get("Country Code (Billing)"),
      deliveryFirstName: get("First Name (Delivery)"),
      deliveryLastName: get("Last Name (Delivery)"),
      deliveryAddress: (get("Address 1&2 (Delivery)") || get("Address 1 (Delivery)") || "").replace(/&/g, " ").trim(),
      deliveryAddress2: (get("Address 2 (Delivery)") || "").trim(),
      deliveryCity: get("City (Delivery)"),
      deliveryState: get("State Code (Delivery)"),
      deliveryZip: get("Postcode (Delivery)"),
      deliveryCountry: get("Country Code (Delivery)"),
      cartDiscountAmount: num("Cart Discount Amount"),
      orderSubtotal: num("Order Subtotal Amount"),
      orderDeliveryAmount: num("Order Delivery Amount"),
      orderTotal: num("Order Total Amount"),
      itemName: get("Item Name").replace(/^"|"$/g, ""),
      quantity: Math.max(1, Math.round(num("Quantity (- Refund)"))),
      itemCost: num("Item Cost"),
      couponCode: get("Coupon Code").trim(),
    });
  }
  return rows;
}

/** Group rows by order number and aggregate. */
function groupByOrder(rows: CsvRow[]): Map<
  string,
  {
    order: Omit<CsvRow, "itemName" | "quantity" | "itemCost" | "couponCode">;
    items: Array<{ itemName: string; quantity: number; itemCost: number; couponCode: string }>;
  }
> {
  const map = new Map<
    string,
    {
      order: Omit<CsvRow, "itemName" | "quantity" | "itemCost" | "couponCode">;
      items: Array<{ itemName: string; quantity: number; itemCost: number; couponCode: string }>;
    }
  >();

  for (const row of rows) {
    const key = row.orderNumber;
    if (!key) continue;

    const {
      itemName,
      quantity,
      itemCost,
      couponCode,
      orderNumber,
      orderDate,
      email,
      phone,
      billingFirstName,
      billingLastName,
      billingAddress,
      billingAddress2,
      billingCity,
      billingState,
      billingZip,
      billingCountry,
      deliveryFirstName,
      deliveryLastName,
      deliveryAddress,
      deliveryAddress2,
      deliveryCity,
      deliveryState,
      deliveryZip,
      deliveryCountry,
      cartDiscountAmount,
      orderSubtotal,
      orderDeliveryAmount,
      orderTotal,
    } = row;

    if (!map.has(key)) {
      const contactName = [billingFirstName, billingLastName].filter(Boolean).join(" ").trim() || undefined;
      map.set(key, {
        order: {
          orderNumber,
          orderDate,
          email,
          phone,
          contactName,
          billingFirstName,
          billingLastName,
          billingAddress,
          billingAddress2,
          billingCity,
          billingState,
          billingZip,
          billingCountry,
          deliveryFirstName,
          deliveryLastName,
          deliveryAddress,
          deliveryAddress2,
          deliveryCity,
          deliveryState,
          deliveryZip,
          deliveryCountry,
          cartDiscountAmount,
          orderSubtotal,
          orderDeliveryAmount,
          orderTotal,
        },
        items: [],
      });
    }
    map.get(key)!.items.push({ itemName, quantity, itemCost, couponCode });
  }
  return map;
}

function parseOrderDate(s: string): number {
  // M/D/YYYY or M/D/YYYY HH:mm
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return Date.now();
  const [, month, day, year, hour, min] = m;
  const d = new Date(
    parseInt(year, 10),
    parseInt(month, 10) - 1,
    parseInt(day, 10),
    parseInt(hour ?? "12", 10),
    parseInt(min ?? "0", 10)
  );
  return d.getTime();
}

/** Import a single historical order. No notifications. */
export const importOneOrder = internalMutation({
  args: {
    csvContent: v.string(),
    orderNumber: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const rows = parseCsv(args.csvContent);
    const groups = groupByOrder(rows);
    const group = groups.get(args.orderNumber);
    if (!group) return { ok: false, error: "Order not found in CSV" };
    return runImportOrder(ctx, group.order, group.items, args.dryRun);
  },
});

/**
 * Import one order from base64-encoded JSON payload. Use from scripts to avoid
 * CLI arg parsing issues on Windows. NO notifications. Status "completed".
 */
export const importSingleOrder = mutation({
  args: {
    payloadBase64: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let payload: {
      order: {
        orderNumber: string;
        orderDate: string;
        email: string;
        phone: string;
        contactName?: string;
        deliveryAddress?: string;
        deliveryAddress2?: string;
        deliveryCity?: string;
        deliveryState?: string;
        deliveryZip?: string;
        billingAddress?: string;
        billingAddress2?: string;
        billingCity?: string;
        billingState?: string;
        billingZip?: string;
        cartDiscountAmount: number;
        orderDeliveryAmount: number;
        orderTotal: number;
      };
      items: Array<{ itemName: string; quantity: number; itemCost: number; couponCode: string }>;
    };
    try {
      const decoded = base64Decode(args.payloadBase64);
      payload = JSON.parse(decoded) as typeof payload;
    } catch {
      return { ok: false, error: "Invalid payloadBase64" };
    }
    return runImportOrder(ctx, payload.order, payload.items, args.dryRun);
  },
});

/** Address source: delivery (where cake goes) first, billing (payer) as fallback when delivery empty. */
function resolveAddress(order: {
  deliveryAddress?: string;
  deliveryAddress2?: string;
  deliveryCity?: string;
  deliveryState?: string;
  deliveryZip?: string;
  billingAddress?: string;
  billingAddress2?: string;
  billingCity?: string;
  billingState?: string;
  billingZip?: string;
}): { line1: string; line2?: string; city: string; state: string; zip: string } | null {
  const hasDelivery = !!(order.deliveryAddress?.trim() || order.deliveryCity?.trim() || order.deliveryZip?.trim());
  const hasBilling = !!(order.billingAddress?.trim() || order.billingCity?.trim() || order.billingZip?.trim());
  const use = hasDelivery
    ? {
        line1: (order.deliveryAddress ?? "").trim(),
        line2: (order.deliveryAddress2 ?? "").trim() || undefined,
        city: (order.deliveryCity ?? "").trim(),
        state: (order.deliveryState ?? "").trim(),
        zip: (order.deliveryZip ?? "").trim(),
      }
    : hasBilling
      ? {
          line1: (order.billingAddress ?? "").trim(),
          line2: (order.billingAddress2 ?? "").trim() || undefined,
          city: (order.billingCity ?? "").trim(),
          state: (order.billingState ?? "").trim(),
          zip: (order.billingZip ?? "").trim(),
        }
      : null;
  if (!use || (!use.line1 && !use.city)) return null;
  return {
    line1: use.line1 || use.city || "Unknown",
    line2: use.line2,
    city: use.city || "Unknown",
    state: use.state || "FL",
    zip: use.zip || "33319",
  };
}

/** Shared import logic. Uses delivery address for fulfillment; falls back to billing when delivery empty. */
async function runImportOrder(
  ctx: MutationCtx,
  order: {
    orderNumber: string;
    orderDate: string;
    email: string;
    phone: string;
    contactName?: string;
    deliveryAddress?: string;
    deliveryAddress2?: string;
    deliveryCity?: string;
    deliveryState?: string;
    deliveryZip?: string;
    billingAddress?: string;
    billingAddress2?: string;
    billingCity?: string;
    billingState?: string;
    billingZip?: string;
    cartDiscountAmount: number;
    orderDeliveryAmount: number;
    orderTotal: number;
  },
  items: Array<{ itemName: string; quantity: number; itemCost: number; couponCode: string }>,
  dryRun?: boolean
) {
  if (order.orderTotal <= 0) {
    return { ok: true, skipped: true, reason: "Zero total (test order)" };
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      orderNumber: order.orderNumber,
      itemCount: items.length,
      totalCents: Math.round(order.orderTotal * 100),
    };
  }

  const existing = await ctx.db
    .query("orders")
    .withIndex("by_orderNumber", (q) => q.eq("orderNumber", order.orderNumber))
    .unique();
  if (existing) {
    return { ok: true, skipped: true, reason: "Already exists" };
  }

  const now = Date.now();
  const products = await ctx.db.query("products").collect();
  const slugToProduct = new Map(products.map((p) => [p.slug, p]));

  const shapeGroup = await ctx.db
    .query("modifierGroups")
    .filter((q) => q.eq(q.field("name"), "Shape"))
    .first();
  if (!shapeGroup) {
    return { ok: false, error: "Shape modifier group not found. Run seed:seedModifiers first." };
  }
  const shapeOptions = await ctx.db
    .query("modifierOptions")
    .withIndex("by_group", (q) => q.eq("groupId", shapeGroup._id))
    .collect();
  const shapeNameToOption = new Map(shapeOptions.map((o) => [o.name, o]));

  const orderItems: Array<{ productId: Id<"products">; productName: string; variantSnapshot: null; modifiersSnapshot: Array<{ groupId: Id<"modifierGroups">; optionId: Id<"modifierOptions">; groupName: string; optionName: string; priceDeltaCents: number }>; qty: number; unitPriceCents: number }> = [];

  for (const item of items) {
    const mapped = mapItemNameToProductAndShape(item.itemName);
    if (!mapped) {
      return { ok: false, error: `Unmapped item: ${item.itemName}` };
    }
    const product = slugToProduct.get(mapped.productSlug);
    if (!product) {
      return {
        ok: false,
        error: `Product not found for slug: ${mapped.productSlug}. Run seed:seedImportProducts first.`,
      };
    }
    const shapeOpt = shapeNameToOption.get(mapped.shape);
    if (!shapeOpt) {
      return { ok: false, error: `Shape option not found: ${mapped.shape}` };
    }

    const unitPriceCents = Math.round((item.itemCost > 0 ? item.itemCost : product.basePriceCents / 100) * 100);
    orderItems.push({
      productId: product._id,
      productName: product.name,
      variantSnapshot: null,
      modifiersSnapshot: [
        {
          groupId: shapeGroup._id,
          optionId: shapeOpt._id,
          groupName: shapeGroup.name,
          optionName: shapeOpt.name,
          priceDeltaCents: shapeOpt.priceDeltaCents ?? 0,
        },
      ],
      qty: item.quantity,
      unitPriceCents,
    });
  }

  const subtotalCents = orderItems.reduce((s, i) => s + i.unitPriceCents * i.qty, 0);
  const deliveryFeeCents = Math.round(order.orderDeliveryAmount * 100);
  const discountCents = Math.round(order.cartDiscountAmount * 100);
  const totalCents = Math.round(order.orderTotal * 100);
  const tipCents = Math.max(0, totalCents - subtotalCents + discountCents - deliveryFeeCents);

  const addr = resolveAddress(order);
  const fulfillmentMode: "pickup" | "delivery" | "shipping" = addr
    ? addr.state && addr.state !== "FL"
      ? "shipping"
      : "delivery"
    : "pickup";

  let addressId: Id<"addresses"> | undefined;
  if (addr) {
    const formatted = [addr.line1, addr.line2, addr.city, addr.state, addr.zip].filter(Boolean).join(", ");
    addressId = await ctx.db.insert("addresses", {
      ownerId: "historical-import",
      formatted,
      line1: addr.line1,
      line2: addr.line2,
      city: addr.city,
      state: addr.state,
      zip: addr.zip,
      lat: STORE_ORIGIN.lat,
      lng: STORE_ORIGIN.lng,
      createdAt: now,
    });
  }

  const orderId = await ctx.db.insert("orders", {
    orderNumber: order.orderNumber,
    guestToken: randomGuestToken(),
    status: "completed",
    contactEmail: order.email || undefined,
    contactName: order.contactName?.trim() || undefined,
    contactPhone: order.phone || undefined,
    fulfillmentMode,
    addressId,
    pricingSnapshot: {
      subtotalCents,
      discountCents,
      deliveryFeeCents,
      shippingFeeCents: fulfillmentMode === "shipping" ? deliveryFeeCents : 0,
      tipCents,
      taxCents: 0,
      totalCents,
    },
    appliedCouponCode: items[0]?.couponCode || undefined,
    createdAt: parseOrderDate(order.orderDate) || now,
    updatedAt: now,
  });

  for (const item of orderItems) {
    await ctx.db.insert("orderItems", {
      orderId,
      productSnapshot: { productId: item.productId, name: item.productName },
      variantSnapshot: undefined,
      modifiersSnapshot: item.modifiersSnapshot,
      qty: item.qty,
      unitPriceCents: item.unitPriceCents,
      createdAt: now,
    });
  }

  await ctx.db.insert("orderEvents", {
    orderId,
    status: "completed",
    note: "Historical import from WooCommerce",
    actorType: "system",
    createdAt: now,
  });

  return { ok: true, orderId, orderNumber: order.orderNumber };
}

/**
 * Import all historical orders from WooCommerce CSV.
 * NO notifications are sent. Orders are created with status "completed".
 *
 * Run: npx convex run importHistoricalOrders:importFromCsv '{"csvContent":"...","dryRun":true}'
 * Or pass csvContent as the full CSV string. Use dryRun: true to validate without inserting.
 */
export const importFromCsv = mutation({
  args: {
    csvContent: v.string(),
    dryRun: v.optional(v.boolean()),
    skipZeroTotal: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const rows = parseCsv(args.csvContent);
    const groups = groupByOrder(rows);
    const orderNumbers = [...groups.keys()].sort((a, b) => {
      const ga = groups.get(a)!;
      const gb = groups.get(b)!;
      return parseOrderDate(ga.order.orderDate) - parseOrderDate(gb.order.orderDate);
    });

    const skipZeroTotal = args.skipZeroTotal ?? true;
    const results: Array<{ orderNumber: string; status: string; detail?: string }> = [];
    let imported = 0;
    let skipped = 0;
    let errors: string[] = [];

    for (const orderNumber of orderNumbers) {
      const group = groups.get(orderNumber)!;
      if (skipZeroTotal && group.order.orderTotal <= 0) {
        results.push({ orderNumber, status: "skipped", detail: "Zero total" });
        skipped++;
        continue;
      }

      const result = (await ctx.runMutation(internal.importHistoricalOrders.importOneOrder, {
        csvContent: args.csvContent,
        orderNumber,
        dryRun: args.dryRun,
      })) as { ok: boolean; error?: string; skipped?: boolean; reason?: string; orderId?: Id<"orders"> };

      if (!result.ok) {
        errors.push(`${orderNumber}: ${result.error}`);
        results.push({ orderNumber, status: "error", detail: result.error });
      } else if (result.skipped) {
        results.push({ orderNumber, status: "skipped", detail: result.reason });
        skipped++;
      } else {
        results.push({ orderNumber, status: "imported" });
        imported++;
      }
    }

    return {
      ok: errors.length === 0,
      dryRun: args.dryRun ?? false,
      imported,
      skipped,
      total: orderNumbers.length,
      errors: errors.length > 0 ? errors : undefined,
      results: results.slice(-20),
    };
  },
});

/**
 * Build email -> contactName map from CSV. Tries multiple common column names.
 */
function parseCsvEmailToName(csvContent: string): Map<string, string> {
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return new Map();

  const delim = detectDelimiter(lines[0]);
  const header = parseCsvLine(lines[0], delim);
  const idxAny = (...candidates: string[]) => {
    for (const c of candidates) {
      const i = header.findIndex((h) => h.toLowerCase().includes(c.toLowerCase()));
      if (i >= 0) return i;
    }
    return -1;
  };

  const emailCol = idxAny(
    "email (billing)",
    "billing email",
    "email address",
    "customer email",
    "contact email",
    "e-mail",
    "email"
  );
  const firstCol = idxAny("first name (billing)", "billing first name", "first name");
  const lastCol = idxAny("last name (billing)", "billing last name", "last name");
  if (emailCol < 0) return new Map();

  const map = new Map<string, string>();
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i], delim);
    const email = (cells[emailCol] ?? "").trim().toLowerCase();
    if (!email) continue;
    const first = firstCol >= 0 ? (cells[firstCol] ?? "").trim() : "";
    const last = lastCol >= 0 ? (cells[lastCol] ?? "").trim() : "";
    const name = [first, last].filter(Boolean).join(" ").trim();
    if (name) map.set(email, name);
  }
  return map;
}

/** Build email -> address map from CSV. Delivery first, billing fallback. */
function parseCsvEmailToAddress(csvContent: string): Map<
  string,
  { line1: string; line2?: string; city: string; state: string; zip: string }
> {
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return new Map();

  const delim = detectDelimiter(lines[0]);
  const header = parseCsvLine(lines[0], delim);
  const idxAny = (...candidates: string[]) => {
    for (const c of candidates) {
      const i = header.findIndex((h) => h.toLowerCase().includes(c.toLowerCase()));
      if (i >= 0) return i;
    }
    return -1;
  };

  const emailCol = idxAny("email (billing)", "billing email", "email address", "email");
  const delAddrCol = idxAny("address 1&2 (delivery)", "address 1 (delivery)", "address (delivery)", "delivery address");
  const delAddr2Col = idxAny("address 2 (delivery)");
  const delCityCol = idxAny("city (delivery)", "delivery city");
  const delStateCol = idxAny("state (delivery)", "state code (delivery)");
  const delZipCol = idxAny("postcode (delivery)", "zip (delivery)", "postal (delivery)");
  const bilAddrCol = idxAny("address 1&2 (billing)", "address 1 (billing)", "address (billing)", "billing address");
  const bilAddr2Col = idxAny("address 2 (billing)");
  const bilCityCol = idxAny("city (billing)", "billing city");
  const bilStateCol = idxAny("state (billing)", "state code (billing)");
  const bilZipCol = idxAny("postcode (billing)", "zip (billing)", "postal (billing)");
  if (emailCol < 0) return new Map();

  const map = new Map<string, { line1: string; line2?: string; city: string; state: string; zip: string }>();

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i], delim);
    const email = (cells[emailCol] ?? "").trim().toLowerCase();
    if (!email) continue;

    const delLine1 = delAddrCol >= 0 ? (cells[delAddrCol] ?? "").replace(/&/g, " ").trim() : "";
    const delLine2 = delAddr2Col >= 0 ? (cells[delAddr2Col] ?? "").trim() : "";
    const delCity = delCityCol >= 0 ? (cells[delCityCol] ?? "").trim() : "";
    const delState = delStateCol >= 0 ? (cells[delStateCol] ?? "").trim() : "";
    const delZip = delZipCol >= 0 ? (cells[delZipCol] ?? "").trim() : "";

    const bilLine1 = bilAddrCol >= 0 ? (cells[bilAddrCol] ?? "").replace(/&/g, " ").trim() : "";
    const bilLine2 = bilAddr2Col >= 0 ? (cells[bilAddr2Col] ?? "").trim() : "";
    const bilCity = bilCityCol >= 0 ? (cells[bilCityCol] ?? "").trim() : "";
    const bilState = bilStateCol >= 0 ? (cells[bilStateCol] ?? "").trim() : "";
    const bilZip = bilZipCol >= 0 ? (cells[bilZipCol] ?? "").trim() : "";

    const hasDel = !!(delLine1 || delCity || delZip);
    const hasBil = !!(bilLine1 || bilCity || bilZip);
    const use = hasDel
      ? { line1: delLine1 || delCity || "Unknown", line2: delLine2 || undefined, city: delCity || "Unknown", state: delState || "FL", zip: delZip || "33319" }
      : hasBil
        ? { line1: bilLine1 || bilCity || "Unknown", line2: bilLine2 || undefined, city: bilCity || "Unknown", state: bilState || "FL", zip: bilZip || "33319" }
        : null;
    if (use && (use.line1 || use.city)) map.set(email, use);
  }
  return map;
}

/**
 * Backfill contactName on existing orders from WooCommerce CSV.
 * Matches by contactEmail (not order number) — more robust for different CSV formats.
 * Does NOT re-import — only updates contactName.
 *
 * Run from Admin → Customers → Data maintenance, or Convex Dashboard.
 */
export const backfillContactNamesFromCsv = mutation({
  args: { csvContent: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const emailToName = parseCsvEmailToName(args.csvContent);
    if (emailToName.size === 0) {
      return { ok: false, error: "No email/name pairs found. Check CSV has Email and First/Last Name columns. Try comma or tab-separated.", updated: 0, totalInCsv: 0 };
    }

    const orders = await ctx.db.query("orders").collect();
    const dbEmails = new Set(
      orders
        .map((o) => o.contactEmail?.trim()?.toLowerCase())
        .filter((e): e is string => typeof e === "string")
    );
    const csvEmails = new Set(emailToName.keys());
    const now = Date.now();
    let updated = 0;

    for (const order of orders) {
      const email = order.contactEmail?.trim()?.toLowerCase();
      if (!email) continue;
      const contactName = emailToName.get(email);
      if (!contactName) continue;
      await ctx.db.patch(order._id, { contactName, updatedAt: now });
      updated++;
    }

    const overlap = [...dbEmails].filter((e) => csvEmails.has(e)).length;
    const hint =
      updated === 0 && overlap === 0 && dbEmails.size > 0
        ? ` No overlap: CSV has ${csvEmails.size} emails, DB has ${dbEmails.size}. Sample CSV: ${[...csvEmails].slice(0, 3).join(", ")}. Sample DB: ${[...dbEmails].slice(0, 3).join(", ")}.`
        : "";

    return { ok: true, updated, totalInCsv: emailToName.size, ...(hint ? { hint } : {}) };
  },
});

/**
 * Backfill addresses on existing orders from WooCommerce CSV.
 * Uses delivery address (where cake goes) first; falls back to billing when delivery empty.
 * Only updates orders that need an address (delivery/shipping) and have matching contactEmail.
 */
export const backfillAddressesFromCsv = mutation({
  args: { csvContent: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const emailToAddr = parseCsvEmailToAddress(args.csvContent);
    if (emailToAddr.size === 0) {
      return { ok: false, error: "No email/address pairs found. Check CSV has Email and address columns.", updated: 0, totalInCsv: 0 };
    }

    const orders = await ctx.db.query("orders").collect();
    const now = Date.now();
    let updated = 0;

    for (const order of orders) {
      if (order.fulfillmentMode !== "delivery" && order.fulfillmentMode !== "shipping") continue;
      const email = order.contactEmail?.trim()?.toLowerCase();
      if (!email) continue;
      const addr = emailToAddr.get(email);
      if (!addr) continue;

      const formatted = [addr.line1, addr.line2, addr.city, addr.state, addr.zip].filter(Boolean).join(", ");
      let addressId: Id<"addresses">;
      if (order.addressId) {
        await ctx.db.patch(order.addressId, {
          formatted,
          line1: addr.line1,
          line2: addr.line2,
          city: addr.city,
          state: addr.state,
          zip: addr.zip,
          lat: STORE_ORIGIN.lat,
          lng: STORE_ORIGIN.lng,
        });
        addressId = order.addressId;
      } else {
        addressId = await ctx.db.insert("addresses", {
          ownerId: "historical-import",
          formatted,
          line1: addr.line1,
          line2: addr.line2,
          city: addr.city,
          state: addr.state,
          zip: addr.zip,
          lat: STORE_ORIGIN.lat,
          lng: STORE_ORIGIN.lng,
          createdAt: now,
        });
        await ctx.db.patch(order._id, { addressId, updatedAt: now });
      }
      updated++;
    }

    return { ok: true, updated, totalInCsv: emailToAddr.size };
  },
});

/**
 * Create Convex user records (not Clerk) for historical order contacts.
 * Uses tokenIdentifier = "import:user@example.com" as placeholder.
 * When the real person signs in via Clerk, storeUser's "link by email" logic
 * finds this user and patches tokenIdentifier — no duplicate created.
 *
 * Run BEFORE backfillAddressesToAccounts and linkAllGuestOrdersToUsers.
 *
 * Run: npx convex run importHistoricalOrders:importUsersFromOrders
 */
export const importUsersFromOrders = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");

    const orders = await ctx.db.query("orders").collect();
    const emailToName = new Map<string, string>();
    for (const o of orders) {
      const email = o.contactEmail?.trim()?.toLowerCase();
      if (!email) continue;
      const name = o.contactName?.trim();
      if (name && (!emailToName.has(email) || (emailToName.get(email)?.length ?? 0) < name.length)) {
        emailToName.set(email, name);
      } else if (!emailToName.has(email)) {
        emailToName.set(email, "Customer");
      }
    }

    const existingUsers = await ctx.db.query("users").collect();
    const existingEmails = new Set(
      existingUsers.map((u) => u.email?.trim()?.toLowerCase()).filter(Boolean)
    );

    const now = Date.now();
    let created = 0;
    let skipped = 0;

    for (const [email, name] of emailToName) {
      if (existingEmails.has(email)) {
        skipped++;
        continue;
      }
      await ctx.db.insert("users", {
        tokenIdentifier: `import:${email}`,
        email,
        name,
        role: "customer",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      created++;
      existingEmails.add(email);
    }

    return {
      ok: true,
      created,
      skipped,
      totalUnique: emailToName.size,
    };
  },
});

/**
 * Assign historical-import addresses to accounts.
 * - If a user exists with matching contactEmail: set ownerId = user.tokenIdentifier (shows in their saved addresses when signed in)
 * - Otherwise: set ownerId = "email:user@example.com" (guests see these when cart.contactEmail matches)
 *
 * Run AFTER importUsersFromOrders. Run: npx convex run importHistoricalOrders:backfillAddressesToAccounts
 */
export const backfillAddressesToAccounts = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");

    const orders = await ctx.db
      .query("orders")
      .filter((q) =>
        q.and(
          q.neq(q.field("addressId"), undefined),
          q.neq(q.field("contactEmail"), undefined)
        )
      )
      .collect();

    const users = await ctx.db.query("users").collect();
    const emailToUser = new Map(
      users.map((u) => [u.email.trim().toLowerCase(), u])
    );

    let linkedToUser = 0;
    let linkedToEmail = 0;
    const seenAddressIds = new Set<string>();

    for (const order of orders) {
      const email = order.contactEmail?.trim()?.toLowerCase();
      if (!email || !order.addressId) continue;

      const addr = await ctx.db.get(order.addressId);
      if (!addr) continue;
      if (addr.ownerId !== "historical-import") continue;
      if (seenAddressIds.has(order.addressId)) continue;

      seenAddressIds.add(order.addressId);
      const user = emailToUser.get(email);
      const newOwnerId = user ? user.tokenIdentifier : `email:${email}`;
      if (user) linkedToUser++;
      else linkedToEmail++;

      await ctx.db.patch(order.addressId, { ownerId: newOwnerId });
    }

    return {
      ok: true,
      linkedToUser,
      linkedToEmail,
      totalProcessed: linkedToUser + linkedToEmail,
    };
  },
});
