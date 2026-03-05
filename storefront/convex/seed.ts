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
        monday: { pickup: "15:00", delivery: "14:00", shipping: "12:00" },
        tuesday: { pickup: "15:00", delivery: "14:00", shipping: "12:00" },
        wednesday: { pickup: "15:00", delivery: "14:00", shipping: "12:00" },
        thursday: { pickup: "15:00", delivery: "14:00", shipping: "12:00" },
        friday: { pickup: "15:00", delivery: "14:00", shipping: "12:00" },
        saturday: { pickup: "12:00", delivery: "11:00", shipping: "10:00" },
        sunday: {},
      },
      globalLeadTimeHours: 24,
      slotDurationMinutesByMode: {
        pickup: 30,
        delivery: 30,
        shipping: 60,
      },
      holdMinutes: 10,
      enabled: true,
      effectiveFrom: today,
      createdAt: now,
    });

    await ctx.db.insert("deliveryTiers", {
      minMiles: 0,
      maxMiles: 5,
      feeCents: 500,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("deliveryTiers", {
      minMiles: 5,
      maxMiles: 10,
      feeCents: 1000,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("deliveryTiers", {
      minMiles: 10,
      maxMiles: 15,
      feeCents: 1500,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });

    return { seeded: true, message: "Availability rules and delivery tiers created" };
  },
});
