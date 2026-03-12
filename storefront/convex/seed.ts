import { mutation } from "./_generated/server";

/**
 * One-shot seed for initial availability rules and sample slot capacities.
 * Run once via dashboard or convex CLI to bootstrap the scheduling engine.
 */
export const seedAvailabilityRules = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("availabilityRules")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();

    if (existing.length > 0) {
      return { seeded: false, message: "Active rules already exist" };
    }

    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);

    await ctx.db.insert("availabilityRules", {
      version: 1,
      timezone: "America/New_York",
      storeHours: {
        monday: [{ start: "09:00", end: "17:00" }],
        tuesday: [{ start: "09:00", end: "17:00" }],
        wednesday: [{ start: "09:00", end: "17:00" }],
        thursday: [{ start: "09:00", end: "17:00" }],
        friday: [{ start: "09:00", end: "17:00" }],
        saturday: [{ start: "09:00", end: "14:00" }],
        sunday: [],
      },
      cutoffTimes: {
        // Same-day order cutoff: 12:15 PM EST (latest order for same-day 5:30/6 PM slots)
        monday: { pickup: "12:15", delivery: "12:15", shipping: "12:00" },
        tuesday: { pickup: "12:15", delivery: "12:15", shipping: "12:00" },
        wednesday: { pickup: "12:15", delivery: "12:15", shipping: "12:00" },
        thursday: { pickup: "12:15", delivery: "12:15", shipping: "12:00" },
        friday: { pickup: "12:15", delivery: "12:15", shipping: "12:00" },
        saturday: { pickup: "12:15", delivery: "12:15", shipping: "10:00" },
        sunday: {},
      },
      globalLeadTimeHours: 5,
      slotDurationMinutesByMode: {
        pickup: 60,
        delivery: 60,
        shipping: 60,
      },
      holdMinutes: 10,
      enabled: true,
      effectiveFrom: today,
      createdAt: now,
    });

    // Delivery within 10 miles only; same rules as pickup
    await ctx.db.insert("deliveryTiers", {
      minMiles: 0,
      maxMiles: 5,
      feeCents: 0,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("deliveryTiers", {
      minMiles: 5,
      maxMiles: 10,
      feeCents: 500,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });

    return { seeded: true, message: "Availability rules and delivery tiers created" };
  },
});

/** Extra products for historical import (Piña Colada, Create Your Own legacy). Run before import. */
const IMPORT_PRODUCTS = [
  { productCode: "CAKE-018", name: "Piña Colada Cake", slug: "pina-colada-cake", price: 55, inStock: false, status: "hidden" as const },
  {
    productCode: "CAKE-019",
    name: "Create Your Own (Legacy)",
    slug: "create-your-own-legacy",
    price: 65,
    inStock: false,
    status: "hidden" as const,
  },
];

const CAKES = [
  { productCode: "CAKE-001", name: "Lychee Martini Cake", slug: "lychee-martini-cake", price: 55, inStock: true },
  { productCode: "CAKE-002", name: "Red Velvet Hennessy Cake", slug: "red-velvet-hennessy-cake", price: 60, inStock: true },
  { productCode: "CAKE-003", name: "Chocolate Hennessy Cake", slug: "chocolate-hennessy-cake", price: 60, inStock: true },
  { productCode: "CAKE-004", name: "Vanilla Hennessy Cake", slug: "vanilla-hennessy-cake", price: 60, inStock: true },
  { productCode: "CAKE-005", name: "Caramel Apple Cake – Seasonal", slug: "caramel-apple-cake-seasonal", price: 60, inStock: false },
  { productCode: "CAKE-006", name: "Jamaican Fruit Cake", slug: "jamaican-fruit-cake", price: 65, inStock: true },
  { productCode: "CAKE-007", name: "Egg Nog Cake – Seasonal", slug: "egg-nog-cake-seasonal", price: 55, inStock: false },
  { productCode: "CAKE-008", name: "Red Velvet Rum Cake", slug: "red-velvet-rum-cake", price: 50, inStock: true },
  { productCode: "CAKE-009", name: "Red Velvet Baileys Cake", slug: "red-velvet-baileys-cake", price: 55, inStock: true },
  { productCode: "CAKE-010", name: "Vanilla Rum Cake", slug: "vanilla-rum-cake", price: 50, inStock: true },
  { productCode: "CAKE-011", name: "Chocolate Baileys Cake", slug: "chocolate-baileys-cake", price: 55, inStock: true },
  { productCode: "CAKE-012", name: "Vanilla Baileys Cake", slug: "vanilla-baileys-cake", price: 55, inStock: true },
  { productCode: "CAKE-013", name: "Chocolate Rum Cake", slug: "chocolate-rum-cake", price: 50, inStock: true },
  { productCode: "CAKE-014", name: "Buttery Nipple Cake", slug: "buttery-nipple-cake", price: 60, inStock: true },
  { productCode: "CAKE-015", name: "Rum Raisin Cake", slug: "rum-raisin-cake", price: 55, inStock: true },
  { productCode: "CAKE-016", name: "Spice Rum Cake", slug: "spice-rum-cake", price: 50, inStock: true },
  { productCode: "CAKE-017", name: "French Connection Cake", slug: "french-connection-cake", price: 60, inStock: true },
];

export const seedCakes = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("products").first();
    if (existing) {
      const products = await ctx.db.query("products").collect();
      const toCreate = CAKES.filter((c) => !products.some((p) => p.productCode === c.productCode || p.slug === c.slug));
      if (toCreate.length === 0) {
        return { seeded: false, message: "All cakes already exist" };
      }
      const now = Date.now();
      for (const c of toCreate) {
        await ctx.db.insert("products", {
          productCode: c.productCode,
          name: c.name,
          slug: c.slug,
          description: "",
          images: [],
          status: "active",
          categories: ["cakes"],
          tags: ["rum cakes", "tipsy cake"],
          basePriceCents: c.price * 100,
          fulfillmentFlags: { pickup: true, delivery: true, shipping: false },
          inStockToday: c.inStock,
          createdAt: now,
          updatedAt: now,
        });
      }
      return { seeded: true, message: `Added ${toCreate.length} cake(s)` };
    }
    const now = Date.now();
    for (const c of CAKES) {
      await ctx.db.insert("products", {
        productCode: c.productCode,
        name: c.name,
        slug: c.slug,
        description: "",
        images: [],
        status: "active",
        categories: ["cakes"],
        tags: ["rum cakes", "tipsy cake"],
        basePriceCents: c.price * 100,
        fulfillmentFlags: { pickup: true, delivery: true, shipping: false },
        inStockToday: c.inStock,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { seeded: true, message: `Added ${CAKES.length} cakes` };
  },
});

/**
 * Seed products needed for historical order import.
 * Creates IMPORT_PRODUCTS + any missing CAKES. Run before importHistoricalOrders. Idempotent.
 */
export const seedImportProducts = mutation({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").collect();
    const existingSlugs = new Set(products.map((p) => p.slug));
    const allProducts = [...IMPORT_PRODUCTS, ...CAKES];
    const toCreate = allProducts.filter((c) => !existingSlugs.has(c.slug));
    if (toCreate.length === 0) {
      return { seeded: false, message: "All import products already exist" };
    }
    const now = Date.now();
    for (const c of toCreate) {
      await ctx.db.insert("products", {
        productCode: c.productCode,
        name: c.name,
        slug: c.slug,
        description: "",
        images: [],
        status: c.status ?? "active",
        categories: ["cakes"],
        tags: ["rum cakes", "tipsy cake"],
        basePriceCents: c.price * 100,
        fulfillmentFlags: { pickup: true, delivery: true, shipping: false },
        inStockToday: c.inStock,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { seeded: true, message: `Added ${toCreate.length} import product(s)` };
  },
});

export const seedModifiers = mutation({
  args: {},
  handler: async (ctx) => {
    // Clean up all existing modifier options and groups first
    const allGroups = await ctx.db.query("modifierGroups").collect();
    for (const group of allGroups) {
      const options = await ctx.db
        .query("modifierOptions")
        .withIndex("by_group", (q) => q.eq("groupId", group._id))
        .collect();
      for (const opt of options) {
        await ctx.db.delete(opt._id);
      }
      await ctx.db.delete(group._id);
    }

    const now = Date.now();
    let groupsCreated = 0;
    let optionsCreated = 0;

    // ── Global modifier groups (apply to all products) ──
    // Birthday Extras (optional, yes/no toggle)
    const birthdayGroupId = await ctx.db.insert("modifierGroups", {
      productId: undefined,
      name: "Birthday Extras",
      description: "Includes non-standard decoration with a Happy Birthday Cake Sign",
      required: false,
      minSelect: 0,
      maxSelect: 1,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });
    groupsCreated++;
    await ctx.db.insert("modifierOptions", {
      groupId: birthdayGroupId,
      name: "Birthday Extras",
      priceDeltaCents: 500,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });
    optionsCreated++;

    // Make It Extra Tipsy (optional, yes/no toggle)
    const tipsyGroupId = await ctx.db.insert("modifierGroups", {
      productId: undefined,
      name: "Make It Extra Tipsy",
      description: "Think of this as an extra shot of alcohol",
      required: false,
      minSelect: 0,
      maxSelect: 1,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    });
    groupsCreated++;
    await ctx.db.insert("modifierOptions", {
      groupId: tipsyGroupId,
      name: "Make It Extra Tipsy",
      priceDeltaCents: 1000,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });
    optionsCreated++;

    // Shape (required, pick 1)
    const shapeGroupId = await ctx.db.insert("modifierGroups", {
      productId: undefined,
      name: "Shape",
      required: true,
      minSelect: 1,
      maxSelect: 1,
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
    });
    groupsCreated++;
    const shapeOptions = [
      { name: "Mixed", sortOrder: 0 },
      { name: "Even 20", sortOrder: 1 },
      { name: "Rose", sortOrder: 2 },
      { name: "Blossom", sortOrder: 3 },
    ];
    for (const opt of shapeOptions) {
      await ctx.db.insert("modifierOptions", {
        groupId: shapeGroupId,
        name: opt.name,
        priceDeltaCents: 0,
        sortOrder: opt.sortOrder,
        createdAt: now,
        updatedAt: now,
      });
      optionsCreated++;
    }

    return {
      seeded: true,
      message: `Created ${groupsCreated} global modifier groups and ${optionsCreated} options (apply to all products)`,
    };
  },
});

export const backfillMediaLibrary = mutation({
  args: {},
  handler: async (ctx) => {
    const existingMedia = await ctx.db.query("mediaLibrary").collect();
    const existingStorageIds = new Set(existingMedia.map((m) => m.storageId));

    const products = await ctx.db.query("products").collect();
    const storageIdsToAdd: string[] = [];

    for (const product of products) {
      for (const img of product.images) {
        if (img.startsWith("http")) continue;
        if (existingStorageIds.has(img)) continue;
        storageIdsToAdd.push(img);
        existingStorageIds.add(img);
      }
    }

    if (storageIdsToAdd.length === 0) {
      return { seeded: false, message: "No new images to backfill" };
    }

    const now = Date.now();
    let added = 0;

    for (const storageId of storageIdsToAdd) {
      const filename = `image-${storageId.slice(-8)}`;
      let contentType = "image/jpeg";
      let size = 0;

      try {
        const meta = await ctx.db.system.get("_storage", storageId as never);
        if (meta) {
          if (meta.contentType) contentType = meta.contentType;
          if (typeof meta.size === "number") size = meta.size;
        }
      } catch {
        // Use defaults if metadata unavailable
      }

      await ctx.db.insert("mediaLibrary", {
        storageId,
        filename,
        contentType,
        size,
        createdAt: now,
      });
      added++;
    }

    return {
      seeded: true,
      message: `Backfilled ${added} image(s) from existing products`,
    };
  },
});

export const seedDevAdmin = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .first();

    if (existing) {
      return { seeded: false, message: "Admin user already exists" };
    }

    const now = Date.now();
    await ctx.db.insert("users", {
      tokenIdentifier: "dev-admin",
      email: "admin@thetipsycake.com",
      name: "Dev Admin",
      role: "admin",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return { seeded: true, message: "Dev admin user created" };
  },
});

/**
 * Copy images + shapeImages from "Vanilla Rum Cake" to the other cake variants.
 * Run once: npx convex run seed:copyRumCakeImages
 */
export const copyRumCakeImages = mutation({
  args: {},
  handler: async (ctx) => {
    const TARGET_NAMES = [
      "Lychee Martini Cake",
      "Vanilla Hennessy Cake",
      "Vanilla Baileys Cake",
      "Buttery Nipple Cake",
      "French Connection Cake",
    ];

    const all = await ctx.db.query("products").collect();
    const source = all.find((p) =>
      p.name.toLowerCase().includes("vanilla rum")
    );

    if (!source) {
      return { ok: false, message: "Vanilla Rum Cake not found" };
    }

    const updated: string[] = [];
    for (const product of all) {
      if (TARGET_NAMES.some((n) => product.name.toLowerCase() === n.toLowerCase())) {
        const now = Date.now();
        await ctx.db.patch(product._id, {
          images: source.images,
          shapeImages: source.shapeImages,
          updatedAt: now,
        });
        updated.push(product.name);
      }
    }

    return {
      ok: true,
      source: source.name,
      updated,
      message: `Copied to ${updated.length} product(s): ${updated.join(", ")}`,
    };
  },
});

/**
 * Backfill productCode for ALL products missing it. Matches by slug, then name, else assigns next CAKE-XXX.
 * Run: npx convex run seed:backfillProductCodes
 */
export const backfillProductCodes = mutation({
  args: {},
  handler: async (ctx) => {
    const slugToCode: Record<string, string> = {};
    const nameToCode: Record<string, string> = {};
    for (const c of CAKES) {
      slugToCode[c.slug] = c.productCode;
      nameToCode[c.name.toLowerCase()] = c.productCode;
    }

    const products = await ctx.db.query("products").collect();
    const existingCodes = new Set(products.map((p) => p.productCode).filter(Boolean));
    let nextNum = 18;
    while (existingCodes.has(`CAKE-${String(nextNum).padStart(3, "0")}`)) nextNum++;

    const updated: string[] = [];

    for (const p of products) {
      let code =
        slugToCode[p.slug] ??
        nameToCode[p.name.toLowerCase()] ??
        (p.productCode && existingCodes.has(p.productCode) ? p.productCode : null);

      if (!code) {
        code = `CAKE-${String(nextNum).padStart(3, "0")}`;
        existingCodes.add(code);
        nextNum++;
      }

      if (!p.productCode || p.productCode !== code) {
        await ctx.db.patch(p._id, {
          productCode: code,
          updatedAt: Date.now(),
        });
        updated.push(`${p.name} → ${code}`);
      }
    }

    return {
      ok: true,
      updated,
      message: updated.length > 0
        ? `Backfilled ${updated.length} product(s): ${updated.join("; ")}`
        : "All products already have correct codes.",
    };
  },
});

/**
 * Copy images + shapeImages from "Red Velvet Hennessy Cake" to Red Velvet Baileys and Red Velvet Rum.
 * Run: npx convex run seed:copyRedVelvetHennessyImages
 */
export const copyRedVelvetHennessyImages = mutation({
  args: {},
  handler: async (ctx) => {
    const TARGET_NAMES = [
      "Red Velvet Baileys Cake",
      "Red Velvet Rum Cake",
    ];

    const all = await ctx.db.query("products").collect();
    const source = all.find((p) =>
      p.name.toLowerCase().includes("red velvet hennessy")
    );

    if (!source) {
      return { ok: false, message: "Red Velvet Hennessy Cake not found" };
    }

    const updated: string[] = [];
    for (const product of all) {
      if (TARGET_NAMES.some((n) => product.name.toLowerCase() === n.toLowerCase())) {
        const now = Date.now();
        await ctx.db.patch(product._id, {
          images: source.images,
          shapeImages: source.shapeImages,
          updatedAt: now,
        });
        updated.push(product.name);
      }
    }

    return {
      ok: true,
      source: source.name,
      updated,
      message: `Copied to ${updated.length} product(s): ${updated.join(", ")}`,
    };
  },
});

/**
 * Copy images + shapeImages from "Spice Rum Cake" to Rum Raisin Cake.
 * Run: npx convex run seed:copySpiceRumImages
 */
export const copySpiceRumImages = mutation({
  args: {},
  handler: async (ctx) => {
    const TARGET_NAMES = ["Rum Raisin Cake"];

    const all = await ctx.db.query("products").collect();
    const source = all.find((p) =>
      p.name.toLowerCase().includes("spice rum")
    );

    if (!source) {
      return { ok: false, message: "Spice Rum Cake not found" };
    }

    const updated: string[] = [];
    for (const product of all) {
      if (TARGET_NAMES.some((n) => product.name.toLowerCase() === n.toLowerCase())) {
        const now = Date.now();
        await ctx.db.patch(product._id, {
          images: source.images,
          shapeImages: source.shapeImages,
          updatedAt: now,
        });
        updated.push(product.name);
      }
    }

    return {
      ok: true,
      source: source.name,
      updated,
      message: `Copied to ${updated.length} product(s): ${updated.join(", ")}`,
    };
  },
});

/**
 * Copy images + shapeImages from "Chocolate Hennessy Cake" to Chocolate Baileys and Chocolate Rum.
 * Run: npx convex run seed:copyChocolateHennessyImages
 */
export const copyChocolateHennessyImages = mutation({
  args: {},
  handler: async (ctx) => {
    const TARGET_NAMES = [
      "Chocolate Baileys Cake",
      "Chocolate Rum Cake",
    ];

    const all = await ctx.db.query("products").collect();
    const source = all.find((p) =>
      p.name.toLowerCase().includes("chocolate hennessy")
    );

    if (!source) {
      return { ok: false, message: "Chocolate Hennessy Cake not found" };
    }

    const updated: string[] = [];
    for (const product of all) {
      if (TARGET_NAMES.some((n) => product.name.toLowerCase() === n.toLowerCase())) {
        const now = Date.now();
        await ctx.db.patch(product._id, {
          images: source.images,
          shapeImages: source.shapeImages,
          updatedAt: now,
        });
        updated.push(product.name);
      }
    }

    return {
      ok: true,
      source: source.name,
      updated,
      message: `Copied to ${updated.length} product(s): ${updated.join(", ")}`,
    };
  },
});

/**
 * Set maxQtyPerOrder to 10 for all products.
 * Run: npx convex run seed:setMaxQtyTo10
 */
/**
 * Set Piña Colada Cake to inactive (hidden). Run after import if it was seeded active.
 */
export const setPinaColadaInactive = mutation({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").collect();
    const pina = products.find((p) => p.slug === "pina-colada-cake");
    if (!pina) return { ok: false, message: "Piña Colada not found" };
    const now = Date.now();
    await ctx.db.patch(pina._id, { status: "hidden", inStockToday: false, updatedAt: now });
    return { ok: true, message: "Piña Colada set to inactive" };
  },
});

export const setMaxQtyTo10 = mutation({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").collect();
    const now = Date.now();
    let updated = 0;
    for (const p of products) {
      if (p.maxQtyPerOrder !== 10) {
        await ctx.db.patch(p._id, { maxQtyPerOrder: 10, updatedAt: now });
        updated++;
      }
    }
    return { ok: true, updated, total: products.length };
  },
});

/**
 * Attach fun badges to products. Run: npx convex run seed:seedProductBadges
 * Popular (green): Chocolate Baileys
 * New Flavor (yellow): Lychee Martini, Red Velvet Hennessy, Chocolate Hennessy, Vanilla Hennessy
 * Best Seller (red): Buttery Nipple, Jamaican Fruit Cake (closest to Appleton rum)
 */
export const seedProductBadges = mutation({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").collect();
    const now = Date.now();

    const popular = ["Chocolate Baileys Cake"];
    const newFlavor = [
      "Lychee Martini Cake",
      "Red Velvet Hennessy Cake",
      "Chocolate Hennessy Cake",
      "Vanilla Hennessy Cake",
    ];
    const bestSeller = ["Buttery Nipple Cake", "Jamaican Fruit Cake"];

    const nameToId = new Map(products.map((p) => [p.name.toLowerCase(), p._id]));
    let updated = 0;

    for (const name of popular) {
      const id = nameToId.get(name.toLowerCase());
      if (id) {
        await ctx.db.patch(id, { badges: ["popular" as const], updatedAt: now });
        updated++;
      }
    }
    for (const name of newFlavor) {
      const id = nameToId.get(name.toLowerCase());
      if (id) {
        await ctx.db.patch(id, { badges: ["new_flavor" as const], updatedAt: now });
        updated++;
      }
    }
    for (const name of bestSeller) {
      const id = nameToId.get(name.toLowerCase());
      if (id) {
        await ctx.db.patch(id, { badges: ["best_seller" as const], updatedAt: now });
        updated++;
      }
    }

    return {
      ok: true,
      updated,
      message: `Badges set on ${updated} product(s)`,
    };
  },
});
