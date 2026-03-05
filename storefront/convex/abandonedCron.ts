"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const runScanAndNotify = internalAction({
  args: {},
  handler: async (ctx) => {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    await ctx.runMutation(internal.abandoned.scanAndNotify, { siteUrl });
  },
});
