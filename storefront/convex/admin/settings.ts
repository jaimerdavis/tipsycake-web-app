import { action, mutation, query } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";
import {
  type EmailTemplateType,
  EMAIL_TEMPLATE_TYPES,
  renderTestEmail,
  templateSubjectKey,
  templateBodyKey,
  DEFAULT_SUBJECTS,
  DEFAULT_BODIES,
  PLACEHOLDER_DOCS,
} from "../lib/emailTemplates";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    return await ctx.storage.generateUploadUrl();
  },
});

export const saveUploadedFile = mutation({
  args: {
    storageId: v.id("_storage"),
    settingKey: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("Failed to get URL for uploaded file");

    const existing = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", args.settingKey))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { value: url, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("siteSettings", {
        key: args.settingKey,
        value: url,
        updatedAt: Date.now(),
      });
    }

    return url;
  },
});

const PUBLIC_SETTING_KEYS = [
  "storeName",
  "storePhone",
  "storeEmail",
  "notifyOwnerOnOrder",
  "storeAddress",
  "storeTimezone",
  "siteUrl",
  "homeUrl",
  "stripePublishableKey",
  "googleMapsClientKey",
  "mapboxAccessToken",
  "logoUrl",
  "faviconUrl",
  "heroImageUrl",
  "shapeIconMixed",
  "shapeIconEven20",
  "shapeIconRose",
  "shapeIconBlossom",
  // Content settings (expandable)
  "contentHomeHeroLine1",
  "contentHomeHeroLine2",
  "contentHomeHeroSubtitle",
  "contentHomeCtaText",
  "contentHomeFeature2Title",
  "contentHomeFeature2Desc",
  "contentHomeFeature3Title",
  "contentHomeFeature3Desc",
  "contentMenuTitle",
  "contentMenuSubtitle",
  "contentMenuTextUs",
  "chatEnabled",
] as const;

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("siteSettings").collect();
    const map: Record<string, string> = {};
    for (const row of rows) {
      map[row.key] = row.value;
    }
    return map;
  },
});

export const getPublic = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("siteSettings").collect();
    const map: Record<string, string> = {};
    for (const row of rows) {
      if ((PUBLIC_SETTING_KEYS as readonly string[]).includes(row.key)) {
        map[row.key] = row.value;
      }
    }
    return map;
  },
});

export const set = mutation({
  args: {
    key: v.string(),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const existing = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("siteSettings", {
      key: args.key,
      value: args.value,
      updatedAt: Date.now(),
    });
  },
});

export const getEmailTemplateConfig = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    const settings = await ctx.db.query("siteSettings").collect();
    const map: Record<string, string> = {};
    for (const row of settings) map[row.key] = row.value;

    return EMAIL_TEMPLATE_TYPES.map((type) => ({
      type,
      subjectKey: templateSubjectKey(type),
      bodyKey: templateBodyKey(type),
      subject: map[templateSubjectKey(type)] ?? DEFAULT_SUBJECTS[type],
      body: map[templateBodyKey(type)] ?? DEFAULT_BODIES[type],
      placeholders: PLACEHOLDER_DOCS[type],
    }));
  },
});

export const sendTestEmail = mutation({
  args: {
    templateType: v.union(
      v.literal("orderConfirmation"),
      v.literal("ownerNotification"),
      v.literal("statusUpdate"),
      v.literal("paymentFailed"),
      v.literal("abandonedCart")
    ),
    toEmail: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const { subject, html } = await renderTestEmail(ctx, args.templateType as EmailTemplateType);
    await ctx.scheduler.runAfter(0, internal.notifications.sendEmail, {
      to: args.toEmail,
      subject,
      body: html,
      template: `test_${args.templateType}`,
    });
    return { ok: true, message: `Test email sent to ${args.toEmail}` };
  },
});

export const sendTestSms = mutation({
  args: {
    toPhone: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const settings = await ctx.db.query("siteSettings").collect();
    const map = Object.fromEntries(settings.map((r) => [r.key, r.value]));
    if (map.smsEnabled === "false") {
      throw new Error("SMS is disabled. Enable SMS in Admin → Settings → SMS Settings to send test messages.");
    }
    await ctx.scheduler.runAfter(0, internal.notifications.sendSms, {
      to: args.toPhone.trim(),
      body: "TheTipsyCake test SMS. If you got this, Twilio is configured correctly.",
      template: "test_sms",
    });
    return { ok: true, message: `Test SMS scheduled to ${args.toPhone}. Check SMS logs for delivery.` };
  },
});

export const setBatch = mutation({
  args: {
    entries: v.array(v.object({ key: v.string(), value: v.string() })),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const now = Date.now();

    for (const { key, value } of args.entries) {
      const existing = await ctx.db
        .query("siteSettings")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, { value, updatedAt: now });
      } else {
        await ctx.db.insert("siteSettings", { key, value, updatedAt: now });
      }
    }
  },
});

type ServiceStatus = "missing" | "connected" | "invalid" | "error";

interface EnvCheckResult {
  key: string;
  label: string;
  category: string;
  status: ServiceStatus;
  detail?: string;
}

async function verifyStripe(secretKey: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    const res = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => null);
    const msg = body?.error?.message ?? `HTTP ${res.status}`;
    return { ok: false, detail: msg };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Network error" };
  }
}

async function verifyPayPal(
  clientId: string,
  clientSecret: string
): Promise<{ ok: boolean; detail?: string }> {
  try {
    const base = clientId.startsWith("A") && clientId.length > 60
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";
    const res = await fetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (res.ok) return { ok: true };
    return { ok: false, detail: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Network error" };
  }
}

async function verifyPostmark(serverToken: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    const res = await fetch("https://api.postmarkapp.com/server", {
      headers: {
        Accept: "application/json",
        "X-Postmark-Server-Token": serverToken,
      },
    });
    if (res.ok) return { ok: true };
    return { ok: false, detail: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Network error" };
  }
}

async function verifyTwilio(
  accountSid: string,
  authToken: string
): Promise<{ ok: boolean; detail?: string }> {
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
      { headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}` } }
    );
    if (res.ok) return { ok: true };
    return { ok: false, detail: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Network error" };
  }
}

async function verifyGoogleMaps(apiKey: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=test&key=${apiKey}`
    );
    const body = await res.json().catch(() => null);
    if (body?.status === "OK" || body?.status === "ZERO_RESULTS") return { ok: true };
    if (body?.error_message) return { ok: false, detail: body.error_message };
    return { ok: false, detail: body?.status ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Network error" };
  }
}

async function verifyMapbox(accessToken: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    const res = await fetch(
      `https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=${encodeURIComponent(accessToken)}`
    );
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => null);
    return { ok: false, detail: (body as { message?: string })?.message ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Network error" };
  }
}

const SERVER_ENV_KEYS = [
  { key: "STRIPE_SECRET_KEY", label: "Stripe Secret Key", category: "payments" },
  { key: "STRIPE_WEBHOOK_SECRET", label: "Stripe Webhook Secret", category: "payments" },
  { key: "PAYPAL_CLIENT_ID", label: "PayPal Client ID", category: "payments" },
  { key: "PAYPAL_CLIENT_SECRET", label: "PayPal Client Secret", category: "payments" },
  { key: "PAYPAL_WEBHOOK_ID", label: "PayPal Webhook ID", category: "payments" },
  { key: "GOOGLE_MAPS_API_KEY", label: "Google Maps Server Key", category: "maps" },
  { key: "MAPBOX_ACCESS_TOKEN", label: "Mapbox Access Token", category: "maps" },
  { key: "POSTMARK_SERVER_TOKEN", label: "Postmark Server Token", category: "email" },
  { key: "TWILIO_ACCOUNT_SID", label: "Twilio Account SID", category: "sms" },
  { key: "TWILIO_AUTH_TOKEN", label: "Twilio Auth Token", category: "sms" },
  { key: "TWILIO_FROM_NUMBER", label: "Twilio From Number", category: "sms" },
] as const;

export const checkEnvStatus = action({
  args: {
    /** Current form values from Public Keys — used to verify what user sees, not just DB */
    formOverrides: v.optional(
      v.object({
        mapboxAccessToken: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args): Promise<EnvCheckResult[]> => {
    const env = (k: string) => process.env[k] ?? "";
    const publicSettings = await ctx.runQuery(api.admin.settings.getPublic, {});

    const results: EnvCheckResult[] = SERVER_ENV_KEYS.map(({ key, label, category }) => ({
      key,
      label,
      category,
      status: env(key) ? ("pending" as ServiceStatus) : "missing",
    }));

    const setResult = (key: string, status: ServiceStatus, detail?: string) => {
      const entry = results.find((r) => r.key === key);
      if (entry) {
        entry.status = status;
        if (detail) entry.detail = detail;
      }
    };

    // -- Stripe --
    if (env("STRIPE_SECRET_KEY")) {
      const r = await verifyStripe(env("STRIPE_SECRET_KEY"));
      setResult("STRIPE_SECRET_KEY", r.ok ? "connected" : "invalid", r.detail);
    }
    if (env("STRIPE_WEBHOOK_SECRET")) {
      const val = env("STRIPE_WEBHOOK_SECRET");
      setResult(
        "STRIPE_WEBHOOK_SECRET",
        val.startsWith("whsec_") ? "connected" : "invalid",
        val.startsWith("whsec_") ? undefined : "Should start with whsec_"
      );
    }

    // -- PayPal --
    if (env("PAYPAL_CLIENT_ID") && env("PAYPAL_CLIENT_SECRET")) {
      const r = await verifyPayPal(env("PAYPAL_CLIENT_ID"), env("PAYPAL_CLIENT_SECRET"));
      setResult("PAYPAL_CLIENT_ID", r.ok ? "connected" : "invalid", r.detail);
      setResult("PAYPAL_CLIENT_SECRET", r.ok ? "connected" : "invalid", r.detail);
    } else {
      if (env("PAYPAL_CLIENT_ID")) setResult("PAYPAL_CLIENT_ID", "error", "Also needs PAYPAL_CLIENT_SECRET");
      if (env("PAYPAL_CLIENT_SECRET")) setResult("PAYPAL_CLIENT_SECRET", "error", "Also needs PAYPAL_CLIENT_ID");
    }
    if (env("PAYPAL_WEBHOOK_ID")) {
      setResult("PAYPAL_WEBHOOK_ID", "connected");
    }

    // -- Google Maps --
    if (env("GOOGLE_MAPS_API_KEY")) {
      const r = await verifyGoogleMaps(env("GOOGLE_MAPS_API_KEY"));
      setResult("GOOGLE_MAPS_API_KEY", r.ok ? "connected" : "invalid", r.detail);
    }

    // -- Mapbox (form override first = what user sees, then env, then DB) --
    const mapboxToken =
      (args.formOverrides?.mapboxAccessToken ?? "").trim() ||
      env("MAPBOX_ACCESS_TOKEN") ||
      env("NEXT_PUBLIC_MAPBOX_TOKEN") ||
      (publicSettings?.mapboxAccessToken ?? "").trim();
    if (mapboxToken) {
      const r = await verifyMapbox(mapboxToken);
      setResult("MAPBOX_ACCESS_TOKEN", r.ok ? "connected" : "invalid", r.detail);
    }

    // -- Postmark --
    if (env("POSTMARK_SERVER_TOKEN")) {
      const r = await verifyPostmark(env("POSTMARK_SERVER_TOKEN"));
      setResult("POSTMARK_SERVER_TOKEN", r.ok ? "connected" : "invalid", r.detail);
    }

    // -- Twilio (needs SID + Token together) --
    if (env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN")) {
      const r = await verifyTwilio(env("TWILIO_ACCOUNT_SID"), env("TWILIO_AUTH_TOKEN"));
      setResult("TWILIO_ACCOUNT_SID", r.ok ? "connected" : "invalid", r.detail);
      setResult("TWILIO_AUTH_TOKEN", r.ok ? "connected" : "invalid", r.detail);
    } else {
      if (env("TWILIO_ACCOUNT_SID")) setResult("TWILIO_ACCOUNT_SID", "error", "Also needs TWILIO_AUTH_TOKEN");
      if (env("TWILIO_AUTH_TOKEN")) setResult("TWILIO_AUTH_TOKEN", "error", "Also needs TWILIO_ACCOUNT_SID");
    }
    if (env("TWILIO_FROM_NUMBER")) {
      const val = env("TWILIO_FROM_NUMBER");
      setResult(
        "TWILIO_FROM_NUMBER",
        val.startsWith("+") ? "connected" : "invalid",
        val.startsWith("+") ? undefined : "Should start with + (e.g. +15551234567)"
      );
    }

    return results;
  },
});
