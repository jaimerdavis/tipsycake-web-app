import { AuthConfig } from "convex/server";

/**
 * Order-to-account linking and storeUser require `email` in the Clerk JWT.
 * In Clerk Dashboard → JWT Templates → Convex template, add claim:
 *   "email": "{{user.primary_email_address}}"
 */

export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
