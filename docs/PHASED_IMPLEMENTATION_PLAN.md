# Phased Implementation Plan

This plan executes `SPEC.md` in controlled phases with explicit go/no-go gates.

## Operating Rules

- Implement by requirement IDs only.
- Complete one task block at a time.
- Do not start next phase until gate criteria pass.
- For risky domains (`SCH`, `PAY`, `PRM`, `LOY`, pricing, RBAC), require explicit approval.

## Phase 1: Foundation and Safety Rails

### Scope

- `TASK-ARCH-001` Repo structure + shared types + lint/format
- `TASK-ARCH-002` Auth + RBAC scaffolding (`ADM-001`)
- `TASK-ARCH-003` Audit logs utility (`ADM-003`)

### Deliverables

- Convex schema baseline for auth and audits
- Auth helper + role guard scaffolding
- Admin role update path with audit logging
- Environment variable template and docs already present

### Gate (must pass)

- RBAC checks are server-side in Convex functions
- Audit log writes exist for sensitive admin actions
- Lint passes for edited files (or known blocked dependency generation is documented)
- Risks + rollback notes documented

## Phase 2: Catalog and Cart Core

### Scope

- `TASK-CAT-001` `CAT-001..CAT-006`
- `TASK-CAT-002` `ADM-002` product/modifier CRUD
- `TASK-CAT-003` `CAT-003` modifier validation UX
- `TASK-CRT-001` `CRT-001..CRT-006`
- `TASK-CRT-002` `CRT-004`

### Gate

- Catalog schema and CRUD stable
- Cart totals computed server-side only
- Coupon apply/remove path stubbed with validation points

## Phase 3: Fulfillment and Scheduling

### Scope

- `TASK-FUL-001`, `TASK-FUL-002`
- `TASK-SCH-001..005` (`SCH-001..SCH-012`, `INV-001`, `INV-005`)

### Gate

- Delivery/shipping eligibility deterministic
- Slot engine reason codes returned
- Concurrency test: two holds on last slot, one success

## Phase 4: Promotions and Loyalty

### Scope

- `TASK-PRM-001`, `TASK-PRM-002`
- `TASK-LOY-001..003`

### Gate

- Coupon limits enforce under concurrency
- Loyalty ledger append-only and auditable

## Phase 5: Payments and Order Finalization

### Scope

- `TASK-PAY-001`, `TASK-PAY-002`
- `TASK-ORD-001`

### Gate

- Webhook-authoritative finalization
- Replay-safe idempotency test passes
- Payment cancel/failure releases holds

## Phase 6: Tracking, Abandonment, and Ops UI

### Scope

- `TASK-TRK-001..003`
- `TASK-ABD-001..002`
- `TASK-ADM-001..004`

### Gate

- Driver and guest tracking flows function
- Abandoned cart reminders and restore flow work
- Admin operational screens cover core workflows

## Phase 7: Hardening and Launch

### Scope

- Finish all tests in `SPEC.md` section 15
- Validate docs in:
  - `docs/LAUNCH_HARDENING_CHECKLIST.md`
  - `docs/RISK_REGISTER.md`
  - `docs/RUNBOOK_INCIDENTS.md`

### Gate

- All critical invariants validated
- Observability and incident runbooks reviewed
- Launch checklist signed off
