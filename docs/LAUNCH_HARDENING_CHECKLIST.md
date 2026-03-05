# Launch Hardening Checklist

Use this checklist before production launch and after any major domain update.

## Product Correctness

- [ ] Pickup, delivery, and shipping checkout flows pass end-to-end.
- [ ] Scheduling respects cutoff, lead time, blackout, and capacity.
- [ ] `INV-001` validated: no overbooking under concurrency.
- [ ] `INV-002` validated: duplicate webhook replay creates no duplicate orders.
- [ ] `INV-003` validated: coupon limits hold under concurrent redemption.
- [ ] `INV-004` validated: quoted totals match charged totals.
- [ ] `INV-005` validated: timezone and DST behavior confirmed.

## Payments and Reconciliation

- [ ] Stripe webhooks verified in non-local environment.
- [ ] PayPal webhooks verified in non-local environment.
- [ ] Replay test: same webhook event processed once.
- [ ] Cancel/failure flow releases slot holds.
- [ ] Reconciliation job (`payments.reconcileOrphans`) tested.

## Security and Privacy

- [ ] No secrets committed to repository.
- [ ] RBAC enforced server-side for admin, dispatcher, and driver actions.
- [ ] Guest token endpoints expose only intended order data.
- [ ] Logs redact sensitive payment and personal fields.

## Observability and Operations

- [ ] Sentry configured for frontend and backend paths.
- [ ] Structured logs include correlation fields (`orderId`, `cartId`, `eventId`).
- [ ] Alerts defined for webhook failures, payment mismatch, and hold-expiry anomalies.
- [ ] Incident runbooks reviewed by team.

## Data and Migration Safety

- [ ] Any migration has rollback and backfill plan.
- [ ] Index coverage reviewed for production query paths.
- [ ] Capacity and coupon operations run atomically in Convex mutations.

## UX and Accessibility

- [ ] Checkout errors are actionable and recoverable.
- [ ] Mobile-first path is smooth for cart → checkout → confirmation.
- [ ] Forms have clear labels and validation messages.
- [ ] Status/tracking pages remain usable for guests.
