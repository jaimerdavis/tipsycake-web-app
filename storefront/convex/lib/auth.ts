/**
 * Auth helpers — get current user, require roles.
 * Used across all protected Convex functions (ADM-001).
 */

import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc } from "../_generated/dataModel";
import { InternalRole } from "./roles";

export async function getCurrentUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier)
    )
    .unique();

  if (!user) {
    throw new Error("User not found");
  }

  return user;
}

export async function getCurrentUserOrNull(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  return await ctx.db
    .query("users")
    .withIndex("by_token", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier)
    )
    .unique();
}

export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  ...roles: InternalRole[]
): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!roles.includes(user.role)) {
    throw new Error(`Requires role: ${roles.join(" or ")}`);
  }
  return user;
}
