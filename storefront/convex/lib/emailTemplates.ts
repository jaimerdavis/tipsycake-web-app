/**
 * Email template configuration and rendering.
 * Used by mutations to fetch custom templates from siteSettings and render with variables.
 */

import type { QueryCtx, MutationCtx } from "../_generated/server";

export const EMAIL_TEMPLATE_TYPES = [
  "orderConfirmation",
  "ownerNotification",
  "statusUpdate",
  "paymentFailed",
  "abandonedCart",
] as const;

export type EmailTemplateType = (typeof EMAIL_TEMPLATE_TYPES)[number];

export function templateSubjectKey(type: EmailTemplateType): string {
  return `emailSubject_${type}`;
}

export function templateBodyKey(type: EmailTemplateType): string {
  return `emailBody_${type}`;
}

export const DEFAULT_SUBJECTS: Record<EmailTemplateType, string> = {
  orderConfirmation: "{{storeName}} Order {{orderNumber}} Confirmed",
  ownerNotification: "New Order {{orderNumber}}",
  statusUpdate: "{{storeName}} Order {{orderNumber}} — {{statusLabel}}",
  paymentFailed: "{{storeName}} — Payment could not be processed",
  abandonedCart: "You left something sweet in your cart",
};

export const DEFAULT_BODIES: Record<EmailTemplateType, string> = {
  orderConfirmation: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>Order Confirmed!</h2>
  <p>Thank you for your order — we're so excited to bake for you!</p>
  {{orderDetails}}
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 8px 0; font-weight: bold;">Order #</td><td>{{orderNumber}}</td></tr>
    <tr><td style="padding: 8px 0; font-weight: bold;">Fulfillment</td><td>{{fulfillmentMode}}</td></tr>
    <tr><td style="padding: 8px 0; font-weight: bold;">Scheduled</td><td>{{scheduledSlot}}</td></tr>
    <tr><td style="padding: 8px 0; font-weight: bold;">Total</td><td>{{total}}</td></tr>
  </table>
  {{statusLink}}
  <p style="margin-top: 16px; color: #666;">We'll keep you updated on your order status.</p>
  {{signature}}
</div>`,
  ownerNotification: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>New Order Received</h2>
  <p>Order <strong>{{orderNumber}}</strong> has been placed and paid.</p>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 8px 0; font-weight: bold;">Order #</td><td>{{orderNumber}}</td></tr>
    <tr><td style="padding: 8px 0; font-weight: bold;">Fulfillment</td><td>{{fulfillmentMode}}</td></tr>
    <tr><td style="padding: 8px 0; font-weight: bold;">Scheduled</td><td>{{scheduledSlot}}</td></tr>
    <tr><td style="padding: 8px 0; font-weight: bold;">Total</td><td>{{total}}</td></tr>
    {{deliveryAddress}}
    {{contactInfo}}
  </table>
  <p style="margin-top: 24px;"><a href="{{adminLink}}" style="color: #e11d48; font-weight: bold;">View in Admin</a></p>
</div>`,
  statusUpdate: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>Your order update</h2>
  <p>Hi there! Quick update on your order <strong>#{{orderNumber}}</strong>:</p>
  <p style="font-size: 16px; margin: 16px 0;"><strong>{{statusLabel}}</strong> — {{statusMessage}}</p>
  <table style="width: 100%; border-collapse: collapse;">
    {{trackingRow}}
  </table>
  <p style="margin-top: 16px; color: #666;">Thanks for choosing {{storeName}} — we hope you love your cake!</p>
  {{signature}}
</div>`,
  paymentFailed: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>Payment Issue</h2>
  <p>We encountered an issue processing your payment.</p>
  {{reason}}
  <p style="margin-top: 24px;">Your cart is still saved. You can try again when you're ready to complete your order.</p>
  <p style="margin-top: 16px; color: #666;">Questions? Reply to this email or contact us.</p>
</div>`,
  abandonedCart: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>You left something sweet behind!</h2>
  <p>Your cart is still waiting for you. Here's what you had:</p>
  {{productDetails}}
  {{couponBlock}}
  <a href="{{cartLink}}" style="display: inline-block; padding: 12px 24px; background: #e11d48; color: white; text-decoration: none; border-radius: 6px; margin-top: 16px;">
    Complete Your Order
  </a>
  {{signature}}
</div>`,
};

export const PLACEHOLDER_DOCS: Record<EmailTemplateType, string[]> = {
  orderConfirmation: ["{{storeName}}", "{{orderNumber}}", "{{fulfillmentMode}}", "{{scheduledSlot}}", "{{total}}", "{{statusLink}}", "{{orderDetails}}", "{{signature}}"],
  ownerNotification: ["{{storeName}}", "{{orderNumber}}", "{{fulfillmentMode}}", "{{scheduledSlot}}", "{{total}}", "{{deliveryAddress}}", "{{contactInfo}}", "{{adminLink}}", "{{orderDetails}}", "{{savingsNote}}"],
  statusUpdate: ["{{storeName}}", "{{orderNumber}}", "{{statusLabel}}", "{{statusMessage}}", "{{trackingRow}}", "{{signature}}"],
  paymentFailed: ["{{storeName}}", "{{reason}}", "{{signature}}"],
  abandonedCart: ["{{storeName}}", "{{cartLink}}", "{{productDetails}}", "{{couponBlock}}", "{{signature}}"],
};

/** Signature for all customer-facing emails. */
export const DEBBIE_SIGNATURE = `<p style="margin-top: 24px;">Debbie,<br>Thanks<br>954-637-7608</p>`;

export function renderTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

export async function getTemplateContent(
  ctx: QueryCtx | MutationCtx,
  type: EmailTemplateType,
  field: "subject" | "body"
): Promise<string> {
  const key = field === "subject" ? templateSubjectKey(type) : templateBodyKey(type);
  const row = await ctx.db
    .query("siteSettings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  const custom = row?.value?.trim();
  const defaults = field === "subject" ? DEFAULT_SUBJECTS : DEFAULT_BODIES;
  return custom || defaults[type];
}

export async function getSettingsMap(ctx: QueryCtx | MutationCtx): Promise<Record<string, string>> {
  const rows = await ctx.db.query("siteSettings").collect();
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return map;
}

/** Build statusLink HTML for order confirmation. */
export function buildStatusLinkHtml(siteUrl: string, guestToken?: string | null): string {
  if (!guestToken) return "";
  return `<p style="margin-top: 16px;"><a href="${siteUrl}/orders/${guestToken}" style="color: #e11d48; font-weight: bold;">Track your order status</a></p>`;
}

/** Build order items list (cake + variant + addons) for owner/customer emails. */
export function buildOrderItemsHtml(
  items: {
    productSnapshot?: { name?: string };
    variantSnapshot?: { label?: string };
    modifiersSnapshot?: { groupName?: string; optionName?: string }[];
    qty: number;
    unitPriceCents: number;
  }[]
): string {
  if (items.length === 0) return "";
  const rows = items
    .map((item) => {
      const name = item.productSnapshot?.name ?? "Cake";
      const variant = item.variantSnapshot?.label;
      const base = variant ? `${name} (${variant})` : name;
      const addons = (item.modifiersSnapshot ?? []).map((m) => m.optionName ?? "").filter(Boolean);
      const fullLine = addons.length > 0 ? `${base} + ${addons.join(", ")}` : base;
      const lineTotal = ((item.unitPriceCents * item.qty) / 100).toFixed(2);
      return `<tr><td style="padding: 6px 0;">${fullLine} × ${item.qty}</td><td style="text-align: right;">$${lineTotal}</td></tr>`;
    })
    .join("");
  return `<p style="font-weight: bold; margin-bottom: 8px;">What they ordered:</p>
<table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">${rows}</table>`;
}

/** Build friendly savings note for owner notification (coupon/loyalty applied). */
export function buildSavingsNoteHtml(
  pricingSnapshot: { discountCents: number },
  appliedCouponCode?: string | null,
  loyaltyPointsRedeemed?: number
): string {
  const discount = pricingSnapshot.discountCents ?? 0;
  if (discount <= 0 && !appliedCouponCode && !loyaltyPointsRedeemed) return "";
  const parts: string[] = [];
  if (appliedCouponCode) parts.push(`Coupon <strong>${appliedCouponCode}</strong> applied`);
  if (loyaltyPointsRedeemed) parts.push("Loyalty points redeemed");
  if (discount > 0) parts.push(`— $${(discount / 100).toFixed(2)} off`);
  return `<p style="margin: 12px 0; padding: 10px; background: #f0fdf4; border-radius: 6px; color: #166534;">Sweet deal! ${parts.join(" ")}.</p>`;
}

/** Build contact info rows for owner notification. */
export function buildContactInfoHtml(contactEmail?: string | null, contactPhone?: string | null): string {
  const parts: string[] = [];
  if (contactEmail) parts.push(`<tr><td style="padding: 8px 0; font-weight: bold;">Customer Email</td><td>${contactEmail}</td></tr>`);
  if (contactPhone) parts.push(`<tr><td style="padding: 8px 0; font-weight: bold;">Customer Phone</td><td>${contactPhone}</td></tr>`);
  return parts.join("");
}

/** Build tracking row for status update. */
export function buildTrackingRowHtml(carrier?: string, trackingNumber?: string, trackingUrl?: string | null): string {
  if (!carrier || !trackingNumber) return "";
  const link = trackingUrl
    ? `<a href="${trackingUrl}" style="color: #e11d48;">${carrier}: ${trackingNumber}</a>`
    : `${carrier}: ${trackingNumber}`;
  return `<tr><td style="padding: 8px 0; font-weight: bold;">Tracking</td><td>${link}</td></tr>`;
}

/** Build reason paragraph for payment failed. */
export function buildReasonHtml(reason?: string): string {
  if (!reason) return "";
  return `<p style="color: #666;">${reason}</p>`;
}

export async function renderOrderConfirmation(
  ctx: QueryCtx | MutationCtx,
  opts: {
    storeName: string;
    siteUrl: string;
    orderNumber: string;
    fulfillmentMode: string;
    scheduledSlotKey?: string | null;
    totalCents: number;
    guestToken?: string | null;
    items?: {
      productSnapshot?: { name?: string };
      variantSnapshot?: { label?: string };
      modifiersSnapshot?: { groupName?: string; optionName?: string }[];
      qty: number;
      unitPriceCents: number;
    }[];
  }
): Promise<{ subject: string; html: string }> {
  const slot = opts.scheduledSlotKey
    ? (() => {
        const [date, time] = opts.scheduledSlotKey!.split("|");
        return `${date} at ${time}`;
      })()
    : "TBD";
  const vars: Record<string, string> = {
    storeName: opts.storeName,
    orderNumber: opts.orderNumber,
    fulfillmentMode: opts.fulfillmentMode,
    scheduledSlot: slot,
    total: `$${(opts.totalCents / 100).toFixed(2)}`,
    statusLink: buildStatusLinkHtml(opts.siteUrl, opts.guestToken),
    orderDetails: opts.items?.length ? buildOrderItemsHtml(opts.items) : "",
    signature: DEBBIE_SIGNATURE,
  };
  const subject = renderTemplate(await getTemplateContent(ctx, "orderConfirmation", "subject"), vars);
  const html = renderTemplate(await getTemplateContent(ctx, "orderConfirmation", "body"), vars);
  return { subject, html };
}

export async function renderOwnerNotification(
  ctx: QueryCtx | MutationCtx,
  opts: {
    storeName: string;
    siteUrl: string;
    orderNumber: string;
    fulfillmentMode: string;
    scheduledSlotKey?: string | null;
    totalCents: number;
    deliveryAddress?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    items?: {
      productSnapshot?: { name?: string };
      variantSnapshot?: { label?: string };
      modifiersSnapshot?: { groupName?: string; optionName?: string }[];
      qty: number;
      unitPriceCents: number;
    }[];
    pricingSnapshot?: { discountCents: number };
    appliedCouponCode?: string | null;
    loyaltyPointsRedeemed?: number;
  }
): Promise<{ subject: string; html: string }> {
  const slot = opts.scheduledSlotKey
    ? (() => {
        const [date, time] = opts.scheduledSlotKey!.split("|");
        return `${date} at ${time}`;
      })()
    : "TBD";
  const deliveryAddressRow =
    opts.deliveryAddress?.trim()
      ? `<tr><td style="padding: 8px 0; font-weight: bold;">Delivery address</td><td>${opts.deliveryAddress}</td></tr>`
      : "";
  const vars: Record<string, string> = {
    storeName: opts.storeName,
    orderNumber: opts.orderNumber,
    fulfillmentMode: opts.fulfillmentMode,
    scheduledSlot: slot,
    total: `$${(opts.totalCents / 100).toFixed(2)}`,
    deliveryAddress: deliveryAddressRow,
    contactInfo: buildContactInfoHtml(opts.contactEmail, opts.contactPhone),
    adminLink: `${opts.siteUrl}/admin/orders`,
    orderDetails: opts.items?.length ? buildOrderItemsHtml(opts.items) : "",
    savingsNote:
      opts.pricingSnapshot != null
        ? buildSavingsNoteHtml(
            opts.pricingSnapshot,
            opts.appliedCouponCode,
            opts.loyaltyPointsRedeemed
          )
        : "",
  };
  const subject = renderTemplate(await getTemplateContent(ctx, "ownerNotification", "subject"), vars);
  const html = renderTemplate(await getTemplateContent(ctx, "ownerNotification", "body"), vars);
  return { subject, html };
}

function buildCarrierTrackingUrl(carrier: string, trackingNumber: string): string | null {
  const c = carrier.toLowerCase();
  if (c === "ups") return `https://www.ups.com/track?tracknum=${encodeURIComponent(trackingNumber)}`;
  if (c === "fedex") return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(trackingNumber)}`;
  if (c === "usps") return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(trackingNumber)}`;
  return null;
}

const STATUS_LABELS: Record<string, string> = {
  paid_confirmed: "Order Received",
  order_accepted: "Order Accepted",
  in_production: "Cake Planning and Prep",
  ready_for_pickup: "Cake Ready for Pickup",
  ready_for_delivery: "Ready for Delivery",
  out_for_delivery: "On Its Way",
  delivered: "Cake Delivered",
  shipped: "Cake Shipped",
  completed: "Order Complete",
  canceled: "Order Canceled",
};

const STATUS_EMAIL_MESSAGES: Record<string, string> = {
  paid_confirmed: "We've received your order and can't wait to get started!",
  order_accepted: "Your order has been accepted and we're getting things ready.",
  in_production: "We're in the kitchen—your cake is being planned and prepped with care.",
  ready_for_pickup: "Good news! Your cake is ready for pickup.",
  ready_for_delivery: "Your cake is boxed and ready. We're assigning a driver now.",
  out_for_delivery: "Your cake is on its way! Our driver is headed to you.",
  delivered: "Your cake has been delivered. Enjoy every bite!",
  shipped: "Your cake has shipped. Track it below!",
  completed: "Thanks for picking up your order. We hope you love it!",
  canceled: "Your order has been cancelled. If this is in error, please contact us.",
};

export async function renderStatusUpdate(
  ctx: QueryCtx | MutationCtx,
  opts: {
    storeName: string;
    orderNumber: string;
    status: string;
    carrier?: string;
    trackingNumber?: string;
  }
): Promise<{ subject: string; html: string }> {
  const label = STATUS_LABELS[opts.status] ?? opts.status;
  const trackingUrl =
    opts.carrier && opts.trackingNumber
      ? buildCarrierTrackingUrl(opts.carrier, opts.trackingNumber)
      : null;
  const trackingRow = buildTrackingRowHtml(
    opts.carrier,
    opts.trackingNumber,
    trackingUrl
  );
  const statusMessage =
    STATUS_EMAIL_MESSAGES[opts.status] ??
    `Your order status has been updated.`;
  const vars: Record<string, string> = {
    storeName: opts.storeName,
    orderNumber: opts.orderNumber,
    statusLabel: label,
    statusMessage,
    trackingRow,
    signature: DEBBIE_SIGNATURE,
  };
  const subject = renderTemplate(await getTemplateContent(ctx, "statusUpdate", "subject"), vars);
  const html = renderTemplate(await getTemplateContent(ctx, "statusUpdate", "body"), vars);
  return { subject, html };
}

export async function renderPaymentFailed(
  ctx: QueryCtx | MutationCtx,
  opts: { storeName: string; reason?: string }
): Promise<{ subject: string; html: string }> {
  const vars: Record<string, string> = {
    storeName: opts.storeName,
    reason: buildReasonHtml(opts.reason),
  };
  const subject = renderTemplate(await getTemplateContent(ctx, "paymentFailed", "subject"), vars);
  const html = renderTemplate(await getTemplateContent(ctx, "paymentFailed", "body"), vars);
  return { subject, html };
}

export function buildProductDetailsHtml(
  items: { name: string; qty: number; priceCents: number }[]
): string {
  if (items.length === 0) return "";
  const rows = items
    .map(
      (i) =>
        `<tr><td style="padding: 6px 0;">${i.name} × ${i.qty}</td><td style="text-align: right;">$${(i.priceCents * i.qty / 100).toFixed(2)}</td></tr>`
    )
    .join("");
  return `<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
    ${rows}
  </table>`;
}

export function buildCouponBlockHtml(
  couponCode: string,
  couponExpiry: string,
  discountLabel: string
): string {
  if (!couponCode) return "";
  return `<div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 16px 0;">
    <p style="margin: 0 0 8px; font-weight: bold;">Use code <strong>${couponCode}</strong> for ${discountLabel} off!</p>
    <p style="margin: 0; font-size: 13px; color: #666;">Expires ${couponExpiry}</p>
  </div>`;
}

export async function renderAbandonedCart(
  ctx: QueryCtx | MutationCtx,
  opts: {
    storeName: string;
    cartLink: string;
    productDetails?: { name: string; qty: number; priceCents: number }[];
    couponCode?: string;
    couponExpiry?: string;
    couponDiscountCents?: number;
  }
): Promise<{ subject: string; html: string }> {
  const discountLabel =
    opts.couponDiscountCents != null && opts.couponDiscountCents > 0
      ? `$${(opts.couponDiscountCents / 100).toFixed(0)}`
      : "$1";
  const vars: Record<string, string> = {
    storeName: opts.storeName,
    cartLink: opts.cartLink,
    productDetails: buildProductDetailsHtml(opts.productDetails ?? []),
    couponBlock: buildCouponBlockHtml(
      opts.couponCode ?? "",
      opts.couponExpiry ?? "",
      discountLabel
    ),
    signature: DEBBIE_SIGNATURE,
  };
  const subject = renderTemplate(await getTemplateContent(ctx, "abandonedCart", "subject"), vars);
  const html = renderTemplate(await getTemplateContent(ctx, "abandonedCart", "body"), vars);
  return { subject, html };
}

/** Renders a template type with sample vars for test emails. */
export async function renderTestEmail(
  ctx: QueryCtx | MutationCtx,
  type: EmailTemplateType
): Promise<{ subject: string; html: string }> {
  const settings = await getSettingsMap(ctx);
  const storeName = settings.storeName ?? "TheTipsyCake";
  const siteUrl = settings.siteUrl ?? "https://order.tipsycake.com";
  const sample: Record<string, string> = { ...SAMPLE_VARS[type], storeName };
  if (type === "orderConfirmation") {
    sample.statusLink = buildStatusLinkHtml(siteUrl, "test-token");
    sample.orderDetails = buildOrderItemsHtml([
      {
        productSnapshot: { name: "Chocolate Baileys Cake" },
        variantSnapshot: { label: "Standard" },
        modifiersSnapshot: [{ optionName: "Extra frosting" }],
        qty: 1,
        unitPriceCents: 4800,
      },
    ]);
    sample.signature = DEBBIE_SIGNATURE;
  }
  if (type === "ownerNotification") {
    sample.contactInfo = buildContactInfoHtml("customer@example.com", "(555) 123-4567");
    sample.adminLink = `${siteUrl}/admin/orders`;
    sample.orderDetails = buildOrderItemsHtml([
      {
        productSnapshot: { name: "Chocolate Baileys Cake" },
        variantSnapshot: { label: "Standard" },
        modifiersSnapshot: [{ optionName: "Extra frosting" }],
        qty: 1,
        unitPriceCents: 4800,
      },
    ]);
    sample.savingsNote = buildSavingsNoteHtml(
      { discountCents: 500 },
      "SAVE10",
      undefined
    );
  }
  if (type === "statusUpdate") {
    sample.statusMessage = "Your cake is on its way! Our driver is headed to you.";
    sample.signature = DEBBIE_SIGNATURE;
  }
  if (type === "paymentFailed") {
    sample.signature = DEBBIE_SIGNATURE;
  }
  if (type === "abandonedCart") {
    sample.cartLink = `${siteUrl}/cart`;
    sample.productDetails = buildProductDetailsHtml([
      { name: "Chocolate Baileys Cake", qty: 1, priceCents: 4500 },
      { name: "Vanilla Rum Cake", qty: 2, priceCents: 4200 },
    ]);
    sample.couponBlock = buildCouponBlockHtml("ABANDONED-XY12AB", "Mar 6, 3:00 PM", "$1");
    sample.signature = DEBBIE_SIGNATURE;
  }
  const subjectTpl = await getTemplateContent(ctx, type, "subject");
  const bodyTpl = await getTemplateContent(ctx, type, "body");
  const subject = renderTemplate(subjectTpl, sample);
  const html = renderTemplate(bodyTpl, sample);
  return { subject, html };
}

/** Sample variables for test email preview. */
export const SAMPLE_VARS: Record<EmailTemplateType, Record<string, string>> = {
  orderConfirmation: {
    storeName: "TheTipsyCake",
    orderNumber: "ORD-00123",
    fulfillmentMode: "Pickup",
    scheduledSlot: "2025-03-15 at 14:00",
    total: "$45.00",
    statusLink: '<p style="margin-top: 16px;"><a href="https://order.tipsycake.com/orders/abc123" style="color: #e11d48; font-weight: bold;">Track your order status</a></p>',
  },
  ownerNotification: {
    storeName: "TheTipsyCake",
    orderNumber: "ORD-00123",
    fulfillmentMode: "Delivery",
    scheduledSlot: "2025-03-15 at 14:00",
    total: "$52.50",
    deliveryAddress: "<tr><td style=\"padding: 8px 0; font-weight: bold;\">Delivery address</td><td>123 Main St, Fort Lauderdale, FL 33301</td></tr>",
    contactInfo: "<tr><td style=\"padding: 8px 0; font-weight: bold;\">Customer Email</td><td>customer@example.com</td></tr><tr><td style=\"padding: 8px 0; font-weight: bold;\">Customer Phone</td><td>(555) 123-4567</td></tr>",
    adminLink: "https://order.tipsycake.com/admin/orders",
    orderDetails: "",
    savingsNote: "",
  },
  statusUpdate: {
    storeName: "TheTipsyCake",
    orderNumber: "ORD-00123",
    statusLabel: "Out for Delivery",
    trackingRow: "",
  },
  paymentFailed: {
    storeName: "TheTipsyCake",
    reason: "",
  },
  abandonedCart: {
    storeName: "TheTipsyCake",
    cartLink: "https://order.tipsycake.com/cart",
  },
};
