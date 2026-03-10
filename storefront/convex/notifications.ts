"use node";

import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_SITE_URL } from "./lib/storeConfig";
import { internal } from "./_generated/api";
import { v } from "convex/values";

import { normalizePhoneToE164 } from "./lib/phoneUtils";

async function logNotification(
  ctx: ActionCtx,
  params: {
    channel: "email" | "sms";
    to: string;
    subject?: string;
    template?: string;
    bodyPreview?: string;
    status: "sent" | "skipped" | "error";
    errorMessage?: string;
    externalId?: string;
    orderId?: Id<"orders">;
    orderNumber?: string;
  }
) {
  await ctx.runMutation(internal.admin.notificationLogs.insert, params);
}

async function sendEmailAndLog(
  ctx: ActionCtx,
  params: {
    to: string;
    subject: string;
    html: string;
    template?: string;
    orderId?: Id<"orders">;
    orderNumber?: string;
  }
) {
  try {
    const result = await sendViaPostmark({
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    await logNotification(ctx, {
      channel: "email",
      to: params.to,
      subject: params.subject,
      template: params.template,
      bodyPreview: params.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80),
      status: result.status === "logged" ? "skipped" : "sent",
      externalId: result.id !== "dev-noop" ? result.id : undefined,
      orderId: params.orderId,
      orderNumber: params.orderNumber,
    });
    return result;
  } catch (err) {
    await logNotification(ctx, {
      channel: "email",
      to: params.to,
      subject: params.subject,
      template: params.template,
      bodyPreview: params.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80),
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
      orderId: params.orderId,
      orderNumber: params.orderNumber,
    });
    throw err;
  }
}

async function sendViaPostmark(params: {
  to: string;
  subject: string;
  html: string;
  from?: string;
}) {
  const serverToken = process.env.POSTMARK_SERVER_TOKEN;
  if (!serverToken) {
    console.log("[notifications] POSTMARK_SERVER_TOKEN not set, logging email:", {
      to: params.to,
      subject: params.subject,
    });
    return { id: "dev-noop", status: "logged" };
  }

  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Postmark-Server-Token": serverToken,
    },
    body: JSON.stringify({
      From: params.from ?? process.env.EMAIL_FROM ?? "TheTipsyCake <orders@thetipsycake.com>",
      ReplyTo: process.env.EMAIL_REPLY_TO ?? "debbie@thetipsycake.com",
      To: params.to,
      Subject: params.subject,
      HtmlBody: params.html,
      MessageStream: "outbound",
    }),
  });

  const data = (await res.json()) as { MessageID?: string; Message?: string; ErrorCode?: number };
  if (!res.ok || data.ErrorCode) {
    console.error("[notifications] Postmark error:", data);
    throw new Error(data.Message ?? "Email send failed");
  }
  return { id: data.MessageID, status: "sent" };
}

async function sendViaTwilio(params: { to: string; body: string }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  const normalizedTo = normalizePhoneToE164(params.to);
  if (!normalizedTo) {
    console.error("[notifications] Invalid phone for SMS, need E.164:", params.to);
    throw new Error(`Invalid phone number for SMS: "${params.to}". Use format +1XXXXXXXXXX or 10-digit US number.`);
  }

  if (!accountSid || !authToken || !fromNumber) {
    console.log("[notifications] Twilio not configured, logging SMS:", {
      to: normalizedTo,
      body: params.body.slice(0, 80),
    });
    return { sid: "dev-noop", status: "logged" };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      To: normalizedTo,
      From: fromNumber,
      Body: params.body,
    }),
  });

  const data = (await res.json()) as { sid?: string; message?: string };
  if (!res.ok) {
    console.error("[notifications] Twilio error:", data);
    throw new Error(data.message ?? "SMS send failed");
  }
  return { sid: data.sid, status: "sent" };
}

export const sendEmail = internalAction({
  args: {
    to: v.string(),
    subject: v.string(),
    body: v.string(),
    template: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const result = await sendEmailAndLog(ctx, {
      to: args.to,
      subject: args.subject,
      html: args.body,
      template: args.template ?? "inline",
    });
    return {
      ...result,
      channel: "email",
      to: args.to,
      subject: args.subject,
      template: args.template ?? "inline",
    };
  },
});

export const sendSms = internalAction({
  args: {
    to: v.string(),
    body: v.string(),
    template: v.optional(v.string()),
    orderId: v.optional(v.id("orders")),
    orderNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const normalizedTo = normalizePhoneToE164(args.to);
    if (!normalizedTo) {
      await logNotification(ctx, {
        channel: "sms",
        to: args.to,
        template: args.template,
        bodyPreview: args.body.slice(0, 80),
        status: "error",
        errorMessage: `Invalid phone for SMS: "${args.to}". Use E.164 (e.g. +15551234567) or 10-digit US.`,
        orderId: args.orderId,
        orderNumber: args.orderNumber,
      });
      throw new Error(`Invalid phone number for SMS: "${args.to}". Use format +1XXXXXXXXXX or 10-digit US number.`);
    }
    try {
      const result = await sendViaTwilio({ to: args.to, body: args.body });
      await logNotification(ctx, {
        channel: "sms",
        to: normalizedTo,
        template: args.template,
        bodyPreview: args.body.slice(0, 80),
        status: result.status === "logged" ? "skipped" : "sent",
        externalId: result.sid !== "dev-noop" ? result.sid : undefined,
        orderId: args.orderId,
        orderNumber: args.orderNumber,
      });
      return {
        ...result,
        channel: "sms",
        to: normalizedTo,
        bodyPreview: args.body.slice(0, 80),
      };
    } catch (err) {
      await logNotification(ctx, {
        channel: "sms",
        to: normalizedTo,
        template: args.template,
        bodyPreview: args.body.slice(0, 80),
        status: "error",
        errorMessage: err instanceof Error ? err.message : String(err),
        orderId: args.orderId,
        orderNumber: args.orderNumber,
      });
      throw err;
    }
  },
});

function buildCarrierTrackingUrl(carrier: string, trackingNumber: string): string | null {
  const c = carrier.toLowerCase();
  if (c === "ups") return `https://www.ups.com/track?tracknum=${encodeURIComponent(trackingNumber)}`;
  if (c === "fedex") return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(trackingNumber)}`;
  if (c === "usps") return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(trackingNumber)}`;
  return null;
}

export const sendOrderConfirmation = internalAction({
  args: {
    email: v.string(),
    orderNumber: v.string(),
    orderId: v.optional(v.id("orders")),
    fulfillmentMode: v.string(),
    totalCents: v.number(),
    scheduledSlotKey: v.optional(v.string()),
    guestToken: v.optional(v.string()),
    subjectOverride: v.optional(v.string()),
    htmlOverride: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const orderContext = { orderId: args.orderId, orderNumber: args.orderNumber };
    if (args.subjectOverride && args.htmlOverride) {
      return await sendEmailAndLog(ctx, {
        to: args.email,
        subject: args.subjectOverride,
        html: args.htmlOverride,
        template: "orderConfirmation",
        ...orderContext,
      });
    }

    const slotInfo = args.scheduledSlotKey
      ? (() => {
          const [date, time] = args.scheduledSlotKey.split("|");
          return `${date} at ${time}`;
        })()
      : "TBD";

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_SITE_URL;
    const statusLinkHtml =
      args.guestToken
        ? `<p style="margin-top: 16px;"><a href="${siteUrl}/orders/${args.guestToken}" style="color: #e11d48; font-weight: bold;">Track your order status</a></p>`
        : "";

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Order Confirmed!</h2>
        <p>Thank you for your order.</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; font-weight: bold;">Order #</td><td>${args.orderNumber}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold;">Fulfillment</td><td>${args.fulfillmentMode}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold;">Scheduled</td><td>${slotInfo}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold;">Total</td><td>$${(args.totalCents / 100).toFixed(2)}</td></tr>
        </table>
        ${statusLinkHtml}
        <p style="margin-top: 24px; color: #666;">We'll keep you updated on your order status.</p>
      </div>
    `.trim();

    return await sendEmailAndLog(ctx, {
      to: args.email,
      subject: `TipsyCake Order ${args.orderNumber} Confirmed`,
      html,
      template: "orderConfirmation",
      ...orderContext,
    });
  },
});

/** Sent to store owner when an order reaches a completion status (completed/delivered/shipped). */
export const sendOwnerOrderComplete = internalAction({
  args: {
    email: v.string(),
    phone: v.optional(v.string()),
    orderNumber: v.string(),
    orderId: v.optional(v.id("orders")),
    status: v.string(),
    carrier: v.optional(v.string()),
    trackingNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const statusLabels: Record<string, string> = {
      completed: "Order Complete (Picked Up)",
      delivered: "Cake Delivered",
      shipped: "Cake Shipped",
    };
    const label = statusLabels[args.status] ?? args.status;

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://order.tipsycake.com";
    const trackingRow =
      args.carrier && args.trackingNumber
        ? `<tr><td style="padding: 8px 0; font-weight: bold;">Tracking</td><td>${args.carrier}: ${args.trackingNumber}</td></tr>`
        : "";

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Order Complete</h2>
        <p>Order <strong>${args.orderNumber}</strong> has reached status: <strong>${label}</strong>.</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; font-weight: bold;">Order #</td><td>${args.orderNumber}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold;">Status</td><td>${label}</td></tr>
          ${trackingRow}
        </table>
        <p style="margin-top: 24px;"><a href="${siteUrl}/admin/orders" style="color: #e11d48; font-weight: bold;">View in Admin</a></p>
      </div>
    `.trim();

    await sendEmailAndLog(ctx, {
      to: args.email,
      subject: `Order ${args.orderNumber} — ${label}`,
      html,
      template: "ownerOrderComplete",
      orderId: args.orderId,
      orderNumber: args.orderNumber,
    });

    if (args.phone) {
      await ctx.scheduler.runAfter(0, internal.notifications.sendSms, {
        to: args.phone,
        body: `TheTipsyCake: Order ${args.orderNumber} — ${label}. View: ${siteUrl}/admin/orders`,
        template: "ownerOrderComplete",
        orderId: args.orderId,
        orderNumber: args.orderNumber,
      });
    }
  },
});

/** Sent to store owner when an order has had no status change for 1hr or 2hr. */
export const sendOwnerOrderReminder = internalAction({
  args: {
    email: v.string(),
    phone: v.optional(v.string()),
    orderNumber: v.string(),
    orderId: v.optional(v.id("orders")),
    status: v.string(),
    hoursStale: v.number(),
  },
  handler: async (ctx, args) => {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://order.tipsycake.com";
    const statusLabel = args.status.replace(/_/g, " ");

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Order Reminder</h2>
        <p>Order <strong>${args.orderNumber}</strong> has had no status update for ${args.hoursStale} hour(s).</p>
        <p>Current status: <strong>${statusLabel}</strong></p>
        <p style="margin-top: 24px;"><a href="${siteUrl}/admin/orders" style="color: #e11d48; font-weight: bold;">Update status in Admin</a></p>
      </div>
    `.trim();

    await sendEmailAndLog(ctx, {
      to: args.email,
      subject: `Reminder: Order ${args.orderNumber} — no update in ${args.hoursStale}hr`,
      html,
      template: "ownerOrderReminder",
      orderId: args.orderId,
      orderNumber: args.orderNumber,
    });

    if (args.phone) {
      await ctx.scheduler.runAfter(0, internal.notifications.sendSms, {
        to: args.phone,
        body: `TheTipsyCake: Order ${args.orderNumber} — no status update in ${args.hoursStale}hr. Update: ${siteUrl}/admin/orders`,
        template: "ownerOrderReminder",
        orderId: args.orderId,
        orderNumber: args.orderNumber,
      });
    }
  },
});

/** Sent to store owner when a new order is placed. */
export const sendOrderConfirmationToOwner = internalAction({
  args: {
    email: v.string(),
    orderNumber: v.string(),
    orderId: v.optional(v.id("orders")),
    fulfillmentMode: v.string(),
    totalCents: v.number(),
    scheduledSlotKey: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    subjectOverride: v.optional(v.string()),
    htmlOverride: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const orderContext = { orderId: args.orderId, orderNumber: args.orderNumber };
    if (args.subjectOverride && args.htmlOverride) {
      return await sendEmailAndLog(ctx, {
        to: args.email,
        subject: args.subjectOverride,
        html: args.htmlOverride,
        template: "ownerNotification",
        ...orderContext,
      });
    }

    const slotInfo = args.scheduledSlotKey
      ? (() => {
          const [date, time] = args.scheduledSlotKey.split("|");
          return `${date} at ${time}`;
        })()
      : "TBD";

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_SITE_URL;

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>New Order Received</h2>
        <p>Order <strong>${args.orderNumber}</strong> has been placed and paid.</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; font-weight: bold;">Order #</td><td>${args.orderNumber}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold;">Fulfillment</td><td>${args.fulfillmentMode}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold;">Scheduled</td><td>${slotInfo}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold;">Total</td><td>$${(args.totalCents / 100).toFixed(2)}</td></tr>
          ${args.contactEmail ? `<tr><td style="padding: 8px 0; font-weight: bold;">Customer Email</td><td>${args.contactEmail}</td></tr>` : ""}
          ${args.contactPhone ? `<tr><td style="padding: 8px 0; font-weight: bold;">Customer Phone</td><td>${args.contactPhone}</td></tr>` : ""}
        </table>
        <p style="margin-top: 24px;"><a href="${siteUrl}/admin/orders" style="color: #e11d48; font-weight: bold;">View in Admin</a></p>
      </div>
    `.trim();

    return await sendEmailAndLog(ctx, {
      to: args.email,
      subject: `New Order ${args.orderNumber}`,
      html,
      template: "ownerNotification",
    });
  },
});

/** Short, friendly SMS messages for each status (under 160 chars). */
const STATUS_SMS_MESSAGES: Record<string, string> = {
  paid_confirmed: "Order #{{orderNumber}} confirmed! We're getting started. 🎂",
  order_accepted: "Order #{{orderNumber}} accepted—we're getting ready. 🎂",
  in_production: "Your cake #{{orderNumber}} is in the kitchen. Prepping it now! 🎂",
  ready_for_pickup: "Cake #{{orderNumber}} is ready for pickup! 🎂",
  ready_for_delivery: "Cake #{{orderNumber}} is boxed. Assigning driver now.",
  out_for_delivery: "Cake #{{orderNumber}} is on its way! 🚗🎂",
  delivered: "Your cake #{{orderNumber}} was delivered. Enjoy! 🎂",
  shipped: "Cake #{{orderNumber}} shipped! Track your order: {{statusLink}} 🎂",
  completed: "Thanks for picking up #{{orderNumber}}. Hope you love it! 🎂",
  canceled: "Order #{{orderNumber}} was cancelled. If this is in error, please contact us.",
};

export const sendOrderStatusUpdate = internalAction({
  args: {
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    orderNumber: v.string(),
    orderId: v.optional(v.id("orders")),
    status: v.string(),
    carrier: v.optional(v.string()),
    trackingNumber: v.optional(v.string()),
    statusLink: v.optional(v.string()),
    subjectOverride: v.optional(v.string()),
    htmlOverride: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const orderContext = { orderId: args.orderId, orderNumber: args.orderNumber };
    const statusLabels: Record<string, string> = {
      in_production: "Being Prepared",
      ready_for_pickup: "Ready for Pickup",
      out_for_delivery: "Out for Delivery",
      delivered: "Delivered",
      shipped: "Shipped",
      completed: "Completed",
      canceled: "Canceled",
      paid_confirmed: "Order Received",
      order_accepted: "Order Accepted",
      ready_for_delivery: "Ready for Delivery",
    };
    const label = statusLabels[args.status] ?? args.status;

    let emailResult: Awaited<ReturnType<typeof sendEmailAndLog>> | undefined;
    if (args.email) {
      if (args.subjectOverride && args.htmlOverride) {
        emailResult = await sendEmailAndLog(ctx, {
          to: args.email,
          subject: args.subjectOverride,
          html: args.htmlOverride,
          template: "statusUpdate",
        });
      } else {
        const trackingUrl =
          args.carrier && args.trackingNumber
            ? buildCarrierTrackingUrl(args.carrier, args.trackingNumber)
            : null;
        const trackingHtml =
          args.carrier && args.trackingNumber
            ? `<tr><td style="padding: 8px 0; font-weight: bold;">Tracking</td><td>${trackingUrl ? `<a href="${trackingUrl}" style="color: #e11d48;">${args.carrier}: ${args.trackingNumber}</a>` : `${args.carrier}: ${args.trackingNumber}`}</td></tr>`
            : "";
        const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Order Update</h2>
        <p>Your order <strong>${args.orderNumber}</strong> has a new status:</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; font-weight: bold;">Status</td><td>${label}</td></tr>
          ${trackingHtml}
        </table>
        <p style="margin-top: 24px; color: #666;">Thank you for ordering with TipsyCake!</p>
      </div>
    `.trim();
        emailResult = await sendEmailAndLog(ctx, {
          to: args.email,
          subject: `TipsyCake Order ${args.orderNumber} — ${label}`,
          html,
          template: "statusUpdate",
          ...orderContext,
        });
      }
    }

    if (args.phone) {
      const smsTemplate =
        STATUS_SMS_MESSAGES[args.status] ?? `Order #{{orderNumber}} status: {{status}}`;
      const statusLinkReplacement = args.statusLink?.trim() || "Check your email for tracking.";
      const smsBody = smsTemplate
        .replace(/\{\{orderNumber\}\}/g, args.orderNumber)
        .replace(/\{\{status\}\}/g, label)
        .replace(/\{\{statusLink\}\}/g, statusLinkReplacement);
      await ctx.runAction(internal.notifications.sendSms, {
        to: args.phone,
        body: smsBody.trim(),
        template: "statusUpdate",
        orderId: args.orderId,
        orderNumber: args.orderNumber,
      });
    }

    return emailResult;
  },
});

export const sendPaymentFailed = internalAction({
  args: {
    email: v.string(),
    reason: v.optional(v.string()),
    subjectOverride: v.optional(v.string()),
    htmlOverride: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.subjectOverride && args.htmlOverride) {
      return await sendEmailAndLog(ctx, {
        to: args.email,
        subject: args.subjectOverride,
        html: args.htmlOverride,
        template: "paymentFailed",
      });
    }
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Payment Issue</h2>
        <p>We encountered an issue processing your payment.</p>
        ${args.reason ? `<p style="color: #666;">${args.reason}</p>` : ""}
        <p style="margin-top: 24px;">Your cart is still saved. You can try again when you're ready to complete your order.</p>
        <p style="margin-top: 16px; color: #666;">Questions? Reply to this email or contact us.</p>
      </div>
    `.trim();

    return await sendEmailAndLog(ctx, {
      to: args.email,
      subject: "TipsyCake — Payment could not be processed",
      html,
      template: "paymentFailed",
    });
  },
});

export const sendAbandonedCartReminder = action({
  args: {
    email: v.string(),
    cartUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>You left something sweet behind!</h2>
        <p>Your cart is still waiting for you.</p>
        <a href="${args.cartUrl}" style="display: inline-block; padding: 12px 24px; background: #e11d48; color: white; text-decoration: none; border-radius: 6px; margin-top: 16px;">
          Complete Your Order
        </a>
      </div>
    `.trim();

    return await sendEmailAndLog(ctx, {
      to: args.email,
      subject: "You left something sweet in your cart",
      html,
      template: "abandonedCart",
    });
  },
});
