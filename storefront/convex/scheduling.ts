import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireRole } from "./lib/auth";
import { TZDate } from "@date-fns/tz";

type Mode = "pickup" | "delivery" | "shipping";

/** Store local time (date + HH:mm) to UTC timestamp. All cutoff/slot times are in store TZ. */
function storeLocalToUtc(dateYmd: string, hm: string, tz: string): Date {
  const [y, m, d] = dateYmd.split("-").map(Number);
  const [h, min] = hm.split(":").map(Number);
  const storeLocal = new TZDate(y, m - 1, d, h, min, 0, 0, tz);
  return new Date(storeLocal.getTime());
}

/** Current date (YYYY-MM-DD) and time (minutes since midnight) in store timezone.
 * Uses Intl.formatToParts for correct behavior in UTC server environments (e.g. Convex). */
function nowInStoreTz(now: Date, tz: string): { dateYmd: string; minutesSinceMidnight: number } {
  const opts: Intl.DateTimeFormatOptions = { timeZone: tz };
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    ...opts,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const timeParts = new Intl.DateTimeFormat("en-US", {
    ...opts,
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const year = dateParts.find((p) => p.type === "year")?.value ?? "2025";
  const month = dateParts.find((p) => p.type === "month")?.value ?? "01";
  const day = dateParts.find((p) => p.type === "day")?.value ?? "01";
  const hour = parseInt(timeParts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(timeParts.find((p) => p.type === "minute")?.value ?? "0", 10);
  return {
    dateYmd: `${year}-${month}-${day}`,
    minutesSinceMidnight: hour * 60 + minute,
  };
}

function pad2(input: number) {
  return input.toString().padStart(2, "0");
}

function dateToYmd(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Returns [hours, minutes]. Use for consistent destructuring. */
function parseHm(hm: string): [number, number] {
  const parts = String(hm ?? "").split(":");
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  return [h, m];
}

function combineDateAndHm(date: Date, hm: string) {
  const [h, m] = parseHm(hm);
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

/** Add days to a YYYY-MM-DD string in store timezone. */
function addDaysToYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
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
    const tz = rules.timezone ?? "America/New_York";
    const storeToday = nowInStoreTz(now, tz).dateYmd;

    const leadHours = await computeCartLeadTimeHours(ctx, args.cartId as unknown as string, {
      globalLeadTimeHours: rules.globalLeadTimeHours,
      productLeadTimeHours: (rules.productLeadTimeHours ?? {}) as Record<string, number>,
    });
    // Same-day allowed for pickup/delivery; shipping skips same-day
    const startDate =
      args.mode === "pickup" || args.mode === "delivery"
        ? storeToday
        : addDaysToYmd(storeToday, 1); // Shipping: first slot is lead time from now

    const dates: string[] = [];
    for (let i = 0; i < 14; i++) {
      const dayStr = addDaysToYmd(startDate, i);
      if (args.mode === "shipping") {
        const slotStartUtc = storeLocalToUtc(dayStr, "09:00", tz);
        if (slotStartUtc < new Date(now.getTime() + leadHours * 60 * 60 * 1000)) continue;
      }

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
      const fallback = nowInStoreTz(new Date(), "America/New_York");
      const h = Math.floor(fallback.minutesSinceMidnight / 60);
      const m = fallback.minutesSinceMidnight % 60;
      const storeTimeForDebug = `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"} (no rules)`;
      return { available: [], blocked: [{ slotStart: "00:00", reason: "CLOSED" }], storeTimeForDebug };
    }

    const now = new Date();
    const tz = rules.timezone ?? "America/New_York";
    const storeNow = nowInStoreTz(now, tz);
    const [y, m, d] = args.date.split("-").map(Number);
    const targetDateForWeekday = new TZDate(y, m - 1, d, 12, 0, 0, 0, tz);
    const dayKey = weekdayKey(targetDateForWeekday as unknown as Date);
    const staticTimes = rules.slotTimes as string[] | undefined;
    const defaultMax = (rules.defaultMaxOrdersPerSlot as number | undefined) ?? 999;

    // Build slot start times: use static slotTimes if set, else derive from store hours
    let slotStarts: string[] = [];
    if (staticTimes && staticTimes.length > 0) {
      for (const t of staticTimes) {
        const trimmed = t.trim();
        if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
          const [h, m] = trimmed.split(":").map(Number);
          slotStarts.push(`${pad2(h)}:${pad2(m)}`);
        }
      }
      slotStarts = [...new Set(slotStarts)].sort();
    } else {
      const windows = ((rules.storeHours as Record<string, Array<{ start: string; end: string }>>)[dayKey] ??
        []) as Array<{ start: string; end: string }>;
      if (windows.length === 0) {
        const h = Math.floor(storeNow.minutesSinceMidnight / 60);
        const m = storeNow.minutesSinceMidnight % 60;
        const storeTimeForDebug = `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"} ${tz}`;
        return { available: [], blocked: [{ slotStart: "00:00", reason: "CLOSED" }], selectedSlotKey: null, storeTimeForDebug };
      }
      const dur = args.mode === "pickup"
        ? rules.slotDurationMinutesByMode.pickup
        : args.mode === "delivery"
          ? rules.slotDurationMinutesByMode.delivery
          : rules.slotDurationMinutesByMode.shipping;
      for (const window of windows) {
        const [startH, startM] = parseHm(window.start);
        const [endH, endM] = parseHm(window.end);
        let totalMins = startH * 60 + startM;
        const endTotalMins = endH * 60 + endM;
        while (totalMins < endTotalMins) {
          slotStarts.push(`${pad2(Math.floor(totalMins / 60))}:${pad2(totalMins % 60)}`);
          totalMins += dur;
        }
      }
    }

    if (slotStarts.length === 0) {
      const h = Math.floor(storeNow.minutesSinceMidnight / 60);
      const m = storeNow.minutesSinceMidnight % 60;
      const storeTimeForDebug = `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"} ${tz}`;
      return { available: [], blocked: [{ slotStart: "00:00", reason: "CLOSED" }], selectedSlotKey: null, storeTimeForDebug };
    }

    // Use configured slots for same-day too; lead time and cutoff will filter.
    const isSameDay = args.date === storeNow.dateYmd;

    const leadHours = await computeCartLeadTimeHours(ctx, args.cartId as unknown as string, {
      globalLeadTimeHours: rules.globalLeadTimeHours,
      productLeadTimeHours: (rules.productLeadTimeHours ?? {}) as Record<string, number>,
    });
    // Lead time: slot must be at least leadHours from now. Applied in STORE timezone so local
    // customers see correct availability regardless of server location.
    const leadMinutes = leadHours * 60;
    const slotPassesLeadTime = (slotStartHm: string): boolean => {
      if (!isSameDay) {
        // Future day: compare UTC timestamps (slot is far enough ahead)
        const cursorUtc = storeLocalToUtc(args.date, slotStartHm, tz);
        const earliestUtc = new Date(now.getTime() + leadMinutes * 60 * 1000);
        return cursorUtc >= earliestUtc;
      }
      // Same day: compare in store minutes (slot >= now + lead)
      const [sh, sm] = parseHm(slotStartHm);
      const slotMinutes = sh * 60 + sm;
      return slotMinutes >= storeNow.minutesSinceMidnight + leadMinutes;
    };

    const blackout = await ctx.db
      .query("blackoutDates")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .collect();
    if (blackout.some((entry) => !entry.modes || entry.modes.includes(args.mode))) {
      const cutoffByDay = (rules.cutoffTimes as Record<string, Partial<Record<Mode, string>>>)[dayKey];
      const cutoff = typeof cutoffByDay?.[args.mode] === "string" ? cutoffByDay![args.mode] : null;
      const h = Math.floor(storeNow.minutesSinceMidnight / 60);
      const m = storeNow.minutesSinceMidnight % 60;
      const storeTimeForDebug = `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"} ${tz}`;
      return {
        available: [],
        blocked: [{ slotStart: "00:00", reason: "BLACKOUT" }],
        storeTimeForDebug,
        cutoffForDebug: cutoff ?? undefined,
      };
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
    const cutoff = typeof cutoffByDay?.[args.mode] === "string" ? cutoffByDay![args.mode] : null;
    const cutoffParsed = cutoff ? parseHm(cutoff) : null;
    const cutoffMinutes =
      cutoffParsed !== null ? cutoffParsed[0] * 60 + cutoffParsed[1] : null;
    const pastCutoff =
      isSameDay &&
      cutoffMinutes !== null &&
      storeNow.minutesSinceMidnight >= cutoffMinutes;

    const tomorrowYmd = addDaysToYmd(storeNow.dateYmd, 1);
    const isTomorrow = args.date === tomorrowYmd;
    const nextDayCutoffHm = typeof rules.nextDayCutoffAfterHm === "string" ? rules.nextDayCutoffAfterHm : null;
    const nextDayMinSlot = typeof rules.nextDayMinSlotStart === "string" ? rules.nextDayMinSlotStart : null;
    const nextDayCutoffParsed = nextDayCutoffHm ? parseHm(nextDayCutoffHm) : null;
    const nextDayMinSlotParsed = nextDayMinSlot ? parseHm(nextDayMinSlot) : null;
    const nextDayCutoffMin = nextDayCutoffParsed ? nextDayCutoffParsed[0] * 60 + nextDayCutoffParsed[1] : null;
    const nextDayMinSlotMin = nextDayMinSlotParsed ? nextDayMinSlotParsed[0] * 60 + nextDayMinSlotParsed[1] : null;
    const alwaysApply = rules.nextDayCutoffAlwaysApply === true;
    const nextDayCutoffActive =
      isTomorrow &&
      nextDayCutoffMin !== null &&
      nextDayMinSlotMin !== null &&
      (alwaysApply || storeNow.minutesSinceMidnight >= nextDayCutoffMin);

    for (const slotStart of slotStarts) {
      const cursorUtc = storeLocalToUtc(args.date, slotStart, tz);
      const [sh, sm] = parseHm(slotStart);
      const slotMinutes = sh * 60 + sm;
      const endM = sm + durationMinutes;
      const slotEnd = `${pad2(sh + Math.floor(endM / 60))}:${pad2(endM % 60)}`;
      const key = slotKey(args.date, slotStart, args.mode);

      if (!slotPassesLeadTime(slotStart)) {
        blocked.push({ slotStart, reason: "LEAD_TIME" });
        continue;
      }

      if (pastCutoff) {
        blocked.push({ slotStart, reason: "CUTOFF" });
        continue;
      }

      if (nextDayCutoffActive && slotMinutes < nextDayMinSlotMin) {
        blocked.push({ slotStart, reason: "NEXT_DAY_CUTOFF" });
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

      const maxOrders = capacity?.maxOrders ?? defaultMax;
      if (heldCount + bookings.length >= maxOrders) {
        blocked.push({ slotStart, reason: "FULL" });
      } else {
        available.push({ slotKey: key, startTime: slotStart, endTime: slotEnd });
      }
    }

    // Include selected slot key if cart has an active hold for this date+mode
    let selectedSlotKey: string | null = null;
    const cart = await ctx.db.get(args.cartId);
    if (cart?.slotHoldId) {
      const hold = await ctx.db.get(cart.slotHoldId as Id<"slotHolds">);
      if (
        hold &&
        "status" in hold &&
        hold.status === "held" &&
        hold.expiresAt > Date.now() &&
        hold.slotKey.startsWith(args.date + "|") &&
        hold.slotKey.endsWith("|" + args.mode)
      ) {
        selectedSlotKey = hold.slotKey;
      }
    }

    // Help verify timezone and rules: formatted store-local time, lead time, cutoff for debugging
    const storeH = Math.floor(storeNow.minutesSinceMidnight / 60);
    const storeM = storeNow.minutesSinceMidnight % 60;
    const storeTimeForDebug = `${storeH % 12 || 12}:${storeM.toString().padStart(2, "0")} ${storeH >= 12 ? "PM" : "AM"} ${tz}`;
    const cutoffForDebug = cutoff ?? undefined;
    const minutesUntilCutoff =
      isSameDay && cutoffMinutes !== null && !pastCutoff
        ? cutoffMinutes - storeNow.minutesSinceMidnight
        : null;

    // Debug info when viewing tomorrow and rule is configured (helps diagnose why slots may still show)
    const nextDayDebug =
      isTomorrow && (nextDayCutoffHm || nextDayMinSlot)
        ? {
            storeTime: storeTimeForDebug,
            storeMinutes: storeNow.minutesSinceMidnight,
            cutoffAfter: nextDayCutoffHm ?? null,
            cutoffMin: nextDayCutoffMin,
            minSlot: nextDayMinSlot ?? null,
            minSlotMin: nextDayMinSlotMin,
            active: nextDayCutoffActive,
          }
        : undefined;

    return {
      available,
      blocked,
      selectedSlotKey,
      storeTimeForDebug,
      leadTimeHours: leadHours,
      cutoffForDebug,
      minutesUntilCutoff,
      isSameDay,
      nextDayCutoffActive: nextDayCutoffActive ?? false,
      nextDayDebug,
    };
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

    // Release any previous hold for this cart so we can select a new slot
    if (cart.slotHoldId) {
      const oldHold = await ctx.db.get(cart.slotHoldId as Id<"slotHolds">);
      if (oldHold && "status" in oldHold && oldHold.status === "held") {
        await ctx.db.patch(cart.slotHoldId as never, {
          status: "released",
          updatedAt: Date.now(),
        });
      }
    }

    const parts = args.slotKey.split("|");
    const slotDate = parts[0];
    const slotStartHm = parts[1];
    const modeString = parts[2];
    const mode = modeString as Mode;
    const rules = await getEnabledRules(ctx);
    if (!rules) throw new Error("No availability rules configured");

    // Enforce next-day cutoff: reject morning slots for tomorrow when ordering late
    const tz = rules.timezone ?? "America/New_York";
    const storeNow = nowInStoreTz(new Date(), tz);
    const tomorrowYmd = addDaysToYmd(storeNow.dateYmd, 1);
    const nextDayCutoffHm = typeof rules.nextDayCutoffAfterHm === "string" ? rules.nextDayCutoffAfterHm : null;
    const nextDayMinSlot = typeof rules.nextDayMinSlotStart === "string" ? rules.nextDayMinSlotStart : null;
    if (
      slotDate === tomorrowYmd &&
      nextDayCutoffHm &&
      nextDayMinSlot &&
      /^\d{1,2}:\d{2}$/.test(slotStartHm ?? "")
    ) {
      const [ch, cm] = parseHm(nextDayCutoffHm);
      const [mh, mm] = parseHm(nextDayMinSlot);
      const cutoffMin = ch * 60 + cm;
      const minSlotMin = mh * 60 + mm;
      const [sh, sm] = parseHm(slotStartHm!);
      const slotMin = sh * 60 + sm;
      if (storeNow.minutesSinceMidnight >= cutoffMin && slotMin < minSlotMin) {
        throw new Error("SLOT_BLOCKED");
      }
    }

    const capacity = await ctx.db
      .query("slotCapacities")
      .withIndex("by_slotKey", (q) => q.eq("slotKey", args.slotKey))
      .unique();
    const defaultMax = (rules.defaultMaxOrdersPerSlot as number | undefined) ?? 999;
    const maxOrders = capacity?.maxOrders ?? defaultMax;

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

    // Clear slotHoldId from the cart so the UI updates immediately
    const cart = await ctx.db.get(hold.cartId);
    if (cart && cart.slotHoldId === args.holdId) {
      await ctx.db.patch(hold.cartId, {
        slotHoldId: undefined,
        updatedAt: Date.now(),
      });
    }

    return args.holdId;
  },
});

export const expireHolds = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("slotHolds")
      .withIndex("by_status_expiresAt", (q) =>
        q.eq("status", "held").lte("expiresAt", now)
      )
      .take(200);

    for (const hold of expired) {
      await ctx.db.patch(hold._id, {
        status: "expired",
        updatedAt: now,
      });
    }
    return { expiredCount: expired.length };
  },
});

export const getHold = query({
  args: { holdId: v.id("slotHolds") },
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    if (!hold || hold.status !== "held" || hold.expiresAt <= Date.now()) return null;
    return hold;
  },
});

export const adminGetEnabledRules = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin", "manager");
    return await getEnabledRules(ctx);
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
    slotTimes: v.optional(v.array(v.string())),
    defaultMaxOrdersPerSlot: v.optional(v.number()),
    nextDayCutoffAfterHm: v.optional(v.string()),
    nextDayMinSlotStart: v.optional(v.string()),
    nextDayCutoffAlwaysApply: v.optional(v.boolean()),
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

    const { slotTimes, defaultMaxOrdersPerSlot, nextDayCutoffAfterHm, nextDayMinSlotStart, nextDayCutoffAlwaysApply, ...rest } = args;
    return await ctx.db.insert("availabilityRules", {
      ...rest,
      ...(slotTimes && slotTimes.length > 0 ? { slotTimes } : {}),
      ...(typeof defaultMaxOrdersPerSlot === "number" ? { defaultMaxOrdersPerSlot } : {}),
      ...(typeof nextDayCutoffAfterHm === "string" && /^\d{1,2}:\d{2}$/.test(nextDayCutoffAfterHm)
        ? { nextDayCutoffAfterHm }
        : {}),
      ...(typeof nextDayMinSlotStart === "string" && /^\d{1,2}:\d{2}$/.test(nextDayMinSlotStart)
        ? { nextDayMinSlotStart }
        : {}),
      ...(nextDayCutoffAlwaysApply === true ? { nextDayCutoffAlwaysApply: true } : {}),
      enabled: true,
      createdAt: Date.now(),
    });
  },
});

export const adminSetSlotCapacity = mutation({
  args: {
    slotKey: v.string(),
    maxOrders: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin", "manager");
    const [, date, startTime, mode] = args.slotKey.match(/^(\d{4}-\d{2}-\d{2})\|(\d{2}:\d{2})\|(pickup|delivery|shipping)$/) ?? [];
    if (!date || !startTime || !mode) throw new Error("Invalid slotKey format");
    const endH = parseInt(startTime.slice(0, 2), 10);
    const endM = parseInt(startTime.slice(3), 10) + 60; // assume 60 min slot
    const endTime = `${pad2(endH + Math.floor(endM / 60))}:${pad2(endM % 60)}`;
    const now = Date.now();
    const existing = await ctx.db
      .query("slotCapacities")
      .withIndex("by_slotKey", (q) => q.eq("slotKey", args.slotKey))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { maxOrders: args.maxOrders, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("slotCapacities", {
      slotKey: args.slotKey,
      mode: mode as Mode,
      date,
      startTime,
      endTime,
      maxOrders: args.maxOrders,
      createdAt: now,
      updatedAt: now,
    });
  },
});
