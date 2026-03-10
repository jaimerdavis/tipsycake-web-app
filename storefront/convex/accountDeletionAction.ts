"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";

export const deleteMyAccount = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.runQuery(internal.accountDeletion.getUserForDeletion, {
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!user) throw new Error("User not found");

    await ctx.runMutation(internal.accountDeletion.deleteUserData, {
      userId: user._id,
      tokenIdentifier: identity.tokenIdentifier,
    });

    const clerkSecret = process.env.CLERK_SECRET_KEY;
    if (clerkSecret) {
      const clerkUserId =
        identity.tokenIdentifier.includes("|")
          ? identity.tokenIdentifier.split("|").pop()
          : identity.tokenIdentifier.includes("#")
            ? identity.tokenIdentifier.split("#").pop()
            : identity.tokenIdentifier;
      if (clerkUserId) {
        const res = await fetch(`https://api.clerk.com/v1/users/${clerkUserId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${clerkSecret}`,
          },
        });
        if (!res.ok) {
          const err = (await res.json()) as { errors?: Array<{ message?: string }> };
          throw new Error(
            err.errors?.[0]?.message ?? `Clerk delete failed: ${res.status}`
          );
        }
      }
    }

    return { success: true };
  },
});
