---
name: scheduling-engine
description: Implement the TipsyCake scheduling engine — slot generation, capacity enforcement, holds, expiry, and concurrency safety. Use when working on SCH-001 through SCH-012, INV-001, or INV-005.
---

# Scheduling Engine

Implements SPEC.md sections 10 (Scheduling engine) and 5.4 (SCH requirements).

## Slot Key Format

```
slotKey = "${YYYY-MM-DD}|${HH:mm}|${mode}"
```

Where mode is `pickup`, `delivery`, or `shipping`.

## Tables (SPEC section 7.4)

- `availabilityRules` — store hours, cutoffs, lead times, slot durations, hold minutes
- `blackoutDates` — manual blackout dates per mode
- `slotCapacities` — max orders per slot (+ optional category caps)
- `slotHolds` — temporary capacity reservations tied to carts
- `slotBookings` — confirmed bookings tied to orders

## Rule Evaluation Order (SPEC 10.2)

For a given `cart + mode + address`:

1. Validate eligibility (delivery/shipping address check)
2. Compute `cartLeadTimeHours` = max across all cart items (global + product/category overrides)
3. Compute `earliestAllowedDateTime` = now + lead time
4. Generate slots from store hours windows for the requested date
5. Remove slots before `earliestAllowedDateTime`
6. Apply same-day cutoff rules per mode
7. Apply blackout dates
8. Apply capacity: slot is `FULL` if `activeHolds + bookings >= maxOrders`

## Reason Codes (SCH-008)

Return blocked slots with reason: `CLOSED`, `BLACKOUT`, `CUTOFF`, `LEAD_TIME`, `FULL`, `NOT_ELIGIBLE`

## Hold Lifecycle (SCH-009, SCH-010, SCH-012)

```
createHold(cartId, slotKey)
  → check capacity atomically (holds + bookings < max)
  → insert slotHold with status="held", expiresAt=now+holdMinutes
  → return holdId

On payment success (webhook):
  → convert hold status to "converted"
  → insert slotBooking tied to orderId

expireHolds() [cron job]:
  → find holds where expiresAt < now AND status="held"
  → set status="expired"

releaseHold(holdId):
  → set status="released"
```

## Concurrency Safety (SCH-011, INV-001)

Convex mutations are serialized per-document. The `createHold` mutation must:

1. Query all active holds (`status="held"` AND `expiresAt > now`) for the slotKey
2. Query all bookings for the slotKey
3. Check `activeHolds.length + bookings.length < capacity.maxOrders`
4. Only then insert the hold

Because this runs in a single Convex mutation, two simultaneous calls will serialize and the second will see the first's hold.

## Timezone Handling (INV-005)

- `availabilityRules.timezone` is the store timezone (e.g. "America/New_York")
- All cutoff and lead time comparisons must use this timezone
- Slot times are in store-local time
- `Date.now()` gives UTC; convert to store timezone before comparing

## Functions (SPEC section 8)

```typescript
// Queries
scheduling.getAvailableDates({ mode, cartId, addressId? })
scheduling.getSlots({ mode, date, cartId, addressId? })

// Mutations
scheduling.createHold({ cartId, slotKey })
scheduling.releaseHold({ holdId })

// Internal (cron)
scheduling.expireHolds()
```

## Indexes Required

```typescript
slotHolds: defineTable({...})
  .index("by_slotKey", ["slotKey"])
  .index("by_cartId", ["cartId"])
  .index("by_status_expires", ["status", "expiresAt"])

slotBookings: defineTable({...})
  .index("by_slotKey", ["slotKey"])
  .index("by_orderId", ["orderId"])

slotCapacities: defineTable({...})
  .index("by_slotKey", ["slotKey"])
```

## Testing (SPEC section 15)

### Unit tests
- Cutoff rules block same-day slots after cutoff
- Lead time removes slots within lead window
- Blackout dates block all slots for that date
- FULL status when capacity reached

### Integration tests
- Two simultaneous `createHold` on last-slot: one succeeds, one fails
- Expired hold no longer counts toward capacity
