import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const ONE_HOUR_MS = 60 * 60 * 1000;
const REMINDER_STATUSES = [
  "paid_confirmed",
  "order_accepted",
  "in_production",
  "ready_for_delivery",
] as const;

export const scanAndSendReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const settingsRows = await ctx.db.query("siteSettings").collect();
    const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
    const storeEmail = settings.storeEmail?.trim();
    const notifyOwner = settings.notifyOwnerOnOrder !== "false";

    if (!storeEmail || notifyOwner === false) return { reminded: 0 };

    const oneHourAgo = now - ONE_HOUR_MS;
    let reminded = 0;

    for (const status of REMINDER_STATUSES) {
      const orders = await ctx.db
        .query("orders")
        .withIndex("by_status_updatedAt", (q) =>
          q.eq("status", status).lte("updatedAt", oneHourAgo)
        )
        .collect();

      for (const order of orders) {
        const elapsed = now - order.updatedAt;
        const lastLevel = order.lastReminderLevel ?? 0;

        if (elapsed >= 2 * ONE_HOUR_MS && lastLevel === 1) {
          await ctx.scheduler.runAfter(0, internal.notifications.sendOwnerOrderReminder, {
            email: storeEmail,
            phone: settings.storePhone?.trim() || undefined,
            orderNumber: order.orderNumber,
            orderId: order._id,
            status: order.status,
            hoursStale: 2,
          });
          await ctx.db.patch(order._id, { lastReminderLevel: 2 });
          reminded += 1;
        } else if (elapsed >= ONE_HOUR_MS && lastLevel < 1) {
          await ctx.scheduler.runAfter(0, internal.notifications.sendOwnerOrderReminder, {
            email: storeEmail,
            phone: settings.storePhone?.trim() || undefined,
            orderNumber: order.orderNumber,
            orderId: order._id,
            status: order.status,
            hoursStale: 1,
          });
          await ctx.db.patch(order._id, { lastReminderLevel: 1 });
          reminded += 1;
        }
      }
    }

    return { reminded };
  },
});
