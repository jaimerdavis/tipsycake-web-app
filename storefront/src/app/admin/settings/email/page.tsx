"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const EMAIL_ABANDONED_KEYS = [
  "emailAbandonedCartIncentiveEnabled",
  "emailAbandonedCartCouponCents",
  "emailAbandonedCartCouponExpiryHours",
] as const;

function formatTime(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function EmailSettingsPage() {
  const settings = useQuery(api.admin.settings.getAll);
  const templateConfig = useQuery(api.admin.settings.getEmailTemplateConfig);
  const emailLogs = useQuery(api.admin.notificationLogs.list, {
    channel: "email",
    limit: 30,
  });
  const setBatch = useMutation(api.admin.settings.setBatch);
  const sendTestEmail = useMutation(api.admin.settings.sendTestEmail);

  const [form, setForm] = useState<Record<string, string>>({});
  const [synced, setSynced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testEmailSending, setTestEmailSending] = useState<string | null>(null);
  const templateSyncedRef = useRef(false);

  useEffect(() => {
    if (settings && !synced) {
      setForm({
        ...settings,
        notifyOwnerOnOrder: settings.notifyOwnerOnOrder ?? "true",
        emailAbandonedCartIncentiveEnabled: settings.emailAbandonedCartIncentiveEnabled ?? "true",
        emailAbandonedCartCouponCents: settings.emailAbandonedCartCouponCents ?? "100",
        emailAbandonedCartCouponExpiryHours: settings.emailAbandonedCartCouponExpiryHours ?? "24",
      });
      setSynced(true);
    }
  }, [settings, synced]);

  useEffect(() => {
    if (templateConfig && synced && !templateSyncedRef.current) {
      templateSyncedRef.current = true;
      setForm((prev) => {
        const next = { ...prev };
        for (const t of templateConfig) {
          next[t.subjectKey] = t.subject;
          next[t.bodyKey] = t.body;
        }
        return next;
      });
    }
  }, [templateConfig, synced]);

  function updateField(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const isTemplateKey = (k: string) =>
        k.startsWith("emailSubject_") || k.startsWith("emailBody_");
      const isEmailKey = (k: string) =>
        isTemplateKey(k) ||
        k === "notifyOwnerOnOrder" ||
        EMAIL_ABANDONED_KEYS.includes(k as (typeof EMAIL_ABANDONED_KEYS)[number]);
      const entries = Object.entries(form)
        .filter(
          ([key, value]) =>
            isEmailKey(key) || (value != null && String(value).trim() !== "")
        )
        .map(([key, value]) => ({ key, value: String(value ?? "").trim() }));
      await setBatch({ entries });
      setMessage("Email settings saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/admin/settings"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Settings
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Email Settings</h1>
        <p className="text-sm text-muted-foreground">
          Email templates, abandoned cart incentives, and email logs.
        </p>
        {message && <Badge variant="secondary">{message}</Badge>}
      </header>

      {/* ── Order Notifications ── */}
      <Card>
        <CardHeader>
          <CardTitle>Order Notifications</CardTitle>
          <CardDescription>
            Email confirmations go to customers automatically. Optionally notify the store owner.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="notifyOwnerOnOrder"
              checked={(form.notifyOwnerOnOrder ?? "true") !== "false"}
              onChange={(e) => updateField("notifyOwnerOnOrder", e.target.checked ? "true" : "false")}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="notifyOwnerOnOrder" className="cursor-pointer font-normal">
              Email store owner when a new order is placed (uses Store Email from main Settings)
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* ── Abandoned Cart Incentive ── */}
      <Card>
        <CardHeader>
          <CardTitle>Abandoned Cart Incentive</CardTitle>
          <CardDescription>
            Generate a unique coupon when sending abandoned cart emails. $1 off, expires in 24 hours by default.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="emailAbandonedCartIncentiveEnabled"
              checked={(form.emailAbandonedCartIncentiveEnabled ?? "true") !== "false"}
              onChange={(e) =>
                updateField("emailAbandonedCartIncentiveEnabled", e.target.checked ? "true" : "false")
              }
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="emailAbandonedCartIncentiveEnabled" className="cursor-pointer font-normal">
              Include coupon in abandoned cart emails
            </Label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="emailAbandonedCartCouponCents">Discount amount (cents)</Label>
              <Input
                id="emailAbandonedCartCouponCents"
                type="number"
                min={0}
                value={form.emailAbandonedCartCouponCents ?? "100"}
                onChange={(e) => updateField("emailAbandonedCartCouponCents", e.target.value)}
                placeholder="100"
              />
              <p className="text-xs text-muted-foreground">100 = $1 off</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="emailAbandonedCartCouponExpiryHours">Expiry (hours)</Label>
              <Input
                id="emailAbandonedCartCouponExpiryHours"
                type="number"
                min={1}
                max={168}
                value={form.emailAbandonedCartCouponExpiryHours ?? "24"}
                onChange={(e) => updateField("emailAbandonedCartCouponExpiryHours", e.target.value)}
                placeholder="24"
              />
              <p className="text-xs text-muted-foreground">1–168 hours (24 = 1 day)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Email Templates ── */}
      <Card>
        <CardHeader>
          <CardTitle>Email Templates</CardTitle>
          <CardDescription>
            Customize subjects and HTML bodies. Placeholders: {`{{orderNumber}}`}, {`{{storeName}}`}, {`{{productDetails}}`}, {`{{couponBlock}}`}, etc.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {templateConfig?.map((t) => {
            const typeLabel =
              t.type === "orderConfirmation"
                ? "Order confirmation (customer)"
                : t.type === "ownerNotification"
                  ? "Owner notification (new order)"
                  : t.type === "statusUpdate"
                    ? "Status update"
                    : t.type === "paymentFailed"
                      ? "Payment failed"
                      : "Abandoned cart";
            const sending = testEmailSending === t.type;
            return (
              <div key={t.type} className="space-y-3 rounded-xl border bg-muted/30 p-4">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="font-medium">{typeLabel}</h3>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Send test to"
                      type="email"
                      id={`test-${t.type}`}
                      className="h-8 w-40 text-sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sending}
                      onClick={async () => {
                        const input = document.getElementById(`test-${t.type}`) as HTMLInputElement;
                        const to = input?.value?.trim();
                        if (!to) return;
                        setTestEmailSending(t.type);
                        try {
                          await sendTestEmail({ templateType: t.type, toEmail: to });
                          setMessage(`Test email sent to ${to}`);
                        } catch (err) {
                          setMessage(err instanceof Error ? err.message : "Failed to send test");
                        } finally {
                          setTestEmailSending(null);
                        }
                      }}
                    >
                      {sending ? "Sending…" : "Send test"}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={t.subjectKey} className="text-xs">
                    Subject
                  </Label>
                  <Input
                    id={t.subjectKey}
                    value={form[t.subjectKey] ?? ""}
                    onChange={(e) => updateField(t.subjectKey, e.target.value)}
                    placeholder={t.subject}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={t.bodyKey} className="text-xs">
                    Body (HTML)
                  </Label>
                  <Textarea
                    id={t.bodyKey}
                    value={form[t.bodyKey] ?? ""}
                    onChange={(e) => updateField(t.bodyKey, e.target.value)}
                    placeholder={t.body.slice(0, 80) + "…"}
                    className="min-h-[120px] font-mono text-sm"
                    rows={6}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Placeholders: {t.placeholders.join(", ")}
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Email Logs ── */}
      <Card>
        <CardHeader>
          <CardTitle>Email Logs</CardTitle>
          <CardDescription>
            Sent (with Postmark Message ID), skipped (no Postmark), or error.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {emailLogs === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : emailLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No email logs yet.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {emailLogs.map((log) => (
                <div
                  key={log._id}
                  className="flex flex-col gap-1.5 rounded border bg-muted/30 px-3 py-2.5 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <Badge
                        variant={
                          log.status === "error"
                            ? "destructive"
                            : log.status === "skipped"
                              ? "secondary"
                              : "default"
                        }
                        className="capitalize shrink-0"
                      >
                        {log.status}
                      </Badge>
                      {log.template && (
                        <span className="text-muted-foreground truncate">{log.template}</span>
                      )}
                      {log.orderNumber && (
                        <span className="text-muted-foreground">#{log.orderNumber}</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatTime(log.createdAt)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="truncate text-muted-foreground">
                      To: {log.to}
                      {log.subject != null && <> · {log.subject}</>}
                    </span>
                    {log.bodyPreview != null && (
                      <span className="truncate text-xs text-muted-foreground italic">
                        &quot;{log.bodyPreview}&quot;
                      </span>
                    )}
                    {log.status === "sent" && log.externalId != null && (
                      <span className="text-xs text-green-700 dark:text-green-400 font-mono">
                        Postmark ID: {log.externalId}
                      </span>
                    )}
                    {log.errorMessage != null && (
                      <span className="text-destructive text-xs">{log.errorMessage}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Save ── */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save email settings"}
        </Button>
        {message && <span className="text-sm text-muted-foreground">{message}</span>}
      </div>
    </main>
  );
}
