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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ChevronRight } from "lucide-react";

const EMAIL_ABANDONED_KEYS = [
  "emailAbandonedCartEnabled",
  "emailAbandonedCartIncentiveEnabled",
  "emailAbandonedCartCouponCents",
  "emailAbandonedCartCouponExpiryHours",
] as const;

const ORDER_REMINDER_KEYS = [
  "orderReminderEnabled",
  "orderReminderFirstHours",
  "orderReminderSecondHours",
] as const;

const EMAIL_LOG_TEMPLATES = [
  { value: "all", label: "All types" },
  { value: "email_blast", label: "Email blast" },
  { value: "abandoned", label: "Abandoned cart" },
  { value: "orderConfirmation", label: "Order confirmation" },
  { value: "ownerNotification", label: "Owner notification" },
  { value: "ownerOrderComplete", label: "Owner order complete" },
  { value: "ownerOrderReminder", label: "Owner order reminder" },
  { value: "statusUpdate", label: "Status update" },
  { value: "paymentFailed", label: "Payment failed" },
  { value: "other", label: "Other" },
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
  const [logTemplateFilter, setLogTemplateFilter] = useState<string>("all");
  const templateSyncedRef = useRef(false);

  useEffect(() => {
    if (settings && !synced) {
      setForm({
        ...settings,
        notifyOwnerOnOrder: settings.notifyOwnerOnOrder ?? "true",
        emailAbandonedCartEnabled: settings.emailAbandonedCartEnabled ?? "true",
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
        EMAIL_ABANDONED_KEYS.includes(k as (typeof EMAIL_ABANDONED_KEYS)[number]) ||
        ORDER_REMINDER_KEYS.includes(k as (typeof ORDER_REMINDER_KEYS)[number]);
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
          Email templates, abandoned cart incentives, email blast, and email logs.
        </p>
        <Link
          href="/admin/settings/email/blast"
          className="text-sm text-primary hover:underline"
        >
          → Email Blast
        </Link>
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

      {/* ── Order Status Reminders ── */}
      <Card>
        <CardHeader>
          <CardTitle>Order Status Reminders</CardTitle>
          <CardDescription>
            When an order has no status update for a while, email the store owner to update it. Runs every 15 minutes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="orderReminderEnabled"
              checked={(form.orderReminderEnabled ?? "true") !== "false"}
              onChange={(e) =>
                updateField("orderReminderEnabled", e.target.checked ? "true" : "false")
              }
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="orderReminderEnabled" className="cursor-pointer font-normal">
              Send reminder emails when orders are stuck without status updates
            </Label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="orderReminderFirstHours">First reminder (hours)</Label>
              <Input
                id="orderReminderFirstHours"
                type="number"
                min={0.5}
                step={0.5}
                max={24}
                value={form.orderReminderFirstHours ?? "1"}
                onChange={(e) => updateField("orderReminderFirstHours", e.target.value)}
                placeholder="1"
              />
              <p className="text-xs text-muted-foreground">0.5–24 hours (1 = 1 hour)</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="orderReminderSecondHours">Second reminder (hours)</Label>
              <Input
                id="orderReminderSecondHours"
                type="number"
                min={1}
                max={72}
                value={form.orderReminderSecondHours ?? "2"}
                onChange={(e) => updateField("orderReminderSecondHours", e.target.value)}
                placeholder="2"
              />
              <p className="text-xs text-muted-foreground">Must be after first (2 = 2 hours)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Abandoned Cart ── */}
      <Card>
        <CardHeader>
          <CardTitle>Abandoned Cart Emails</CardTitle>
          <CardDescription>
            When a cart is left for 2+ hours with items and contact info, send a reminder email (and optionally SMS). Runs every 15 minutes. One email per cart — all items in the cart are listed together.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="emailAbandonedCartEnabled"
              checked={(form.emailAbandonedCartEnabled ?? "true") !== "false"}
              onChange={(e) =>
                updateField("emailAbandonedCartEnabled", e.target.checked ? "true" : "false")
              }
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="emailAbandonedCartEnabled" className="cursor-pointer font-normal">
              Send abandoned cart reminder emails
            </Label>
          </div>
          <div className="space-y-4 border-t pt-4">
            <h4 className="text-sm font-medium">Coupon incentive</h4>
            <p className="text-xs text-muted-foreground">
              Optionally include a unique one-time coupon to encourage recovery. Each abandoned cart gets its own code.
            </p>
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
                <Label htmlFor="emailAbandonedCartCouponCents">Discount amount ($)</Label>
                <Input
                  id="emailAbandonedCartCouponCents"
                  type="number"
                  min={0}
                  step={0.01}
                  value={
                    form.emailAbandonedCartCouponCents
                      ? (Number(form.emailAbandonedCartCouponCents) / 100).toFixed(2)
                      : "1.00"
                  }
                  onChange={(e) => {
                    const dollars = parseFloat(e.target.value) || 0;
                    updateField("emailAbandonedCartCouponCents", String(Math.round(dollars * 100)));
                  }}
                  placeholder="1.00"
                />
                <p className="text-xs text-muted-foreground">e.g. 1 = $1 off, 5 = $5 off</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="emailAbandonedCartCouponExpiryHours">Coupon expires in (hours)</Label>
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
          </div>
        </CardContent>
      </Card>

      {/* ── Email Templates ── */}
      <Card>
        <CardHeader>
          <CardTitle>Email Templates</CardTitle>
          <CardDescription>
            Customize subjects and HTML bodies. Placeholders: {`{{orderNumber}}`}, {`{{storeName}}`}, {`{{productDetails}}`}, {`{{couponBlock}}`}, {`{{deliveryAddress}}`}, etc.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
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
              <Collapsible key={t.type} defaultOpen={false}>
                <div className="rounded-xl border bg-muted/30">
                  <CollapsibleTrigger className="group flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
                      <h3 className="font-medium">{typeLabel}</h3>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Input
                        placeholder="Send test to"
                        type="email"
                        id={`test-${t.type}`}
                        className="h-8 w-32 text-sm"
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
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-3 border-t px-4 pb-4 pt-3">
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
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Email Logs ── */}
      <Card>
        <CardHeader>
          <CardTitle>Email Logs</CardTitle>
          <CardDescription>
            Sent (Postmark Message ID), skipped (no Postmark), or error. Each log shows when it was
            sent and the provider response.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {emailLogs === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Label htmlFor="log-template-filter" className="text-xs font-medium">
                  Filter by type
                </Label>
                <Select value={logTemplateFilter} onValueChange={setLogTemplateFilter}>
                  <SelectTrigger id="log-template-filter" className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMAIL_LOG_TEMPLATES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(() => {
                const knownTemplates = [
                  "email_blast",
                  "abandoned_cart",
                  "abandonedCart",
                  "orderConfirmation",
                  "ownerNotification",
                  "ownerOrderComplete",
                  "ownerOrderReminder",
                  "statusUpdate",
                  "paymentFailed",
                ];
                const filtered =
                  logTemplateFilter === "all"
                    ? emailLogs
                    : logTemplateFilter === "other"
                      ? emailLogs.filter(
                          (l) => !l.template || !knownTemplates.includes(l.template)
                        )
                      : logTemplateFilter === "abandoned"
                        ? emailLogs.filter(
                            (l) =>
                              l.template === "abandoned_cart" ||
                              l.template === "abandonedCart"
                          )
                        : emailLogs.filter((l) => l.template === logTemplateFilter);
                if (filtered.length === 0) {
                  return (
                    <p className="text-sm text-muted-foreground">
                      No email logs
                      {logTemplateFilter !== "all" ? ` for ${EMAIL_LOG_TEMPLATES.find((t) => t.value === logTemplateFilter)?.label ?? logTemplateFilter}` : ""}.
                    </p>
                  );
                }
                return (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {filtered.map((log) => (
                      <div
                        key={log._id}
                        className="flex flex-col gap-2 rounded-lg border bg-muted/30 px-3 py-3 text-sm"
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
                              <Badge variant="outline" className="shrink-0 font-normal">
                                {log.template.replace(/_/g, " ")}
                              </Badge>
                            )}
                            {log.orderNumber && (
                              <span className="text-muted-foreground">#{log.orderNumber}</span>
                            )}
                          </div>
                          <span className="shrink-0 text-xs font-medium">
                            Sent at {formatTime(log.createdAt)}
                          </span>
                        </div>
                        <div className="grid gap-1 text-xs">
                          <div className="min-w-0">
                            <span className="text-muted-foreground">To: </span>
                            <span className="truncate">{log.to}</span>
                            {log.subject != null && (
                              <>
                                <span className="text-muted-foreground"> · </span>
                                <span className="truncate">{log.subject}</span>
                              </>
                            )}
                          </div>
                          {log.bodyPreview != null && (
                            <p className="truncate italic text-muted-foreground">
                              &quot;{log.bodyPreview}&quot;
                            </p>
                          )}
                          <div className="pt-1 space-y-0.5">
                            {log.status === "sent" && log.externalId != null && (
                              <p>
                                <span className="text-muted-foreground">Response: </span>
                                <span className="font-mono text-green-700 dark:text-green-400">
                                  Postmark ID {log.externalId}
                                </span>
                              </p>
                            )}
                            {log.status === "skipped" && (
                              <p className="text-muted-foreground">
                                Response: Skipped (Postmark not configured)
                              </p>
                            )}
                            {log.errorMessage != null && (
                              <p>
                                <span className="text-muted-foreground">Response: </span>
                                <span className="text-destructive">{log.errorMessage}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </>
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
