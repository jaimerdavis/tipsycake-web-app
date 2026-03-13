import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { renderOwnerOrderReminder } from "./lib/emailTemplates";

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
    const smsEnabled = settings.smsEnabled !== "false";
    const reminderEnabled = settings.orderReminderEnabled !== "false";
    const firstHours = Math.max(0.5, Math.min(24, Number(settings.orderReminderFirstHours) || 1));
    const secondHours = Math.max(
      firstHours + 0.5,
      Math.min(72, Number(settings.orderReminderSecondHours) || 2)
    );

    if (!storeEmail || notifyOwner === false || reminderEnabled === false) return { reminded: 0 };

    const siteUrl = settings.siteUrl ?? "https://order.thetipsycake.com";
    const firstMs = firstHours * 60 * 60 * 1000;
    const secondMs = secondHours * 60 * 60 * 1000;
    const cutoffMs = firstMs;

    let reminded = 0;

    for (const status of REMINDER_STATUSES) {
      const orders = await ctx.db
        .query("orders")
        .withIndex("by_status_updatedAt", (q) =>
          q.eq("status", status).lte("updatedAt", now - cutoffMs)
        )
        .collect();

      for (const order of orders) {
        const elapsed = now - order.updatedAt;
        const lastLevel = order.lastReminderLevel ?? 0;

        if (elapsed >= secondMs && lastLevel === 1) {
          const rendered = await renderOwnerOrderReminder(ctx, {
            siteUrl,
            orderNumber: order.orderNumber,
            status: order.status,
            hoursStale: Math.round(secondHours),
          });
          await ctx.scheduler.runAfter(0, internal.notifications.sendOwnerOrderReminder, {
            email: storeEmail,
            phone: smsEnabled ? settings.storePhone?.trim() || undefined : undefined,
            orderNumber: order.orderNumber,
            orderId: order._id,
            status: order.status,
            hoursStale: Math.round(secondHours),
            subjectOverride: rendered.subject,
            htmlOverride: rendered.html,
          });
          await ctx.db.patch(order._id, { lastReminderLevel: 2 });
          reminded += 1;
        } else if (elapsed >= firstMs && lastLevel < 1) {
          const rendered = await renderOwnerOrderReminder(ctx, {
            siteUrl,
            orderNumber: order.orderNumber,
            status: order.status,
            hoursStale: Math.round(firstHours),
          });
          await ctx.scheduler.runAfter(0, internal.notifications.sendOwnerOrderReminder, {
            email: storeEmail,
            phone: smsEnabled ? settings.storePhone?.trim() || undefined : undefined,
            orderNumber: order.orderNumber,
            orderId: order._id,
            status: order.status,
            hoursStale: Math.round(firstHours),
            subjectOverride: rendered.subject,
            htmlOverride: rendered.html,
          });
          await ctx.db.patch(order._id, { lastReminderLevel: 1 });
          reminded += 1;
        }
      }
    }

    return { reminded };
  },
});
