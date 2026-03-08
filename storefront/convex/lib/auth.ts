/**
 * Auth helpers — get current user, require roles.
 * Used across all protected Convex functions (ADM-001).
 *
 * DEV BYPASS: When no auth provider is configured, falls back to the first
 * admin user in the database. Remove this once a real auth provider is wired up.
 */

import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc } from "../_generated/dataModel";
import { InternalRole } from "./roles";

async function getDevAdmin(ctx: QueryCtx | MutationCtx): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "admin"))
    .first();
}

export async function getCurrentUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    // DEV BYPASS: use first admin user if no auth provider configured
    const devAdmin = await getDevAdmin(ctx);
    if (devAdmin) return devAdmin;
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
