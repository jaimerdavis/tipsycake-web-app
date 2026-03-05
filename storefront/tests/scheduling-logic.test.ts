import { describe, it, expect } from "vitest";

/**
 * Tests for scheduling invariants (INV-001: capacity enforcement).
 * These validate the pure logic rules the scheduling engine uses.
 */

function slotKey(date: string, start: string, mode: string) {
  return `${date}|${start}|${mode}`;
}

function isSlotFull(params: {
  heldCount: number;
  bookingCount: number;
  maxOrders: number;
}): boolean {
  return params.heldCount + params.bookingCount >= params.maxOrders;
}

function isHoldExpired(expiresAt: number, now: number): boolean {
  return expiresAt <= now;
}

function shouldBlockForLeadTime(
  slotStart: Date,
  now: Date,
  leadHours: number
): boolean {
  const earliest = new Date(now.getTime() + leadHours * 60 * 60 * 1000);
  return slotStart < earliest;
}

describe("slot key format", () => {
  it("combines date, time, and mode", () => {
    expect(slotKey("2026-03-10", "09:00", "pickup")).toBe(
      "2026-03-10|09:00|pickup"
    );
  });
});

describe("slot capacity (INV-001)", () => {
  it("slot with 0 holds and 0 bookings is not full", () => {
    expect(isSlotFull({ heldCount: 0, bookingCount: 0, maxOrders: 5 })).toBe(
      false
    );
  });

  it("slot at max with holds is full", () => {
    expect(isSlotFull({ heldCount: 3, bookingCount: 2, maxOrders: 5 })).toBe(
      true
    );
  });

  it("slot at max with bookings is full", () => {
    expect(isSlotFull({ heldCount: 0, bookingCount: 5, maxOrders: 5 })).toBe(
      true
    );
  });

  it("mixed holds + bookings reaching capacity is full", () => {
    expect(isSlotFull({ heldCount: 2, bookingCount: 3, maxOrders: 5 })).toBe(
      true
    );
  });

  it("over capacity is full", () => {
    expect(isSlotFull({ heldCount: 3, bookingCount: 3, maxOrders: 5 })).toBe(
      true
    );
  });

  it("one under capacity is not full", () => {
    expect(isSlotFull({ heldCount: 2, bookingCount: 2, maxOrders: 5 })).toBe(
      false
    );
  });
});

describe("hold expiry", () => {
  it("hold past its expiry time is expired", () => {
    const now = Date.now();
    expect(isHoldExpired(now - 1000, now)).toBe(true);
  });

  it("hold exactly at expiry time is expired", () => {
    const now = Date.now();
    expect(isHoldExpired(now, now)).toBe(true);
  });

  it("hold with future expiry is not expired", () => {
    const now = Date.now();
    expect(isHoldExpired(now + 60_000, now)).toBe(false);
  });
});

describe("lead time blocking", () => {
  it("slot within lead time is blocked", () => {
    const now = new Date("2026-03-10T10:00:00");
    const slotStart = new Date("2026-03-10T12:00:00");
    expect(shouldBlockForLeadTime(slotStart, now, 24)).toBe(true);
  });

  it("slot after lead time is not blocked", () => {
    const now = new Date("2026-03-10T10:00:00");
    const slotStart = new Date("2026-03-12T10:00:00");
    expect(shouldBlockForLeadTime(slotStart, now, 24)).toBe(false);
  });

  it("0 lead time never blocks", () => {
    const now = new Date("2026-03-10T10:00:00");
    const slotStart = new Date("2026-03-10T10:30:00");
    expect(shouldBlockForLeadTime(slotStart, now, 0)).toBe(false);
  });
});

describe("concurrent hold simulation", () => {
  it("two holds competing for last slot: first wins, second blocked", () => {
    let heldCount = 3;
    const maxOrders = 5;
    const bookingCount = 1;

    const firstCanHold = !isSlotFull({
      heldCount,
      bookingCount,
      maxOrders,
    });
    expect(firstCanHold).toBe(true);
    heldCount += 1;

    const secondCanHold = !isSlotFull({
      heldCount,
      bookingCount,
      maxOrders,
    });
    expect(secondCanHold).toBe(false);
  });

  it("expired hold frees capacity for new hold", () => {
    const now = Date.now();
    const holds = [
      { expiresAt: now - 1000, status: "held" as const },
      { expiresAt: now + 60_000, status: "held" as const },
      { expiresAt: now + 60_000, status: "held" as const },
    ];

    const activeHeldCount = holds.filter(
      (h) => h.status === "held" && !isHoldExpired(h.expiresAt, now)
    ).length;

    expect(activeHeldCount).toBe(2);
    expect(
      isSlotFull({ heldCount: activeHeldCount, bookingCount: 0, maxOrders: 3 })
    ).toBe(false);
  });
});
