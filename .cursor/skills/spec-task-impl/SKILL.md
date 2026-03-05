---
name: spec-task-impl
description: Implement SPEC.md tasks by requirement ID. Use when asked to implement any TASK-* item, or when working on features referenced by requirement IDs (CAT, CRT, FUL, SCH, PAY, PRM, LOY, ORD, TRK, NTF, ABD, ADM).
---

# SPEC Task Implementation

Follow this workflow when implementing any TASK from SPEC.md section 16.

## Before Coding

1. Read `SPEC.md` to find the referenced requirement IDs
2. Restate the requirement IDs you are implementing
3. List the files you will create or modify
4. Identify which Convex tables (section 7) and functions (section 8) are involved
5. Check for invariant dependencies (section 6: INV-001 through INV-005)

## Implementation Order

```
TASK-ID → Requirement IDs → Data Model → Convex Functions → UI Components
```

### For each task:

1. **Schema first** — Define/update tables in `convex/schema.ts` per section 7
2. **Server functions** — Implement queries/mutations/actions per section 8 contracts
3. **UI components** — Build with shadcn/ui primitives per section 20
4. **Tests** — Write tests per section 15 requirements

## File Mapping

| Domain | Convex Files | Frontend Files |
|--------|-------------|----------------|
| Catalog (CAT) | `convex/catalog.ts` | `src/app/(storefront)/products/` |
| Cart (CRT) | `convex/cart.ts` | `src/app/(storefront)/cart/` |
| Fulfillment (FUL) | `convex/checkout.ts`, `convex/maps.ts` | `src/app/(storefront)/checkout/` |
| Scheduling (SCH) | `convex/scheduling.ts` | `src/components/scheduling/` |
| Payments (PAY) | `convex/payments.ts`, `convex/webhooks.ts`, `convex/http.ts` | `src/app/(storefront)/checkout/` |
| Coupons (PRM) | `convex/coupons.ts` | `src/components/checkout/` |
| Loyalty (LOY) | `convex/loyalty.ts` | `src/app/(storefront)/account/` |
| Orders (ORD) | `convex/orders.ts` | `src/app/(storefront)/orders/` |
| Tracking (TRK) | `convex/drivers.ts` | `src/app/driver/`, `src/app/(storefront)/orders/` |
| Admin (ADM) | `convex/admin/` | `src/app/admin/` |

## After Coding

Provide:
- Summary of what was implemented
- Which requirement IDs are now satisfied
- How to test (manual steps and/or test commands)
- Any migration steps needed
- Risks or open questions
- Explicit rollback note for safe revert

## Controlled Execution Mode

For production-risk work, implement one task at a time and stop for approval:

1. Implement only the requested `TASK-*`.
2. Do not continue to the next task automatically.
3. Wait for user approval before starting the next task.

## Checklist

- [ ] Requirement IDs restated before coding
- [ ] Files listed before coding
- [ ] Schema matches SPEC section 7 table definitions
- [ ] Function names match SPEC section 8 contracts
- [ ] Business logic is server-side (AI-DEV-003)
- [ ] State transitions logged (AI-DEV-006)
- [ ] UI uses shadcn primitives only (AI-DEV-002)
- [ ] No secrets committed (AI-DEV-007)
- [ ] Rollback note included
- [ ] Stopped and requested approval before next task
