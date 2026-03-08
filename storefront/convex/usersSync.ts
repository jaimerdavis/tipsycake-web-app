"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";

/** Extract Clerk user ID from tokenIdentifier. Supports issuer|user_id, issuer#user_id, or user_xxx. */
function extractClerkUserId(tokenIdentifier: string): string {
  if (tokenIdentifier.includes("|")) {
    return tokenIdentifier.split("|").pop() ?? tokenIdentifier;
  }
  if (tokenIdentifier.includes("#")) {
    return tokenIdentifier.split("#").pop() ?? tokenIdentifier;
  }
  if (tokenIdentifier.startsWith("user_")) {
    return tokenIdentifier;
  }
  return tokenIdentifier;
}

/** Parse email from Clerk API user response. Handles snake_case and camelCase. */
function parseEmailFromClerkResponse(data: Record<string, unknown>): string | null {
  const primary = (data.primary_email_address ?? data.primaryEmailAddress) as { email_address?: string; emailAddress?: string } | undefined;
  const primaryEmail = primary?.email_address ?? primary?.emailAddress;
  if (primaryEmail?.trim()) return primaryEmail.trim().toLowerCase();

  const primaryId = (data.primary_email_address_id ?? data.primaryEmailAddressId) as string | undefined;
  const addrs = (data.email_addresses ?? data.emailAddresses) as Array<{ id: string; email_address?: string; emailAddress?: string }> | undefined;
  if (primaryId && addrs) {
    const match = addrs.find((e) => e.id === primaryId);
    const email = match?.email_address ?? match?.emailAddress;
    if (email?.trim()) return email.trim().toLowerCase();
  }
  const first = addrs?.[0];
  const firstEmail = first?.email_address ?? first?.emailAddress;
  if (firstEmail?.trim()) return firstEmail.trim().toLowerCase();
  return null;
}

/**
 * Sync Convex user email from Clerk's Backend API.
 * Use when JWT doesn't include email — fetches it from Clerk and updates the user.
 * No Clerk Dashboard JWT template changes required.
 */
export const syncUserEmailFromClerk = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;

    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) return;

    const tokenIdentifier = identity.tokenIdentifier;
    const clerkUserId = extractClerkUserId(tokenIdentifier);

    const res = await fetch(`https://api.clerk.com/v1/users/${clerkUserId}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!res.ok) return;

    const data = (await res.json()) as {
      primary_email_address_id?: string;
      primary_email_address?: { email_address?: string };
      email_addresses?: Array<{ id: string; email_address?: string }>;
    };

    const email = parseEmailFromClerkResponse(data);
    if (!email) return;

    await ctx.runMutation(internal.users.updateEmailByToken, {
      tokenIdentifier,
      email,
    });
  },
});

/**
 * Debug: run sync logic without mutating. Returns diagnostic info for order-account linking.
 * Use to verify CLERK_SECRET_KEY, Clerk API, and email extraction.
 */
export const debugSyncResult = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { error: "Not authenticated" };
    }

    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      return {
        clerkUserId: null,
        apiStatus: null,
        apiStatusText: null,
        emailFromResponse: null,
        userUpdated: false,
        error: "CLERK_SECRET_KEY not set in Convex env",
      };
    }

    const tokenIdentifier = identity.tokenIdentifier;
    const clerkUserId = extractClerkUserId(tokenIdentifier);

    const res = await fetch(`https://api.clerk.com/v1/users/${clerkUserId}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });

    const apiStatus = res.status;
    const apiStatusText = res.statusText;

    if (!res.ok) {
      const body = await res.text();
      return {
        clerkUserId,
        apiStatus,
        apiStatusText,
        emailFromResponse: null,
        userUpdated: false,
        error: `Clerk API ${apiStatus}: ${body.slice(0, 200)}`,
      };
    }

    const data = (await res.json()) as {
      primary_email_address_id?: string;
      primary_email_address?: { email_address?: string };
      email_addresses?: Array<{ id: string; email_address?: string }>;
    };

    const emailFromResponse = parseEmailFromClerkResponse(data);

    return {
      clerkUserId,
      apiStatus,
      apiStatusText,
      emailFromResponse,
      userUpdated: false,
      error: null,
    };
  },
});
