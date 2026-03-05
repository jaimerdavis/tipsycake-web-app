"use node";

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";

async function sendViaResend(params: {
  to: string;
  subject: string;
  html: string;
  from?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log("[notifications] RESEND_API_KEY not set, logging email:", {
      to: params.to,
      subject: params.subject,
    });
    return { id: "dev-noop", status: "logged" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: params.from ?? process.env.EMAIL_FROM ?? "TipsyCake <orders@tipsycake.com>",
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });

  const data = (await res.json()) as { id?: string; message?: string };
  if (!res.ok) {
    console.error("[notifications] Resend error:", data);
    throw new Error(data.message ?? "Email send failed");
  }
  return { id: data.id, status: "sent" };
}

async function sendViaTwilio(params: { to: string; body: string }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.log("[notifications] Twilio not configured, logging SMS:", {
      to: params.to,
      body: params.body.slice(0, 60),
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
      To: params.to,
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
  handler: async (_ctx, args) => {
    const result = await sendViaResend({
      to: args.to,
      subject: args.subject,
      html: args.body,
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
  },
  handler: async (_ctx, args) => {
    const result = await sendViaTwilio({ to: args.to, body: args.body });
    return {
      ...result,
      channel: "sms",
      to: args.to,
      bodyPreview: args.body.slice(0, 32),
    };
  },
});

export const sendOrderConfirmation = internalAction({
  args: {
    email: v.string(),
    orderNumber: v.string(),
    fulfillmentMode: v.string(),
    totalCents: v.number(),
    scheduledSlotKey: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const slotInfo = args.scheduledSlotKey
      ? (() => {
          const [date, time] = args.scheduledSlotKey.split("|");
          return `${date} at ${time}`;
        })()
      : "TBD";

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
        <p style="margin-top: 24px; color: #666;">We'll keep you updated on your order status.</p>
      </div>
    `.trim();

    return await sendViaResend({
      to: args.email,
      subject: `TipsyCake Order ${args.orderNumber} Confirmed`,
      html,
    });
  },
});

export const sendOrderStatusUpdate = internalAction({
  args: {
    email: v.string(),
    orderNumber: v.string(),
    status: v.string(),
    carrier: v.optional(v.string()),
    trackingNumber: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const statusLabels: Record<string, string> = {
      in_production: "Being Prepared",
      ready_for_pickup: "Ready for Pickup",
      out_for_delivery: "Out for Delivery",
      delivered: "Delivered",
      shipped: "Shipped",
      completed: "Completed",
      canceled: "Canceled",
    };

    const label = statusLabels[args.status] ?? args.status;

    const trackingHtml =
      args.carrier && args.trackingNumber
        ? `<tr><td style="padding: 8px 0; font-weight: bold;">Tracking</td><td>${args.carrier}: ${args.trackingNumber}</td></tr>`
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

    return await sendViaResend({
      to: args.email,
      subject: `TipsyCake Order ${args.orderNumber} — ${label}`,
      html,
    });
  },
});

export const sendAbandonedCartReminder = action({
  args: {
    email: v.string(),
    cartUrl: v.string(),
  },
  handler: async (_ctx, args) => {
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>You left something sweet behind!</h2>
        <p>Your cart is still waiting for you.</p>
        <a href="${args.cartUrl}" style="display: inline-block; padding: 12px 24px; background: #e11d48; color: white; text-decoration: none; border-radius: 6px; margin-top: 16px;">
          Complete Your Order
        </a>
      </div>
    `.trim();

    return await sendViaResend({
      to: args.email,
      subject: "You left something sweet in your cart",
      html,
    });
  },
});
