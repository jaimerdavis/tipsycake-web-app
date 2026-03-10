import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const runScanAndSendReminders = internalAction({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation(internal.orderReminders.scanAndSendReminders, {});
  },
});
