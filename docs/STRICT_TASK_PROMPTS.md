# Strict Task Prompt Templates

Use these templates to keep AI execution controlled.

## Single-Task Strict Prompt

```text
Implement only TASK-<ID> from SPEC.md.

Rules:
- No invented features.
- Restate requirement IDs before coding.
- List files before coding.
- Keep business logic in Convex.
- Use shadcn/ui primitives only for UI.
- Add/update tests required by SPEC section 15 for this task.

Output required:
1) Requirement IDs implemented
2) Files changed
3) Tests run and results
4) Migration steps (if any)
5) Risks and rollback note

Stop after TASK-<ID> and wait for my approval.
```

## Risky Domain Prompt (Payments/Scheduling/Pricing)

```text
Implement only TASK-<ID> in risky domain.

Additional gates:
- Show idempotency strategy.
- Show concurrency strategy.
- Show timezone assumptions and DST handling (if scheduling/time logic).
- Show reconciliation and failure-path behavior.

Must include:
- replay test (webhooks or equivalent)
- concurrency test (holds/coupons/capacity as applicable)

Stop after this task and wait for approval.
```
