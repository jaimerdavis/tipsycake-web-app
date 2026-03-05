/**
 * Audit log utility (ADM-003, AI-DEV-006).
 * Records changes to scheduling rules, delivery pricing, coupons, loyalty.
 */

import { MutationCtx } from "../_generated/server";

export async function writeAuditLog(
  ctx: MutationCtx,
  params: {
    actorType: "admin" | "system";
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    diff?: Record<string, unknown>;
  }
) {
  await ctx.db.insert("auditLogs", {
    ...params,
    createdAt: Date.now(),
  });
}
