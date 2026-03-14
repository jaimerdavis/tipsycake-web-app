/**
 * Email template configuration and rendering.
 * Used by mutations to fetch custom templates from siteSettings and render with variables.
 */

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export const EMAIL_TEMPLATE_TYPES = [
  "orderConfirmation",
  "ownerNotification",
  "statusUpdate",
  "paymentFailed",
  "abandonedCart",
  "ownerOrderComplete",
  "ownerOrderReminder",
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
  ownerOrderComplete: "Order {{orderNumber}} — {{statusLabel}}",
  ownerOrderReminder: "Reminder: Order {{orderNumber}} — no update in {{hoursStale}}hr",
};

export const DEFAULT_BODIES: Record<EmailTemplateType, string> = {
  orderConfirmation: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #374151; line-height: 1.5;">
  <h2 style="color: #111827; margin-bottom: 8px;">Order confirmed!</h2>
  <p style="margin: 0 0 24px;">Thank you for your order — we're so excited to bake for you!</p>

  {{scheduleBlock}}

  {{orderDetails}}

  <div style="margin: 24px 0; padding: 16px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
    <p style="margin: 0 0 4px; font-weight: 600; font-size: 14px; color: #64748b;">Order #{{orderNumber}}</p>
    <p style="margin: 0; font-size: 15px;">{{fulfillmentMode}} · {{scheduledSlot}}</p>
  </div>

  {{addressSection}}

  <div style="margin: 20px 0;">{{pricingBreakdown}}</div>

  {{statusLink}}
  <p style="margin-top: 20px; font-size: 14px; color: #6b7280;">We'll keep you updated on your order status.</p>
  {{signature}}
</div>`,
  ownerNotification: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #374151; line-height: 1.5;">
  <h2 style="color: #111827; margin-bottom: 4px;">New order #{{orderNumber}}</h2>
  <p style="margin: 0 0 20px; font-size: 14px; color: #6b7280;">Paid · {{fulfillmentMode}} · {{scheduledSlot}}</p>

  {{scheduleBlock}}

  {{orderDetails}}

  {{addressSection}}

  {{contactInfo}}

  {{savingsNote}}

  <div style="margin: 20px 0;">{{pricingBreakdown}}</div>

  <p style="margin-top: 24px;"><a href="{{adminLink}}" style="display: inline-block; padding: 10px 20px; background: #e11d48; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">View in Admin</a></p>
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
  ownerOrderComplete: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #374151; line-height: 1.5;">
  <h2 style="color: #111827; margin-bottom: 4px;">Order #{{orderNumber}} — {{statusLabel}}</h2>
  <p style="margin: 0 0 20px; font-size: 14px; color: #16a34a; font-weight: 600;">Fulfillment complete</p>

  {{orderSummary}}

  {{addressSection}}

  {{contactInfo}}

  <table style="width: 100%; border-collapse: collapse; margin: 20px 0; padding: 12px; background: #f8fafc; border-radius: 8px;">
    <tr><td style="padding: 6px 0; font-weight: 600;">Order #</td><td>{{orderNumber}}</td></tr>
    <tr><td style="padding: 6px 0; font-weight: 600;">Status</td><td>{{statusLabel}}</td></tr>
    {{trackingRow}}
  </table>

  <p style="margin-top: 24px;"><a href="{{adminLink}}" style="display: inline-block; padding: 10px 20px; background: #e11d48; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">View in Admin</a></p>
</div>`,
  ownerOrderReminder: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>Order Reminder</h2>
  <p>Order <strong>{{orderNumber}}</strong> has had no status update for {{hoursStale}} hour(s).</p>
  <p>Current status: <strong>{{statusLabel}}</strong></p>
  <p style="margin-top: 24px;"><a href="{{adminLink}}" style="color: #e11d48; font-weight: bold;">Update status in Admin</a></p>
</div>`,
};

const FULFILLMENT_LABELS: Record<string, string> = {
  pickup: "Pickup",
  delivery: "Local Delivery",
  shipping: "Shipping",
};

export const PLACEHOLDER_DOCS: Record<EmailTemplateType, string[]> = {
  orderConfirmation: ["{{storeName}}", "{{orderNumber}}", "{{fulfillmentMode}}", "{{scheduledSlot}}", "{{scheduleBlock}}", "{{orderDetails}}", "{{addressSection}}", "{{pricingBreakdown}}", "{{total}}", "{{statusLink}}", "{{signature}}"],
  ownerNotification: ["{{storeName}}", "{{orderNumber}}", "{{fulfillmentMode}}", "{{scheduledSlot}}", "{{scheduleBlock}}", "{{orderDetails}}", "{{addressSection}}", "{{contactInfo}}", "{{savingsNote}}", "{{pricingBreakdown}}", "{{total}}", "{{adminLink}}"],
  statusUpdate: ["{{storeName}}", "{{orderNumber}}", "{{statusLabel}}", "{{statusMessage}}", "{{trackingRow}}", "{{signature}}"],
  paymentFailed: ["{{storeName}}", "{{reason}}", "{{signature}}"],
  abandonedCart: ["{{storeName}}", "{{cartLink}}", "{{productDetails}}", "{{couponBlock}}", "{{signature}}"],
  ownerOrderComplete: ["{{storeName}}", "{{orderNumber}}", "{{statusLabel}}", "{{orderSummary}}", "{{addressSection}}", "{{contactInfo}}", "{{trackingRow}}", "{{adminLink}}"],
  ownerOrderReminder: ["{{storeName}}", "{{orderNumber}}", "{{statusLabel}}", "{{hoursStale}}", "{{adminLink}}"],
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

/** Format slot key (YYYY-MM-DD|HH:mm) to human-readable, e.g. "Saturday, March 15 at 2:00 PM". */
export function formatScheduledSlotHuman(slotKey?: string | null): string {
  if (!slotKey?.trim()) return "TBD";
  const [datePart, timePart] = slotKey.split("|");
  if (!datePart || !timePart) return slotKey;
  const [y, m, d] = datePart.split("-").map(Number);
  const [h, min] = timePart.split(":").map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  const monthDay = date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const hour = h % 12 || 12;
  const ampm = h < 12 ? "AM" : "PM";
  const timeStr = `${hour}:${String(min).padStart(2, "0")} ${ampm}`;
  return `${weekday}, ${monthDay} at ${timeStr}`;
}

/** Build schedule/pickup block for order emails. Prominent display of when to pick up or be ready. */
export function buildScheduleBlockHtml(
  fulfillmentMode: "pickup" | "delivery" | "shipping",
  scheduledSlot: string
): string {
  if (!scheduledSlot || scheduledSlot === "TBD") return "";
  const labels: Record<string, string> = {
    pickup: "Pickup time",
    delivery: "Delivery window",
    shipping: "Ship by",
  };
  const label = labels[fulfillmentMode] ?? "Scheduled";
  return `<div style="margin: 16px 0; padding: 12px 16px; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0;">
  <p style="margin: 0; font-weight: 600; font-size: 15px; color: #166534;">${label}: ${scheduledSlot}</p>
</div>`;
}

/** Build address section HTML based on fulfillment mode. */
export function buildAddressSectionHtml(
  fulfillmentMode: "pickup" | "delivery" | "shipping",
  storeAddress?: string | null,
  deliveryAddress?: string | null
): string {
  if (fulfillmentMode === "pickup" && storeAddress?.trim()) {
    return `<div style="margin: 16px 0; padding: 12px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #e11d48;">
      <p style="margin: 0 0 4px; font-weight: bold; color: #374151;">Pick up at:</p>
      <p style="margin: 0; color: #4b5563;">${storeAddress}</p>
    </div>`;
  }
  if ((fulfillmentMode === "delivery" || fulfillmentMode === "shipping") && deliveryAddress?.trim()) {
    const label = fulfillmentMode === "delivery" ? "Deliver to:" : "Ship to:";
    return `<div style="margin: 16px 0; padding: 12px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #e11d48;">
      <p style="margin: 0 0 4px; font-weight: bold; color: #374151;">${label}</p>
      <p style="margin: 0; color: #4b5563;">${deliveryAddress}</p>
    </div>`;
  }
  return "";
}

/** Build pricing breakdown table (subtotal, discount, fees, tip, total). */
export function buildPricingBreakdownHtml(pricing: {
  subtotalCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  shippingFeeCents: number;
  tipCents: number;
  totalCents: number;
}): string {
  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
  const rows: string[] = [];
  rows.push(`<tr><td style="padding: 6px 0;">Subtotal</td><td style="text-align: right;">${fmt(pricing.subtotalCents)}</td></tr>`);
  if (pricing.discountCents > 0) {
    rows.push(`<tr><td style="padding: 6px 0;">Discount</td><td style="text-align: right; color: #16a34a;">-${fmt(pricing.discountCents)}</td></tr>`);
  }
  if (pricing.deliveryFeeCents > 0) {
    rows.push(`<tr><td style="padding: 6px 0;">Delivery</td><td style="text-align: right;">${fmt(pricing.deliveryFeeCents)}</td></tr>`);
  }
  if (pricing.shippingFeeCents > 0) {
    rows.push(`<tr><td style="padding: 6px 0;">Shipping</td><td style="text-align: right;">${fmt(pricing.shippingFeeCents)}</td></tr>`);
  }
  if (pricing.tipCents > 0) {
    rows.push(`<tr><td style="padding: 6px 0;">Tip</td><td style="text-align: right;">${fmt(pricing.tipCents)}</td></tr>`);
  }
  rows.push(`<tr><td style="padding: 10px 0; font-weight: bold; font-size: 16px;">Total</td><td style="text-align: right; font-weight: bold; font-size: 16px;">${fmt(pricing.totalCents)}</td></tr>`);
  return `<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">${rows.join("")}</table>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type OrderItemForEmail = {
  productSnapshot?: { name?: string };
  variantSnapshot?: { label?: string };
  modifiersSnapshot?: { groupName?: string; optionName?: string }[];
  qty: number;
  unitPriceCents: number;
  itemNote?: string | null;
};

/** Split modifiers into shape (Shape group) vs extras (others). */
function parseModifiers(modifiersSnapshot: OrderItemForEmail["modifiersSnapshot"]): {
  shape: string;
  extras: string[];
} {
  const mods = modifiersSnapshot ?? [];
  let shape = "";
  const extras: string[] = [];
  for (const m of mods) {
    const opt = m.optionName ?? "";
    if (!opt) continue;
    if (m.groupName?.toLowerCase() === "shape") {
      shape = opt;
    } else {
      extras.push(opt);
    }
  }
  return { shape, extras };
}

const TABLE_CELL =
  "padding: 10px 12px; border-bottom: 1px solid #e5e7eb; vertical-align: top; font-size: 14px;";
const TABLE_HEADER =
  "padding: 10px 12px; border-bottom: 2px solid #e5e7eb; font-weight: 600; font-size: 13px; color: #374151; text-align: left;";

/** Build order items table for customer emails. Columns: Cake | Size | Shape | Extras | Qty | Note | Price */
export function buildOrderItemsHtml(items: OrderItemForEmail[]): string {
  if (items.length === 0) return "";
  const header = `<thead><tr>
    <th style="${TABLE_HEADER}">Cake</th>
    <th style="${TABLE_HEADER}">Size</th>
    <th style="${TABLE_HEADER}">Shape</th>
    <th style="${TABLE_HEADER}">Extras</th>
    <th style="${TABLE_HEADER}">Qty</th>
    <th style="${TABLE_HEADER}">Note</th>
    <th style="${TABLE_HEADER} text-align: right;">Price</th>
  </tr></thead>`;
  const rows = items
    .map((item) => {
      const name = escapeHtml(item.productSnapshot?.name ?? "Cake");
      const size = item.variantSnapshot?.label ? escapeHtml(item.variantSnapshot.label) : "—";
      const { shape, extras } = parseModifiers(item.modifiersSnapshot);
      const shapeCell = shape ? escapeHtml(shape) : "—";
      const extrasCell = extras.length > 0 ? escapeHtml(extras.join(", ")) : "—";
      const qty = String(item.qty);
      const note = item.itemNote?.trim() ? escapeHtml(item.itemNote.trim()) : "—";
      const lineTotal = ((item.unitPriceCents * item.qty) / 100).toFixed(2);
      return `<tr>
        <td style="${TABLE_CELL}">${name}</td>
        <td style="${TABLE_CELL}">${size}</td>
        <td style="${TABLE_CELL}">${shapeCell}</td>
        <td style="${TABLE_CELL}">${extrasCell}</td>
        <td style="${TABLE_CELL}">${qty}</td>
        <td style="${TABLE_CELL}">${note}</td>
        <td style="${TABLE_CELL} text-align: right; font-weight: 600;">$${lineTotal}</td>
      </tr>`;
    })
    .join("");
  return `<div style="margin: 24px 0;">
    <p style="font-weight: bold; margin-bottom: 12px; font-size: 16px; color: #111827;">Order details</p>
    <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">${header}<tbody>${rows}</tbody></table>
  </div>`;
}

/** Build order items table for owner emails. Same layout as customer — easy to scan and fill. */
export function buildOrderItemsForOwnerHtml(items: OrderItemForEmail[]): string {
  if (items.length === 0) return "";
  const header = `<thead><tr>
    <th style="${TABLE_HEADER}">Cake</th>
    <th style="${TABLE_HEADER}">Size</th>
    <th style="${TABLE_HEADER}">Shape</th>
    <th style="${TABLE_HEADER}">Extras</th>
    <th style="${TABLE_HEADER}">Qty</th>
    <th style="${TABLE_HEADER}">Note</th>
    <th style="${TABLE_HEADER} text-align: right;">Price</th>
  </tr></thead>`;
  const rows = items
    .map((item) => {
      const name = escapeHtml(item.productSnapshot?.name ?? "Cake");
      const size = item.variantSnapshot?.label ? escapeHtml(item.variantSnapshot.label) : "—";
      const { shape, extras } = parseModifiers(item.modifiersSnapshot);
      const shapeCell = shape ? escapeHtml(shape) : "—";
      const extrasCell = extras.length > 0 ? escapeHtml(extras.join(", ")) : "—";
      const qty = String(item.qty);
      const note = item.itemNote?.trim()
        ? `<span style="background: #fef3c7; padding: 2px 6px; border-radius: 4px; color: #92400e;">${escapeHtml(item.itemNote.trim())}</span>`
        : "—";
      const lineTotal = ((item.unitPriceCents * item.qty) / 100).toFixed(2);
      return `<tr>
        <td style="${TABLE_CELL}">${name}</td>
        <td style="${TABLE_CELL}">${size}</td>
        <td style="${TABLE_CELL}">${shapeCell}</td>
        <td style="${TABLE_CELL}">${extrasCell}</td>
        <td style="${TABLE_CELL}">${qty}</td>
        <td style="${TABLE_CELL}">${note}</td>
        <td style="${TABLE_CELL} text-align: right; font-weight: 600;">$${lineTotal}</td>
      </tr>`;
    })
    .join("");
  return `<div style="margin: 20px 0;">
    <p style="font-weight: bold; margin-bottom: 12px; font-size: 16px; color: #111827;">Items to prepare</p>
    <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">${header}<tbody>${rows}</tbody></table>
  </div>`;
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

/** Build contact info block for owner notification. */
export function buildContactInfoHtml(
  contactEmail?: string | null,
  contactPhone?: string | null,
  contactName?: string | null
): string {
  const parts: string[] = [];
  if (contactName?.trim())
    parts.push(`<tr><td style="padding: 8px 0; font-weight: bold;">Name</td><td>${escapeHtml(contactName.trim())}</td></tr>`);
  if (contactEmail) parts.push(`<tr><td style="padding: 8px 0; font-weight: bold;">Email</td><td><a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a></td></tr>`);
  if (contactPhone) parts.push(`<tr><td style="padding: 8px 0; font-weight: bold;">Phone</td><td><a href="tel:${contactPhone}">${contactPhone}</a></td></tr>`);
  if (parts.length === 0) return "";
  return `<div style="margin: 16px 0;">
    <p style="font-weight: bold; margin-bottom: 8px; font-size: 15px;">Customer contact</p>
    <table style="width: 100%; border-collapse: collapse;">${parts.join("")}</table>
  </div>`;
}

/** Build optional gift block for owner notification. */
export function buildGiftOccasionHtml(cakeFor?: string | null): string {
  const hasCakeFor = cakeFor?.trim();
  if (!hasCakeFor) return "";
  return `<div style="margin: 16px 0;">
    <p style="font-weight: bold; margin-bottom: 8px; font-size: 15px;">Gift</p>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 8px 0; font-weight: bold;">Cake for</td><td>${escapeHtml(hasCakeFor)}</td></tr>
    </table>
  </div>`;
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
    fulfillmentMode: "pickup" | "delivery" | "shipping";
    scheduledSlotKey?: string | null;
    totalCents: number;
    guestToken?: string | null;
    storeAddress?: string | null;
    deliveryAddress?: string | null;
    pricingSnapshot?: {
      subtotalCents: number;
      discountCents: number;
      deliveryFeeCents: number;
      shippingFeeCents: number;
      tipCents: number;
      totalCents: number;
    };
    items?: {
      productSnapshot?: { name?: string };
      variantSnapshot?: { label?: string };
      modifiersSnapshot?: { groupName?: string; optionName?: string }[];
      qty: number;
      unitPriceCents: number;
    }[];
  }
): Promise<{ subject: string; html: string }> {
  const slot = formatScheduledSlotHuman(opts.scheduledSlotKey);
  const fulfillmentLabel = FULFILLMENT_LABELS[opts.fulfillmentMode] ?? opts.fulfillmentMode;
  const addressSection = buildAddressSectionHtml(
    opts.fulfillmentMode,
    opts.storeAddress,
    opts.deliveryAddress
  );
  const pricingBreakdown = opts.pricingSnapshot
    ? buildPricingBreakdownHtml(opts.pricingSnapshot)
    : `<p style="font-weight: bold; font-size: 16px;">Total: $${(opts.totalCents / 100).toFixed(2)}</p>`;
  const totalFormatted = `$${(opts.totalCents / 100).toFixed(2)}`;
  const scheduleBlock = buildScheduleBlockHtml(opts.fulfillmentMode, slot);
  const vars: Record<string, string> = {
    storeName: opts.storeName,
    orderNumber: opts.orderNumber,
    fulfillmentMode: fulfillmentLabel,
    scheduledSlot: slot,
    scheduleBlock,
    statusLink: buildStatusLinkHtml(opts.siteUrl, opts.guestToken),
    orderDetails: opts.items?.length ? buildOrderItemsHtml(opts.items) : "",
    addressSection,
    pricingBreakdown,
    total: totalFormatted,
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
    fulfillmentMode: "pickup" | "delivery" | "shipping";
    scheduledSlotKey?: string | null;
    totalCents: number;
    storeAddress?: string | null;
    deliveryAddress?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    contactName?: string | null;
    cakeFor?: string | null;
    occasion?: string | null;
    items?: {
      productSnapshot?: { name?: string };
      variantSnapshot?: { label?: string };
      modifiersSnapshot?: { groupName?: string; optionName?: string }[];
      qty: number;
      unitPriceCents: number;
    }[];
    pricingSnapshot?: {
      discountCents: number;
      subtotalCents: number;
      deliveryFeeCents: number;
      shippingFeeCents: number;
      tipCents: number;
      totalCents: number;
    };
    appliedCouponCode?: string | null;
    loyaltyPointsRedeemed?: number;
  }
): Promise<{ subject: string; html: string }> {
  const slot = formatScheduledSlotHuman(opts.scheduledSlotKey);
  const fulfillmentLabel = FULFILLMENT_LABELS[opts.fulfillmentMode] ?? opts.fulfillmentMode;
  const addressSection = buildAddressSectionHtml(
    opts.fulfillmentMode,
    opts.storeAddress,
    opts.deliveryAddress
  );
  const pricingBreakdown = opts.pricingSnapshot
    ? buildPricingBreakdownHtml(opts.pricingSnapshot)
    : `<p style="font-weight: bold; font-size: 16px;">Total: $${(opts.totalCents / 100).toFixed(2)}</p>`;
  const totalFormatted = `$${(opts.totalCents / 100).toFixed(2)}`;
  const scheduleBlock = buildScheduleBlockHtml(opts.fulfillmentMode, slot);
  const vars: Record<string, string> = {
    storeName: opts.storeName,
    orderNumber: opts.orderNumber,
    fulfillmentMode: fulfillmentLabel,
    scheduledSlot: slot,
    scheduleBlock,
    addressSection,
    contactInfo:
      buildContactInfoHtml(opts.contactEmail, opts.contactPhone, opts.contactName) +
      buildGiftOccasionHtml(opts.cakeFor),
    adminLink: `${opts.siteUrl}/admin/orders`,
    orderDetails: opts.items?.length ? buildOrderItemsForOwnerHtml(opts.items) : "",
    total: totalFormatted,
    savingsNote:
      opts.pricingSnapshot != null
        ? buildSavingsNoteHtml(
            opts.pricingSnapshot,
            opts.appliedCouponCode,
            opts.loyaltyPointsRedeemed
          )
        : "",
    pricingBreakdown,
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

const OWNER_COMPLETE_LABELS: Record<string, string> = {
  completed: "Order Complete (Picked Up)",
  delivered: "Cake Delivered",
  shipped: "Cake Shipped",
};

/** Renders owner order complete email (sent when order reaches completed/delivered/shipped). */
export async function renderOwnerOrderComplete(
  ctx: QueryCtx | MutationCtx,
  opts: {
    siteUrl: string;
    orderNumber: string;
    status: string;
    orderId?: Id<"orders">;
    carrier?: string;
    trackingNumber?: string;
  }
): Promise<{ subject: string; html: string }> {
  const label = OWNER_COMPLETE_LABELS[opts.status] ?? opts.status;
  const trackingUrl =
    opts.carrier && opts.trackingNumber
      ? buildCarrierTrackingUrl(opts.carrier, opts.trackingNumber)
      : null;
  const trackingRow = buildTrackingRowHtml(opts.carrier, opts.trackingNumber, trackingUrl);

  let orderSummary = "";
  let addressSection = "";
  let contactInfo = "";

  if (opts.orderId) {
    const order = await ctx.db.get(opts.orderId);
    if (order) {
      const items = await ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", opts.orderId!))
        .collect();
      orderSummary = items.length > 0 ? buildOrderItemsForOwnerHtml(items) : "";

      const settings = await getSettingsMap(ctx);
      const storeAddress = settings.storeAddress?.trim() ?? null;
      let deliveryAddress: string | null = null;
      if (
        (order.fulfillmentMode === "delivery" || order.fulfillmentMode === "shipping") &&
        order.addressId
      ) {
        const addr = await ctx.db.get(order.addressId);
        deliveryAddress = addr?.formatted ?? null;
      }
      addressSection = buildAddressSectionHtml(
        order.fulfillmentMode,
        storeAddress,
        deliveryAddress
      );
      contactInfo = buildContactInfoHtml(
        order.contactEmail,
        order.contactPhone,
        order.contactName
      );
    }
  }

  const vars: Record<string, string> = {
    storeName: "TheTipsyCake",
    orderNumber: opts.orderNumber,
    statusLabel: label,
    trackingRow,
    adminLink: `${opts.siteUrl}/admin/orders`,
    orderSummary,
    addressSection,
    contactInfo,
  };
  const settings = await getSettingsMap(ctx);
  if (settings.storeName) vars.storeName = settings.storeName;
  const subject = renderTemplate(await getTemplateContent(ctx, "ownerOrderComplete", "subject"), vars);
  const html = renderTemplate(await getTemplateContent(ctx, "ownerOrderComplete", "body"), vars);
  return { subject, html };
}

/** Renders owner order reminder email (sent when order has no status update for 1hr/2hr). */
export async function renderOwnerOrderReminder(
  ctx: QueryCtx | MutationCtx,
  opts: {
    siteUrl: string;
    orderNumber: string;
    status: string;
    hoursStale: number;
  }
): Promise<{ subject: string; html: string }> {
  const statusLabel = opts.status.replace(/_/g, " ");
  const vars: Record<string, string> = {
    storeName: "TheTipsyCake",
    orderNumber: opts.orderNumber,
    statusLabel,
    hoursStale: String(opts.hoursStale),
    adminLink: `${opts.siteUrl}/admin/orders`,
  };
  const settings = await getSettingsMap(ctx);
  if (settings.storeName) vars.storeName = settings.storeName;
  const subject = renderTemplate(await getTemplateContent(ctx, "ownerOrderReminder", "subject"), vars);
  const html = renderTemplate(await getTemplateContent(ctx, "ownerOrderReminder", "body"), vars);
  return { subject, html };
}

/** Renders a template type with sample vars for test emails. */
export async function renderTestEmail(
  ctx: QueryCtx | MutationCtx,
  type: EmailTemplateType
): Promise<{ subject: string; html: string }> {
  const settings = await getSettingsMap(ctx);
  const storeName = settings.storeName ?? "TheTipsyCake";
  const siteUrl = settings.siteUrl ?? "https://order.thetipsycake.com";
  const sample: Record<string, string> = {
    ...SAMPLE_VARS[type],
    storeName,
    scheduledSlot: formatScheduledSlotHuman("2025-03-15|14:00"),
  };
  if (type === "orderConfirmation") {
    sample.statusLink = buildStatusLinkHtml(siteUrl, "test-token");
    sample.scheduleBlock = buildScheduleBlockHtml("pickup", sample.scheduledSlot);
    sample.orderDetails = buildOrderItemsHtml([
      {
        productSnapshot: { name: "Chocolate Baileys Cake" },
        variantSnapshot: { label: "Standard" },
        modifiersSnapshot: [
          { groupName: "Shape", optionName: "Rose" },
          { groupName: "Extras", optionName: "Extra frosting" },
        ],
        qty: 1,
        unitPriceCents: 4800,
      },
    ]);
    sample.addressSection = buildAddressSectionHtml(
      "pickup",
      "8666 NW 44th St, Sunrise, FL 33351",
      null
    );
    sample.pricingBreakdown = buildPricingBreakdownHtml({
      subtotalCents: 4800,
      discountCents: 0,
      deliveryFeeCents: 0,
      shippingFeeCents: 0,
      tipCents: 500,
      totalCents: 5300,
    });
    sample.total = "$53.00";
    sample.signature = DEBBIE_SIGNATURE;
  }
  if (type === "ownerNotification") {
    sample.contactInfo = buildContactInfoHtml("customer@example.com", "(555) 123-4567", "Jane Smith");
    sample.adminLink = `${siteUrl}/admin/orders`;
    sample.scheduleBlock = buildScheduleBlockHtml("delivery", sample.scheduledSlot);
    sample.orderDetails = buildOrderItemsForOwnerHtml([
      {
        productSnapshot: { name: "Chocolate Baileys Cake" },
        variantSnapshot: { label: "Standard" },
        modifiersSnapshot: [
          { groupName: "Shape", optionName: "Rose" },
          { groupName: "Extras", optionName: "Extra frosting" },
        ],
        qty: 1,
        unitPriceCents: 4800,
      },
    ]);
    sample.addressSection = buildAddressSectionHtml(
      "delivery",
      "8666 NW 44th St, Sunrise, FL 33351",
      "123 Main St, Fort Lauderdale, FL 33301"
    );
    sample.savingsNote = buildSavingsNoteHtml(
      { discountCents: 500 },
      "SAVE10",
      undefined
    );
    sample.pricingBreakdown = buildPricingBreakdownHtml({
      subtotalCents: 4800,
      discountCents: 500,
      deliveryFeeCents: 1000,
      shippingFeeCents: 0,
      tipCents: 500,
      totalCents: 5800,
    });
    sample.total = "$58.00";
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
  if (type === "ownerOrderComplete") {
    sample.adminLink = `${siteUrl}/admin/orders`;
  }
  if (type === "ownerOrderReminder") {
    sample.adminLink = `${siteUrl}/admin/orders`;
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
    scheduledSlot: "Saturday, March 15 at 2:00 PM",
    statusLink: '<p style="margin-top: 16px;"><a href="https://order.thetipsycake.com/orders/abc123" style="color: #e11d48; font-weight: bold;">Track your order status</a></p>',
    orderDetails: "",
    addressSection: "",
    pricingBreakdown: "",
  },
  ownerNotification: {
    storeName: "TheTipsyCake",
    orderNumber: "ORD-00123",
    fulfillmentMode: "Local Delivery",
    scheduledSlot: "Saturday, March 15 at 2:00 PM",
    adminLink: "https://order.thetipsycake.com/admin/orders",
    orderDetails: "",
    addressSection: "",
    contactInfo: "",
    savingsNote: "",
    pricingBreakdown: "",
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
    cartLink: "https://order.thetipsycake.com/cart",
  },
  ownerOrderComplete: {
    storeName: "TheTipsyCake",
    orderNumber: "ORD-00123",
    statusLabel: "Cake Delivered",
    trackingRow: "",
    adminLink: "https://order.thetipsycake.com/admin/orders",
  },
  ownerOrderReminder: {
    storeName: "TheTipsyCake",
    orderNumber: "ORD-00123",
    statusLabel: "in production",
    hoursStale: "1",
    adminLink: "https://order.thetipsycake.com/admin/orders",
  },
};
