# Incident Runbook (Initial)

## 1) Duplicate Payment Event Suspected

Symptoms:
- Multiple webhook deliveries for same provider event.
- Potential duplicate order creation concern.

Actions:
1. Find provider `eventId`.
2. Query `webhookEvents` for duplicates and statuses.
3. Confirm only one order exists for payment intent/order ID.
4. If mismatch exists, stop automation and perform manual reconciliation.

## 2) Paid But No Confirmed Order

Symptoms:
- Customer charged, order not in `paid_confirmed`.

Actions:
1. Locate payment intent/paypal order ID.
2. Inspect `webhookEvents` status and error field.
3. Re-run safe reconciliation flow (`payments.reconcileOrphans`).
4. Confirm slot hold conversion and order snapshot creation.

## 3) Slot Overbook Report

Symptoms:
- More orders than configured slot capacity.

Actions:
1. Query slot holds and bookings for `slotKey`.
2. Verify expired holds were cleaned up.
3. Check recent scheduling deployments and tests.
4. Temporarily reduce slot availability while root cause is resolved.

## 4) Coupon Abuse / Over-Redemption

Symptoms:
- Coupon used beyond max limits.

Actions:
1. Query `couponRedemptions` for coupon and customer scope.
2. Validate redemption logic path and indexes.
3. Disable affected coupon if needed.
4. Patch atomic redemption logic and add concurrency test.
