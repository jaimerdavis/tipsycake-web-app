# TheTipsyCake Ordering Web App — SPEC.md

> **Single source of truth.** This document is the authoritative specification for building the ordering experience on `order.tipsycake.com` using **Next.js + Tailwind + shadcn/ui + Convex**, with Stripe + PayPal, advanced scheduling rules, delivery pricing/eligibility, tracking, coupons, loyalty, and abandoned cart.

---

## 0) Locked decisions (do not change without updating this SPEC)

### Tech stack

* **Frontend:** Next.js (App Router) + TypeScript
* **Styling:** TailwindCSS
* **UI primitives:** shadcn/ui (local code in repo)
* **Forms:** react-hook-form + zod
* **Backend:** Convex (DB + functions + realtime)
* **Jobs:** Convex Scheduled Functions + Cron
* **Files:** Convex File Storage (proof-of-delivery photos)
* **Payments:** Stripe (cards + wallets) + PayPal
* **Maps:** Google Places Autocomplete + geocoding/validation + cached distance/zone calculations
* **Observability:** Sentry + structured logs

### UX principles

* Customer scheduling UI is **date picker + time slot list** (mobile-first).
* Calendar grid is optional for admin views only.

### Business assumptions

* Peak daily orders: ~10–20/day.
* Returns/exchanges: **not supported**.

---

## 1) AI development rules (non-negotiable)

**AI-DEV-001** Implement only by requirement IDs in this SPEC. No invented features.

**AI-DEV-002** UI primitives must be from `@/components/ui/*` (shadcn). Do not create a second component library.

**AI-DEV-003** All business logic is server-side in Convex (fees, eligibility, scheduling, coupon validation, holds, order totals, loyalty).

**AI-DEV-004** Payments are **webhook-authoritative** and must be **idempotent**.

**AI-DEV-005** Scheduling must enforce **capacity with holds** and pass concurrency tests.

**AI-DEV-006** All state transitions must be logged (orderEvents + auditLogs).

**AI-DEV-007** Never commit secrets. Only env vars.

---

## 2) Product overview

### Objective

Build a mobile-first web app that provides a smooth checkout experience and supports:

* Pickup + Local Delivery + Shipping
* Advanced scheduling rules (cutoffs, lead time, DOW rules, blackout dates)
* Slot capacity enforcement (no overbooking)
* Coupons/promotions
* Loyalty/rewards program
* Cart abandonment recovery
* Delivery tracking + shipping tracking
* Full internal back-office without Woo/Shopify dependency

### Success metrics

* Conversion rate (session → paid order)
* Median time to checkout
* Slot utilization & sold-out slot frequency
* Abandoned cart recovery rate
* Support tickets per 100 orders
* Delivery on-time rate and pricing accuracy

---

## 3) Personas and roles

### Customers

* Guest customer (no account)
* Registered customer (account)
* Loyalty member (registered + points)

### Internal

* Admin (full access)
* Manager (config: products, rules, promos)
* Kitchen (production statuses)
* Dispatcher (driver assignment, delivery monitoring)
* Driver (assigned deliveries only)

**RBAC requirement:** All admin/driver actions must be authorized server-side.

---

## 4) Core user journeys

### 4.1 Browse → Customize → Cart

1. Browse categories/products
2. Product detail:

   * select variant
   * select modifiers (required/optional, min/max)
   * optional notes/messages
3. Add to cart
4. Cart supports quantity edits, remove items, add item-level notes

### 4.2 Cart → Fulfillment → Address → Scheduling → Checkout

1. Choose fulfillment: pickup / delivery / shipping
2. If delivery/shipping:

   * address autocomplete + validation
   * eligibility determination (delivery vs shipping vs unavailable)
   * fee quote (delivery or shipping)
3. Scheduling:

   * pick date
   * select time slot list
   * create slot hold
4. Checkout:

   * contact info (email + phone)
   * apply coupon
   * add tip
   * pay (Stripe wallet/cards + PayPal)
5. Confirmation:

   * order summary
   * scheduled info
   * status page link

### 4.3 Order status + tracking

* Guest token-based order status page
* Delivery tracking timeline (and later map)
* Shipping tracking (tracking number + carrier link)

### 4.4 Abandoned cart

* Capture email/phone early
* Scheduled reminder(s) with cart restore link

### 4.5 Loyalty

* Earn points on paid orders
* Redeem points for discount/rewards
* Audit adjustments in admin

---

## 5) Functional requirements (with IDs)

### 5.1 Catalog (CAT)

**CAT-001** Admin can create/edit products: name, description, images, base price, status, category/tags.

**CAT-002** Products support variants with price deltas.

**CAT-003** Products support modifier groups:

* required/optional
* min/max selections
* option price deltas
* validation messaging

**CAT-004** Product fulfillment flags: pickup/delivery/shipping.

**CAT-005** Product lead time override (hours) and "in-stock today" flag.

**CAT-006** Optional per-product max quantity per order.

---

### 5.2 Cart (CRT)

**CRT-001** Guest cart persists across refresh via session/cookie.

**CRT-002** Logged-in cart persists per user.

**CRT-003** Cart line item stores snapshot: product/variant/modifiers/notes/qty/unit price.

**CRT-004** Cart totals compute:

* subtotal
* discounts
* delivery/shipping fee
* tips
* tax display (tax-inclusive now)
* final total

**CRT-005** Coupon apply/remove with immediate validation + feedback.

**CRT-006** Cart stores fulfillment selection, address ID (if needed), selected slot hold ID.

---

### 5.3 Fulfillment + address eligibility (FUL)

**FUL-001** Fulfillment: pickup, local delivery, shipping.

**FUL-002** Address capture uses autocomplete; stores normalized components + lat/lng.

**FUL-003** Eligibility result:

* delivery eligible (+ fee)
* shipping eligible (+ fee)
* unavailable

**FUL-004** Delivery fee rules support:

* distance tiers (required)
* optional polygon zones
* min order threshold (optional)
* free delivery via coupon (required)

**FUL-005** Shipping fees support flat/tiered now; carrier-calculated later.

**FUL-006** Cache address geocodes + distance/zone results.

---

### 5.4 Scheduling & capacity (SCH)

**SCH-001** System timezone configurable; store operates in that timezone.

**SCH-002** Store hours per weekday; supports multiple windows per day.

**SCH-003** Same-day cutoff per weekday and fulfillment mode.

**SCH-004** Lead time rules:

* global default
* per product/category overrides
* cart lead time = max across items

**SCH-005** Manual blackout dates required.

**SCH-006** Slot duration configurable per fulfillment mode.

**SCH-007** Slot capacity enforced:

* minimum: max orders per slot
* preferred: capacity by category supported

**SCH-008** Slot API returns:

* available slots
* optional blocked slots with reason codes: CLOSED, BLACKOUT, CUTOFF, LEAD_TIME, FULL, NOT_ELIGIBLE

**SCH-009** Slot hold required:

* create hold tied to cart
* holds expire after N minutes
* holds count toward capacity

**SCH-010** On payment success: convert hold → booking and attach to order.

**SCH-011** Concurrency safe: no overbooking under simultaneous checkouts.

**SCH-012** Scheduled cleanup expires holds and releases capacity.

---

### 5.5 Payments (PAY)

**PAY-001** Payment methods: card, Apple Pay, Google Pay, PayPal.

**PAY-002** Tips: preset % + custom.

**PAY-003** Tax inclusive now; store tax fields for future.

**PAY-004** Payment confirmation is webhook-authoritative.

**PAY-005** Webhook idempotency: duplicates do not create duplicates.

**PAY-006** Payment failure/cancel releases slot hold and does not finalize order.

**PAY-007** Payment attempt logs stored for support.

---

### 5.6 Promotions/Coupons (PRM)

**PRM-001** Support:

* percent off
* fixed amount off
* free delivery
* min subtotal
* expiry
* usage limits (global + per-customer)
* include/exclude products/categories
* stacking policy defined

**PRM-002** Redemption atomic and concurrency safe.

**PRM-003** Admin UI for coupon CRUD + usage report.

---

### 5.7 Loyalty (LOY)

**LOY-001** Account required for points.

**LOY-002** Points ledger append-only with earn/redeem/adjust.

**LOY-003** Earn rules configurable (points per $ + optional bonuses).

**LOY-004** Redeem points: apply discount or generate reward coupon.

**LOY-005** Anti-abuse controls + audits.

---

### 5.8 Orders + tracking (ORD/TRK)

**ORD-001** Order statuses:

* pending_payment
* paid_confirmed
* in_production
* ready_for_pickup
* out_for_delivery
* delivered
* shipped
* completed
* canceled
* failed

**ORD-002** Order stores immutable snapshot: items, pricing breakdown, discounts, fees, tip, fulfillment, slot booking.

**TRK-001** Guest-accessible order status via tokenized URL.

**TRK-002** Delivery tracking shows timeline + ETA.

**TRK-003** Driver portal:

* assigned deliveries only
* status update buttons
* navigation link
* optional live location sharing
* optional proof-of-delivery photo upload

**TRK-004** Shipping tracking:

* admin enters carrier + tracking number
* customer sees tracking link

---

### 5.9 Notifications (NTF)

**NTF-001** Customer email:

* paid confirmation
* relevant status updates
* shipped + tracking

**NTF-002** SMS optional for delivery milestones and abandoned cart.

**NTF-003** Internal notifications optional.

---

### 5.10 Abandoned cart (ABD)

**ABD-001** Capture email/phone before payment where possible.

**ABD-002** Scheduled reminders (1+).

**ABD-003** Cart restore link reconstructs cart; revalidate availability.

**ABD-004** Optional incentive logic.

---

### 5.11 Admin/back-office (ADM)

**ADM-001** RBAC for internal roles.

**ADM-002** Admin screens:

* products/modifiers
* scheduling rules + blackouts + capacities
* delivery tiers/zones
* coupons
* loyalty accounts/adjustments
* orders list + details + status updates
* driver management + assignments
* shipping tracking entry
* analytics
* audit logs

**ADM-003** Audit logs required for changes to:

* scheduling rules
* delivery pricing rules
* coupons
* loyalty adjustments

---

## 6) Critical invariants (must never break)

**INV-001** No overbooking: holds + bookings cannot exceed capacity.

**INV-002** No duplicate paid orders: webhook idempotency required.

**INV-003** Coupon usage limits cannot be bypassed.

**INV-004** Price integrity: fee/discount shown must match charged amount unless customer changes address/fulfillment/slot.

**INV-005** Timezone correctness for cutoffs and lead times.

---

## 7) Data model (Convex tables)

> Table names are canonical; fields are required unless marked optional.

### 7.1 Catalog

* **products**

  * _id
  * name, slug
  * description
  * images[]
  * status (active/hidden)
  * categories[] / tags[]
  * basePriceCents
  * fulfillmentFlags { pickup, delivery, shipping }
  * leadTimeHoursOverride? (number)
  * inStockToday (boolean)
  * maxQtyPerOrder? (number)
  * createdAt, updatedAt

* **productVariants**

  * _id, productId
  * name/label
  * priceDeltaCents
  * sku? (optional)

* **modifierGroups**

  * _id, productId
  * name
  * required (boolean)
  * minSelect, maxSelect
  * sortOrder

* **modifierOptions**

  * _id, groupId
  * name
  * priceDeltaCents
  * sortOrder

### 7.2 Customer + auth

* **users** (from auth)
* **customerProfiles**

  * userId
  * phone
  * defaultAddressId?
  * loyaltyAccountId?

### 7.3 Cart

* **carts**

  * _id
  * ownerType (guest/user)
  * ownerId (guestSessionId or userId)
  * status (active/converted/abandoned)
  * contactEmail?
  * contactPhone?
  * fulfillmentMode? (pickup/delivery/shipping)
  * addressId?
  * tipCents (default 0)
  * appliedCouponId?
  * appliedCouponCode?
  * appliedLoyaltyPoints? (number)
  * slotHoldId?
  * createdAt, updatedAt

* **cartItems**

  * _id, cartId
  * productId, variantId?
  * qty
  * modifiers: [{ groupId, optionId }]
  * itemNote?
  * unitPriceSnapshotCents

### 7.4 Scheduling

* **availabilityRules**

  * _id
  * version
  * timezone
  * storeHours: { [weekday]: [{ start: "HH:mm", end: "HH:mm" }] }
  * cutoffTimes: { [weekday]: { pickup?: "HH:mm", delivery?: "HH:mm", shipping?: "HH:mm" } }
  * globalLeadTimeHours
  * categoryLeadTimeHours?: { [categoryTag]: number }
  * productLeadTimeHours?: { [productId]: number }
  * slotDurationMinutesByMode: { pickup: number, delivery: number, shipping: number }
  * holdMinutes
  * enabled (boolean)
  * effectiveFrom (date)
  * createdAt

* **blackoutDates**

  * _id
  * date (YYYY-MM-DD)
  * modes? (optional array; if absent applies to all)
  * note?

* **slotCapacities**

  * _id
  * slotKey (string: `${date}|${start}|${mode}`)
  * mode
  * date
  * startTime
  * endTime
  * maxOrders (number)
  * categoryCaps? (optional map: categoryTag → max)

* **slotHolds**

  * _id
  * cartId
  * slotKey
  * expiresAt (timestamp)
  * status (held/converted/expired/released)
  * createdAt

* **slotBookings**

  * _id
  * orderId
  * cartId
  * slotKey
  * mode
  * createdAt

### 7.5 Delivery pricing + address cache

* **addresses**

  * _id
  * ownerId? (userId optional)
  * formatted
  * line1, line2?, city, state, zip
  * lat, lng
  * placeId?
  * notes? (delivery instructions)
  * createdAt

* **deliveryTiers**

  * _id
  * minMiles
  * maxMiles
  * feeCents
  * enabled

* **deliveryZones** (optional polygon support)

  * _id
  * name
  * polygonGeoJson
  * feeCents
  * enabled

* **addressCache**

  * _id
  * addressId
  * distanceMiles
  * zoneId?
  * eligibleDelivery (boolean)
  * eligibleShipping (boolean)
  * computedAt

### 7.6 Orders

* **orders**

  * _id
  * orderNumber
  * userId? (optional)
  * guestToken
  * status
  * contactEmail
  * contactPhone
  * fulfillmentMode
  * addressId?
  * scheduledSlotKey?
  * pricingSnapshot:

    * subtotalCents
    * discountCents
    * deliveryFeeCents
    * shippingFeeCents
    * tipCents
    * taxCents (stored even if inclusive)
    * totalCents
  * appliedCouponCode?
  * loyaltyPointsEarned?
  * loyaltyPointsRedeemed?
  * paymentProvider
  * paymentIntentId / paypalOrderId
  * createdAt, updatedAt

* **orderItems**

  * _id
  * orderId
  * productSnapshot
  * variantSnapshot?
  * modifiersSnapshot
  * qty
  * unitPriceCents

* **orderEvents**

  * _id
  * orderId
  * status
  * note?
  * actorType (system/admin/driver)
  * actorId?
  * createdAt

### 7.7 Coupons + loyalty

* **coupons**

  * _id
  * code
  * type (percent/fixed/free_delivery)
  * value (percent or cents)
  * minSubtotalCents?
  * expiresAt?
  * maxRedemptions?
  * maxRedemptionsPerCustomer?
  * includeProductIds? / includeCategoryTags?
  * excludeProductIds? / excludeCategoryTags?
  * stackable (boolean)
  * enabled
  * createdAt

* **couponRedemptions**

  * _id
  * couponId
  * code
  * orderId
  * userId?
  * contactEmail?
  * createdAt

* **loyaltyAccounts**

  * _id
  * userId
  * pointsBalance
  * tier?
  * createdAt

* **pointsLedger**

  * _id
  * accountId
  * type (earn/redeem/adjust)
  * points (positive/negative)
  * orderId?
  * note?
  * createdAt

### 7.8 Drivers + tracking

* **drivers**

  * _id
  * name
  * phone
  * active

* **driverAssignments**

  * _id
  * orderId
  * driverId
  * status (assigned/en_route/delivered)
  * eta?
  * createdAt

* **driverLocations**

  * _id
  * assignmentId
  * lat, lng
  * createdAt

* **proofOfDeliveryFiles**

  * _id
  * assignmentId
  * storageId
  * createdAt

### 7.9 Ops + audit

* **webhookEvents**

  * _id
  * provider (stripe/paypal)
  * eventId
  * payloadHash
  * processedAt?
  * status (received/processed/ignored/failed)
  * error?

* **auditLogs**

  * _id
  * actorType (admin/system)
  * actorId
  * action
  * entityType
  * entityId
  * diff?
  * createdAt

---

## 8) Backend function contracts (Convex)

> These function names are canonical. If you change one, update this SPEC.

### 8.1 Queries

* `catalog.listProducts(filters)`
* `catalog.getProduct(productId)`
* `cart.getActive()`
* `checkout.getEligibility(addressInputOrId)`
* `scheduling.getAvailableDates({ mode, cartId, addressId? })`
* `scheduling.getSlots({ mode, date, cartId, addressId? })`
* `orders.getByToken(token)`
* `admin.orders.list(filters)`
* `admin.dashboard.summary(range)`

### 8.2 Mutations

* `cart.addItem(payload)`
* `cart.updateItem(payload)`
* `cart.removeItem(payload)`
* `cart.applyCoupon({ cartId, code })`
* `cart.removeCoupon({ cartId })`
* `cart.setTip({ cartId, amount })`
* `checkout.setFulfillment({ cartId, mode, addressId? })`
* `scheduling.createHold({ cartId, slotKey })`
* `scheduling.releaseHold({ holdId })`
* `loyalty.redeemPoints({ cartId, points })`
* `admin.orders.updateStatus({ orderId, status })`
* `admin.orders.assignDriver({ orderId, driverId })`
* `admin.shipping.setTracking({ orderId, carrier, trackingNumber })`
* `driver.updateStatus({ assignmentId, status })`
* `driver.pingLocation({ assignmentId, lat, lng })`
* `driver.uploadProofOfDelivery({ assignmentId, storageId })`

### 8.3 Actions (integrations)

* `payments.createStripeSession({ cartId })`
* `payments.createPayPalOrder({ cartId })`
* `webhooks.handleStripeEvent(raw)`
* `webhooks.handlePayPalEvent(raw)`
* `maps.normalizeAndGeocodeAddress(input)`
* `maps.computeDistanceAndZone({ addressId })`
* `notifications.sendEmail(payload)`
* `notifications.sendSms(payload)`

### 8.4 Scheduled jobs

* `scheduling.expireHolds()`
* `abandoned.scanAndNotify()`
* `payments.reconcileOrphans()`

---

## 9) Pricing and totals computation (canonical rules)

### 9.1 Totals breakdown

Order total must always be computed server-side and stored as `pricingSnapshot`.

Compute in this order:

1. Subtotal = Σ(item unitPriceSnapshotCents × qty) + modifier deltas
2. Apply coupon discount (PRM rules)
3. Apply loyalty redemption discount (LOY rules)
4. Add delivery fee OR shipping fee
5. Add tip
6. Tax handling: store tax fields even if inclusive
7. Total = subtotal - discounts + fees + tip

### 9.2 Consistency

* `checkout.getEligibility` must return a stable fee quote.
* If address changes, eligibility and fees must be recomputed.

---

## 10) Scheduling engine (canonical behavior)

### 10.1 Slot key format

`slotKey = "${YYYY-MM-DD}|${HH:mm}|${mode}"`

### 10.2 Rule evaluation order

For a given cart + mode + address:

1. Validate eligibility (delivery/shipping)
2. Determine cartLeadTimeHours = max across items (global + overrides)
3. Determine earliestAllowedDateTime = now + lead time
4. Apply store hours windows for the requested date
5. Remove slots before earliestAllowedDateTime
6. Apply same-day cutoff rules
7. Apply blackout dates
8. Apply capacity: FULL if holds + bookings ≥ capacity

### 10.3 Holds

* Hold created at time of slot selection
* Hold expiration enforced by timestamp
* On expiration: mark hold expired; capacity freed

### 10.4 Concurrency

* Holds and coupon redemptions must be implemented in Convex mutations such that simultaneous attempts cannot exceed limits (INV-001, INV-003).

---

## 11) Payment finalization (canonical behavior)

### 11.1 Webhook authoritative

* Order is not considered paid until webhook verified and processed.

### 11.2 Idempotency

* Store webhook event IDs in `webhookEvents`.
* If already processed, ignore safely.

### 11.3 Success flow

On payment success webhook:

1. Validate webhook signature
2. Deduplicate event
3. Fetch cart
4. Validate slot hold still valid (or handle expired gracefully)
5. Convert hold → booking
6. Create order with immutable snapshots
7. Mark order paid_confirmed
8. Award loyalty points
9. Send confirmation notifications

### 11.4 Failure flow

On payment failure/cancel:

* release hold
* mark cart not converted; allow retry

---

## 12) Tracking (delivery + shipping)

### Delivery

* Driver assignment exists for each delivery order
* Driver can update status and optionally share location
* Customer sees timeline and ETA
* Proof-of-delivery photo stored in Convex file storage

### Shipping

* Admin enters tracking number and (optional) carrier
* Customer sees tracking link

---

## 13) Notifications

Templates required:

* Order confirmation (paid)
* Pickup ready
* Out for delivery
* Delivered
* Shipped (with tracking)
* Abandoned cart reminder(s)

Notification triggers are job-based and must be retry-safe.

---

## 14) Admin/back-office screens (ADM-002)

### Admin screens

* Orders board (filters: date/status/mode/slot)
* Order detail (kitchen-friendly)
* Products/variants/modifiers
* Scheduling rules editor
* Blackout dates editor
* Slot capacities editor
* Delivery tiers/zones editor
* Coupons manager + usage report
* Loyalty accounts + adjustments
* Drivers + assignments
* Shipping tracking entry
* Analytics
* Audit logs viewer

---

## 15) Testing requirements (must be implemented)

### Unit tests

* Scheduling rule engine (cutoff/lead time/blackout/capacity)
* Coupon validation + usage limits
* Fee calculations for tiers/zones
* Loyalty ledger math

### Integration tests

* Concurrency: two holds on last slot
* Duplicate webhook replay: only one order created
* Payment cancel releases hold
* Abandoned cart scheduler sends reminders

### E2E tests

* Pickup checkout
* Delivery checkout
* Shipping checkout
* Coupon apply
* Loyalty earn + redeem
* Driver update visible on customer status page

---

## 16) Task backlog (AI-safe)

> Each task must reference requirement IDs.

### Foundation

* TASK-ARCH-001 Repo structure + shared types + lint/format
* TASK-ARCH-002 Auth + RBAC scaffolding (ADM-001)
* TASK-ARCH-003 Audit logs utility (ADM-003)

### Catalog

* TASK-CAT-001 Convex schema for catalog (CAT-001..CAT-006)
* TASK-CAT-002 Admin CRUD for products/modifiers (ADM-002)
* TASK-CAT-003 Storefront product list/detail with modifier validation (CAT-003)

### Cart

* TASK-CRT-001 Cart schema + mutations + totals computation (CRT-001..CRT-006)
* TASK-CRT-002 Cart UI + totals breakdown (CRT-004)

### Address + eligibility

* TASK-FUL-001 Address capture UI (FUL-002)
* TASK-FUL-002 Eligibility + fee quote (FUL-003..FUL-006)

### Scheduling

* TASK-SCH-001 Rules schema + editor UI (SCH-001..SCH-006)
* TASK-SCH-002 Slot generation engine + reason codes (SCH-008)
* TASK-SCH-003 Capacity model + enforcement (SCH-007)
* TASK-SCH-004 Holds + expiry logic (SCH-009, SCH-012)
* TASK-SCH-005 Concurrency tests (SCH-011, INV-001)

### Coupons

* TASK-PRM-001 Coupon engine + atomic redemption (PRM-001..PRM-003, INV-003)
* TASK-PRM-002 Coupon admin UI + reporting

### Loyalty

* TASK-LOY-001 Loyalty accounts + ledger + earn on paid orders (LOY-002)
* TASK-LOY-002 Redeem points in cart (LOY-004)
* TASK-LOY-003 Admin adjustments + audit (LOY-005, ADM-003)

### Payments

* TASK-PAY-001 Stripe session creation + webhook finalization (PAY-001..PAY-007, INV-002)
* TASK-PAY-002 PayPal create order + webhook finalization (PAY-001..PAY-007, INV-002)

### Orders + tracking

* TASK-ORD-001 Order snapshots + status timeline + token link (ORD-001..ORD-002, TRK-001)
* TASK-TRK-001 Driver portal + assignment + status updates (TRK-003)
* TASK-TRK-002 Driver location pings + customer map view (TRK-002..TRK-003)
* TASK-TRK-003 Shipping tracking entry + display (TRK-004)

### Abandoned cart

* TASK-ABD-001 Capture contact early + store in cart (ABD-001)
* TASK-ABD-002 Scheduled reminders + restore links (ABD-002..ABD-003)

### Admin

* TASK-ADM-001 Orders board + filters + detail view (ADM-002)
* TASK-ADM-002 Scheduling/blackout/capacity editors (ADM-002)
* TASK-ADM-003 Delivery tiers/zones editor (ADM-002)
* TASK-ADM-004 Driver management + assignments (ADM-002)

---

## 17) Prompt pack (copy/paste)

### 17.1 Global project rules

```text
You are working in the TheTipsyCake ordering web app repo.
Follow SPEC.md requirement IDs exactly. Do not invent features.
UI primitives must come from /components/ui (shadcn). Do not invent new primitives.
All business logic must be server-side in Convex.
Payments are webhook-authoritative and must be idempotent.
Scheduling must enforce holds + capacity atomically and pass concurrency tests.
Before coding: restate requirement IDs and list files to change.
After coding: summary, how to test, migrations, risks.
```

### 17.2 Generate scheduling module

```text
Implement SCH-001 through SCH-012 and INV-001 and INV-005.
Deliver:
- Convex tables for scheduling
- Convex functions: scheduling.getAvailableDates, scheduling.getSlots, scheduling.createHold, scheduling.releaseHold, scheduling.expireHolds
- Unit tests for cutoff, lead time, blackout, FULL
- Integration test: two simultaneous holds on last slot
Do not touch payments.
```

### 17.3 Payments + idempotent webhooks

```text
Implement PAY-001 through PAY-007 and INV-002.
Deliver:
- webhookEvents table and dedupe logic
- Stripe create session + webhook handler that finalizes order exactly once
- PayPal create order + webhook handler
- On payment success: convert slot hold -> booking (SCH-010) and create order snapshot (ORD-002)
- On failure/cancel: release hold (PAY-006)
Include replay test: same webhook twice -> single order.
```

### 17.4 Coupon engine

```text
Implement PRM-001 through PRM-003 and INV-003.
Support percent, fixed, free delivery, min subtotal, expiry, usage limits.
Include/exclude products/categories.
Define stacking policy (single coupon only unless SPEC says otherwise).
Atomic redemption with concurrency test.
```

---

## 18) Cursor + Claude workflow (practical)

### Recommended workflow

* Use **Cursor** as primary IDE for edits/refactors.
* Use Claude Code only for controlled multi-file generation.

### Guardrails

* Always start prompts with the global project rules.
* Require AI to list files and requirement IDs.
* Review diffs before running.
* Keep secrets in env-only.

---

## 19) Acceptance checklist

* Customer can place pickup, delivery, and shipping orders end-to-end.
* Scheduling respects cutoff/lead time/blackout and never overbooks.
* Delivery eligibility and fees are correct for addresses.
* Coupons work with usage limits.
* Loyalty earns and redeems correctly.
* Order status page works for guests via token.
* Delivery tracking and shipping tracking display correctly.
* Admin can manage products, rules, promos, orders, drivers, and tracking.

---

## 20) Appendix: UI primitives list (shadcn)

Minimum primitives to standardize:

* Button, Input, Label
* Select, Checkbox, RadioGroup, Switch
* Dialog, Sheet, Popover
* Tabs
* Card
* Table
* Toast/Sonner
* Badge
* Separator
* Skeleton

All new UI must compose these.
