# Risk Register

Keep this updated as implementation progresses.

## Critical Risks

1. **Scheduling race conditions**
   - Risk: Overbooking under simultaneous checkout.
   - Mitigation: Atomic hold creation + concurrency tests.
   - Owner: Backend/Scheduling.

2. **Webhook ordering/replay**
   - Risk: Duplicate or out-of-order events create inconsistent orders.
   - Mitigation: `webhookEvents` dedupe + replay tests + reconciliation job.
   - Owner: Payments.

3. **Timezone/DST drift**
   - Risk: Wrong slot availability or cutoff behavior.
   - Mitigation: Store timezone canonicalization + DST test fixtures.
   - Owner: Scheduling.

4. **Price quote mismatch**
   - Risk: Displayed total differs from charged amount.
   - Mitigation: Server-only pricing engine + quote invalidation on address/slot changes.
   - Owner: Checkout/Pricing.

5. **RBAC exposure**
   - Risk: Unauthorized access to admin/driver actions.
   - Mitigation: Server-side role checks on all privileged mutations/actions.
   - Owner: Auth/Admin.

## Operational Risks

6. **3rd-party outage (Stripe, PayPal, Maps, SMS)**
   - Mitigation: graceful error handling, retries, fallback messaging.

7. **Silent failures**
   - Mitigation: structured logging + alerting + runbooks.

8. **Migration regressions**
   - Mitigation: staged migrations, backfills, reversible rollout.
