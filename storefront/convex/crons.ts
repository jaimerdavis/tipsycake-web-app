import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("expire slot holds", { minutes: 1 }, internal.scheduling.expireHolds);
crons.interval("abandoned cart scan", { minutes: 15 }, internal.abandonedCron.runScanAndNotify);
crons.interval("order reminders", { minutes: 15 }, internal.orderRemindersCron.runScanAndSendReminders);
crons.interval("reconcile orphan payments", { hours: 6 }, internal.payments.reconcileOrphans);

export default crons;
