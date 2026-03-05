import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireRole } from "./lib/auth";

type Mode = "pickup" | "delivery" | "shipping";

function pad2(input: number) {
  return input.toString().padStart(2, "0");
}

function dateToYmd(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseHm(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  return { h, m };
}

function combineDateAndHm(date: Date, hm: string) {
  const { h, m } = parseHm(hm);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    h,
    m,
    0,
    0
  );
}

function slotKey(date: string, start: string, mode: Mode) {
  return `${date}|${start}|${mode}`;
}

function weekdayKey(date: Date) {
  const keys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return keys[date.getDay()];
}

async function getEnabledRules(ctx: QueryCtx | MutationCtx) {
  const rules = await ctx.db
    .query("availabilityRules")
    .withIndex("by_enabled", (q) => q.eq("enabled", true))
    .collect();
  if (rules.length === 0) return null;
  return rules.sort((a, b) => b.version - a.version)[0];
}

async function computeCartLeadTimeHours(
  ctx: QueryCtx | MutationCtx,
  cartId: string,
  rules: {
    globalLeadTimeHours: number;
    productLeadTimeHours?: Record<string, number>;
  }
) {
  const items = await ctx.db
    .query("cartItems")
    .withIndex("by_cart", (q) => q.eq("cartId", cartId as never))
    .collect();
  let maxLead = rules.globalLeadTimeHours;

  for (const item of items) {
    const productLead = rules.productLeadTimeHours?.[String(item.productId)];
    if (typeof productLead === "number") {
      maxLead = Math.max(maxLead, productLead);
    }
  }
  return maxLead;
}

export const getAvailableDates = query({
  args: {
    mode: v.union(v.literal("pickup"), v.literal("delivery"), v.literal("shipping")),
    cartId: v.id("carts"),
    addressId: v.optional(v.id("addresses")),
  },
  handler: async (ctx, args) => {
    const rules = await getEnabledRules(ctx);
    if (!rules) return [];

    const now = new Date();
    const leadHours = await computeCartLeadTimeHours(ctx, args.cartId as unknown as string, {
      globalLeadTimeHours: rules.globalLeadTimeHours,
      productLeadTimeHours: (rules.productLeadTimeHours ?? {}) as Record<string, number>,
    });
    const earliest = new Date(now.getTime() + leadHours * 60 * 60 * 1000);

    const dates: string[] = [];
    for (let i = 0; i < 14; i++) {
      const day = new Date(now);
      day.setDate(now.getDate() + i);
      const dayStr = dateToYmd(day);
      if (day < earliest && dayStr !== dateToYmd(earliest)) continue;

      const blackout = await ctx.db
        .query("blackoutDates")
        .withIndex("by_date", (q) => q.eq("date", dayStr))
        .collect();

      const isBlackout = blackout.some(
        (entry) => !entry.modes || entry.modes.includes(args.mode)
      );
      if (isBlackout) continue;

      dates.push(dayStr);
    }
    return dates;
  },
});

export const getSlots = query({
  args: {
    mode: v.union(v.literal("pickup"), v.literal("delivery"), v.literal("shipping")),
    date: v.string(),
    cartId: v.id("carts"),
    addressId: v.optional(v.id("addresses")),
  },
  handler: async (ctx, args) => {
    const rules = await getEnabledRules(ctx);
    if (!rules) {
      return { available: [], blocked: [{ slotStart: "00:00", reason: "CLOSED" }] };
    }

    const now = new Date();
    const targetDate = new Date(`${args.date}T00:00:00`);
    const dayKey = weekdayKey(targetDate);
    const windows = ((rules.storeHours as Record<string, Array<{ start: string; end: string }>>)[dayKey] ??
      []) as Array<{ start: string; end: string }>;

    if (windows.length === 0) {
      return { available: [], blocked: [{ slotStart: "00:00", reason: "CLOSED" }] };
    }

    const leadHours = await computeCartLeadTimeHours(ctx, args.cartId as unknown as string, {
      globalLeadTimeHours: rules.globalLeadTimeHours,
      productLeadTimeHours: (rules.productLeadTimeHours ?? {}) as Record<string, number>,
    });
    const earliestAllowed = new Date(now.getTime() + leadHours * 60 * 60 * 1000);

    const blackout = await ctx.db
      .query("blackoutDates")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .collect();
    if (blackout.some((entry) => !entry.modes || entry.modes.includes(args.mode))) {
      return { available: [], blocked: [{ slotStart: "00:00", reason: "BLACKOUT" }] };
    }

    const durationMinutes =
      args.mode === "pickup"
        ? rules.slotDurationMinutesByMode.pickup
        : args.mode === "delivery"
          ? rules.slotDurationMinutesByMode.delivery
          : rules.slotDurationMinutesByMode.shipping;

    const available: Array<{ slotKey: string; startTime: string; endTime: string }> = [];
    const blocked: Array<{ slotStart: string; reason: string }> = [];

    const cutoffByDay = (rules.cutoffTimes as Record<string, Partial<Record<Mode, string>>>)[dayKey];
    const cutoff = cutoffByDay?.[args.mode];
    const cutoffMoment = cutoff ? combineDateAndHm(targetDate, cutoff) : null;

    for (const window of windows) {
      let cursor = combineDateAndHm(targetDate, window.start);
      const end = combineDateAndHm(targetDate, window.end);

      while (cursor < end) {
        const slotStart = `${pad2(cursor.getHours())}:${pad2(cursor.getMinutes())}`;
        const slotEndDate = new Date(cursor.getTime() + durationMinutes * 60 * 1000);
        const slotEnd = `${pad2(slotEndDate.getHours())}:${pad2(slotEndDate.getMinutes())}`;
        const key = slotKey(args.date, slotStart, args.mode);

        if (cursor < earliestAllowed) {
          blocked.push({ slotStart, reason: "LEAD_TIME" });
          cursor = new Date(cursor.getTime() + durationMinutes * 60 * 1000);
          continue;
        }

        if (cutoffMoment && now > cutoffMoment && args.date === dateToYmd(now)) {
          blocked.push({ slotStart, reason: "CUTOFF" });
          cursor = new Date(cursor.getTime() + durationMinutes * 60 * 1000);
          continue;
        }

        const capacity = await ctx.db
          .query("slotCapacities")
          .withIndex("by_slotKey", (q) => q.eq("slotKey", key))
          .unique();

        const activeHolds = await ctx.db
          .query("slotHolds")
          .withIndex("by_slotKey", (q) => q.eq("slotKey", key))
          .collect();

        const heldCount = activeHolds.filter(
          (hold) => hold.status === "held" && hold.expiresAt > Date.now()
        ).length;

        const bookings = await ctx.db
          .query("slotBookings")
          .withIndex("by_slotKey", (q) => q.eq("slotKey", key))
          .collect();

        const maxOrders = capacity?.maxOrders ?? 999;
        if (heldCount + bookings.length >= maxOrders) {
          blocked.push({ slotStart, reason: "FULL" });
        } else {
          available.push({ slotKey: key, startTime: slotStart, endTime: slotEnd });
        }

        cursor = new Date(cursor.getTime() + durationMinutes * 60 * 1000);
      }
    }

    return { available, blocked };
  },
});

export const createHold = mutation({
  args: {
    cartId: v.id("carts"),
    slotKey: v.string(),
  },
  handler: async (ctx, args) => {
    const cart = await ctx.db.get(args.cartId);
    if (!cart) throw new Error("Cart not found");

    const [, , modeString] = args.slotKey.split("|");
    const mode = modeString as Mode;
    const rules = await getEnabledRules(ctx);
    if (!rules) throw new Error("No availability rules configured");

    const capacity = await ctx.db
      .query("slotCapacities")
      .withIndex("by_slotKey", (q) => q.eq("slotKey", args.slotKey))
      .unique();
    const maxOrders = capacity?.maxOrders ?? 999;

    const activeHolds = await ctx.db
      .query("slotHolds")
      .withIndex("by_slotKey", (q) => q.eq("slotKey", args.slotKey))
      .collect();
    const heldCount = activeHolds.filter(
      (hold) => hold.status === "held" && hold.expiresAt > Date.now()
    ).length;

    const bookings = await ctx.db
      .query("slotBookings")
      .withIndex("by_slotKey", (q) => q.eq("slotKey", args.slotKey))
      .collect();

    if (heldCount + bookings.length >= maxOrders) {
      throw new Error("SLOT_FULL");
    }

    const now = Date.now();
    const holdId = await ctx.db.insert("slotHolds", {
      cartId: args.cartId,
      slotKey: args.slotKey,
      expiresAt: now + rules.holdMinutes * 60 * 1000,
      status: "held",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(args.cartId, {
      slotHoldId: holdId,
      updatedAt: now,
    });

    return { holdId, mode };
  },
});

export const releaseHold = mutation({
  args: {
    holdId: v.id("slotHolds"),
  },
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    if (!hold) throw new Error("Hold not found");

    await ctx.db.patch(args.holdId, {
      status: "released",
      updatedAt: Date.now(),
    });
    return args.holdId;
  },
});

export const expireHolds = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const held = await ctx.db
      .query("slotHolds")
      .withIndex("by_status_expiresAt", (q) => q.eq("status", "held"))
      .collect();

    let expiredCount = 0;
    for (const hold of held) {
      if (hold.expiresAt <= now) {
        await ctx.db.patch(hold._id, {
          status: "expired",
          updatedAt: now,
        });
        expiredCount += 1;
      }
    }
    return { expiredCount };
  },
});

export const adminUpsertAvailabilityRules = mutation({
  args: {
    version: v.number(),
    timezone: v.string(),
    storeHours: v.record(v.string(), v.array(v.object({ start: v.string(), end: v.string() }))),
    cutoffTimes: v.record(v.string(), v.record(v.string(), v.string())),
    globalLeadTimeHours: v.number(),
    categoryLeadTimeHours: v.optional(v.record(v.string(), v.number())),
    productLeadTimeHours: v.optional(v.record(v.string(), v.number())),
    slotDurationMinutesByMode: v.object({
      pickup: v.number(),
      delivery: v.number(),
      shipping: v.number(),
    }),
    holdMinutes: v.number(),
    effectiveFrom: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");

    const existingEnabled = await ctx.db
      .query("availabilityRules")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();

    for (const rule of existingEnabled) {
      await ctx.db.patch(rule._id, { enabled: false });
    }

    return await ctx.db.insert("availabilityRules", {
      ...args,
      enabled: true,
      createdAt: Date.now(),
    });
  },
});
