"use client";

import Link from "next/link";
import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";

import { api } from "../../../../../../convex/_generated/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const COUPON_PLACEHOLDER = "{{COUPON_CODE}}";

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function bodyPreview(html: string, maxLen = 120): string {
  const text = stripHtml(html);
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

const BLAST_TEMPLATES = [
  {
    id: "percent-off",
    name: "10% off",
    subject: "10% off your next bundt!",
    body: `<h2>Hey there!</h2>
<p>We've got something sweet for you.</p>
<p>Use code <strong>${COUPON_PLACEHOLDER}</strong> for 10% off your next order.</p>
<p><a href="https://order.tipsycake.com/products">Order now</a></p>
<p>— TheTipsyCake</p>`,
  },
  {
    id: "fixed-off",
    name: "$5 off",
    subject: "$5 off your next bundt cake order",
    body: `<h2>It's been a while!</h2>
<p>We haven't seen you in a bit and wanted to say hi.</p>
<p>To sweeten things up, enjoy <strong>$5 off your next cake order</strong> — use code <strong>${COUPON_PLACEHOLDER}</strong> at checkout, but it expires in <strong>24 hours</strong>.</p>
<p>Our bundt cakes are still as delicious as ever, and we'd love to have you back.</p>
<p>
  Treat yourself today —
  <a href="https://order.thetipsycake.com">order now</a>.
</p>
<p><em>Hurry, this offer disappears in 24 hours.</em></p>
<p>— The Tipsy Cake</p>`,
  },
  {
    id: "free-delivery",
    name: "Free delivery",
    subject: "Free delivery on your next order",
    body: `<h2>On us!</h2>
<p>Get free delivery on your next bundt order.</p>
<p>Use code <strong>${COUPON_PLACEHOLDER}</strong> at checkout.</p>
<p><a href="https://order.tipsycake.com/products">Place your order</a></p>
<p>— TheTipsyCake</p>`,
  },
  {
    id: "new-flavors-5off",
    name: "New Flavors – $5 off",
    subject: "Hey — check out our new flavors",
    body: `<h2>Hey — check out our new flavors</h2>
<p>Since you've ordered from us before, we wanted to give you a little something special.</p>
<p>Enjoy <strong>$5 off your next cake order</strong> — use code <strong>${COUPON_PLACEHOLDER}</strong> at checkout — as a thank-you for being part of The Tipsy Cake family.</p>
<p>We've got some delicious flavors waiting for you, and we'd love to have you back.</p>
<p>
  <a href="https://order.tipsycake.com/products">Shop our cakes now</a>
</p>
<p><em>Your $5 off expires in 24 hours, so don't wait too long.</em></p>
<p>— The Tipsy Cake</p>`,
  },
  {
    id: "we-miss-you",
    name: "We miss you",
    subject: "We miss you! Here's a little something",
    body: `<h2>It's been a while!</h2>
<p>We haven't seen you in a bit and wanted to say hi. Our bundt cakes are as delicious as ever.</p>
<p>Treat yourself — <a href="https://order.tipsycake.com/products">order a bundt today</a>.</p>
<p>— TheTipsyCake</p>`,
  },
  {
    id: "blank",
    name: "Start from scratch",
    subject: "",
    body: "",
  },
] as const;

function formatDate(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type BlastMode = "customers" | "test";
type CouponMode = "none" | "existing" | "new";

const defaultNewCouponForm = {
  code: "",
  type: "percent" as "percent" | "fixed" | "free_delivery",
  value: "10",
  minSubtotal: "0",
  maxRedemptions: "",
  maxRedemptionsPerCustomer: "",
  enabled: true,
  stackable: false,
};

export default function EmailBlastPage() {
  const [blastMode, setBlastMode] = useState<BlastMode>("customers");
  const [testEmail, setTestEmail] = useState("");
  const [lastOrderWithinDays, setLastOrderWithinDays] = useState<number>(0);
  const recipientCount = useQuery(api.admin.customers.listEmailsForBlast, {
    skip: 0,
    limit: 1,
    lastOrderWithinDays:
      blastMode === "customers" && lastOrderWithinDays > 0 ? lastOrderWithinDays : undefined,
  });
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorModalMessage, setErrorModalMessage] = useState<string | null>(null);

  const [couponMode, setCouponMode] = useState<CouponMode>("none");
  const [existingCouponId, setExistingCouponId] = useState<string>("none");
  const [newCouponForm, setNewCouponForm] = useState(defaultNewCouponForm);

  const createBlast = useAction(api.admin.blast.createBlast);
  const createCoupon = useMutation(api.coupons.createCoupon);
  const coupons = useQuery(api.coupons.listCoupons);
  const blasts = useQuery(api.admin.blast.listBlasts, { limit: 10 });

  const effectiveRecipientCount =
    blastMode === "test"
      ? testEmail.trim() ? 1 : 0
      : recipientCount?.total ?? 0;

  async function handleSend() {
    if (!subject.trim()) {
      setErrorModalMessage("Enter a subject.");
      return;
    }
    if (!bodyHtml.trim()) {
      setErrorModalMessage("Enter email body (HTML allowed).");
      return;
    }
    if (blastMode === "test" && !testEmail.trim()) {
      setErrorModalMessage("Enter a test email address.");
      return;
    }
    if (blastMode === "customers" && effectiveRecipientCount === 0) {
      setErrorModalMessage("No recipients match the selected filters.");
      return;
    }
    if (couponMode === "new" && !newCouponForm.code.trim()) {
      setErrorModalMessage("Enter a coupon code for the new coupon.");
      return;
    }

    setSending(true);
    setMessage(null);

    try {
      let couponCode: string | null = null;

      if (couponMode === "new") {
        await createCoupon({
          code: newCouponForm.code,
          type: newCouponForm.type,
          value:
            newCouponForm.type === "fixed"
              ? Math.round(Number(newCouponForm.value) * 100)
              : Number(newCouponForm.value),
          minSubtotalCents: Number(newCouponForm.minSubtotal)
            ? Math.round(Number(newCouponForm.minSubtotal) * 100)
            : undefined,
          maxRedemptions: Number(newCouponForm.maxRedemptions) || undefined,
          maxRedemptionsPerCustomer:
            Number(newCouponForm.maxRedemptionsPerCustomer) || undefined,
          stackable: newCouponForm.stackable,
          enabled: newCouponForm.enabled,
        });
        couponCode = newCouponForm.code.trim().toUpperCase();
        setNewCouponForm(defaultNewCouponForm);
      } else if (couponMode === "existing") {
        const c = coupons?.find((x) => x._id === existingCouponId);
        couponCode = c?.code ?? null;
      }

      let finalBody = bodyHtml.trim();
      if (couponCode && finalBody.includes(COUPON_PLACEHOLDER)) {
        finalBody = finalBody.replaceAll(COUPON_PLACEHOLDER, couponCode);
      }

      await createBlast({
        subject: subject.trim(),
        bodyHtml: finalBody,
        lastOrderWithinDays:
          blastMode === "customers" && lastOrderWithinDays > 0
            ? lastOrderWithinDays
            : undefined,
        testEmail: blastMode === "test" ? testEmail.trim() : undefined,
      });

      const recipientLabel =
        blastMode === "test" ? "1 test recipient" : `${effectiveRecipientCount} recipients`;
      setMessage(`Blast queued. Sending to ${recipientLabel}.`);
      setSubject("");
      setBodyHtml("");
    } catch (err) {
      setErrorModalMessage(err instanceof Error ? err.message : "Failed to send blast");
    } finally {
      setSending(false);
    }
  }

  const insertPlaceholder = () => {
    setBodyHtml((prev) => prev + (prev ? " " : "") + COUPON_PLACEHOLDER);
  };

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/admin/settings/email"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Email Settings
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Email Blast</h1>
        <p className="text-sm text-muted-foreground">
          Send a marketing email to customers, or test with a single email. Recipients are derived
          from order contact emails.
        </p>
        {message && <Badge variant="secondary">{message}</Badge>}
      </header>

      <AlertDialog open={errorModalMessage != null} onOpenChange={(open) => !open && setErrorModalMessage(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cannot send blast</AlertDialogTitle>
            <AlertDialogDescription>{errorModalMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader>
          <CardTitle>Compose Blast</CardTitle>
          <CardDescription>
            Choose customers or test with one email. Optionally attach a coupon (new or existing).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Recipients</Label>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="blastMode"
                  checked={blastMode === "customers"}
                  onChange={() => setBlastMode("customers")}
                  className="h-4 w-4"
                />
                Send to customers
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="blastMode"
                  checked={blastMode === "test"}
                  onChange={() => setBlastMode("test")}
                  className="h-4 w-4"
                />
                Test blast (single email)
              </label>
            </div>

            {blastMode === "test" ? (
              <div className="mt-2">
                <Input
                  type="email"
                  placeholder="test@example.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="max-w-xs"
                />
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="filter"
                    checked={lastOrderWithinDays === 0}
                    onChange={() => setLastOrderWithinDays(0)}
                    className="h-4 w-4"
                  />
                  All customers
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="filter"
                    checked={lastOrderWithinDays > 0}
                    onChange={() => setLastOrderWithinDays(90)}
                    className="h-4 w-4"
                  />
                  Ordered within
                </label>
                <Input
                  type="number"
                  min={1}
                  max={730}
                  value={lastOrderWithinDays > 0 ? lastOrderWithinDays : 90}
                  onChange={(e) => setLastOrderWithinDays(Number(e.target.value) || 0)}
                  disabled={lastOrderWithinDays === 0}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">days</span>
                {recipientCount != null && (
                  <span className="text-muted-foreground">({recipientCount.total} recipients)</span>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Coupon</Label>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="couponMode"
                  checked={couponMode === "none"}
                  onChange={() => setCouponMode("none")}
                  className="h-4 w-4"
                />
                No coupon
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="couponMode"
                  checked={couponMode === "existing"}
                  onChange={() => setCouponMode("existing")}
                  className="h-4 w-4"
                />
                Use existing coupon
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="couponMode"
                  checked={couponMode === "new"}
                  onChange={() => setCouponMode("new")}
                  className="h-4 w-4"
                />
                Create new coupon for this blast
              </label>
            </div>

            {couponMode === "existing" && (
              <div className="mt-2">
                <Select value={existingCouponId} onValueChange={setExistingCouponId}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Select coupon" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Select —</SelectItem>
                    {(coupons ?? []).map((c) => (
                      <SelectItem key={c._id} value={c._id}>
                        {c.code}{" "}
                        {c.type === "percent"
                          ? `(${c.value}% off)`
                          : c.type === "fixed"
                            ? `($${(c.value / 100).toFixed(2)} off)`
                            : "(free delivery)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {couponMode === "new" && (
              <div className="mt-2 grid gap-3 rounded border p-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="blast-coupon-code">Code</Label>
                  <Input
                    id="blast-coupon-code"
                    value={newCouponForm.code}
                    onChange={(e) =>
                      setNewCouponForm((p) => ({ ...p, code: e.target.value }))
                    }
                    placeholder="e.g. BLAST10"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Type</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={newCouponForm.type}
                    onChange={(e) =>
                      setNewCouponForm((p) => ({
                        ...p,
                        type: e.target.value as "percent" | "fixed" | "free_delivery",
                      }))
                    }
                  >
                    <option value="percent">Percentage off</option>
                    <option value="fixed">Fixed amount off</option>
                    <option value="free_delivery">Free delivery</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Value {newCouponForm.type === "fixed" ? "($)" : "(%)"}</Label>
                  <Input
                    type="number"
                    step={newCouponForm.type === "fixed" ? "0.01" : "1"}
                    value={newCouponForm.value}
                    onChange={(e) =>
                      setNewCouponForm((p) => ({ ...p, value: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Min subtotal ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={newCouponForm.minSubtotal}
                    onChange={(e) =>
                      setNewCouponForm((p) => ({ ...p, minSubtotal: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Max redemptions</Label>
                  <Input
                    type="number"
                    value={newCouponForm.maxRedemptions}
                    onChange={(e) =>
                      setNewCouponForm((p) => ({ ...p, maxRedemptions: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Max per customer</Label>
                  <Input
                    type="number"
                    value={newCouponForm.maxRedemptionsPerCustomer}
                    onChange={(e) =>
                      setNewCouponForm((p) => ({
                        ...p,
                        maxRedemptionsPerCustomer: e.target.value,
                      }))
                    }
                  />
                </div>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={newCouponForm.enabled}
                    onChange={(e) =>
                      setNewCouponForm((p) => ({ ...p, enabled: e.target.checked }))
                    }
                  />
                  Enabled
                </label>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={newCouponForm.stackable}
                    onChange={(e) =>
                      setNewCouponForm((p) => ({ ...p, stackable: e.target.checked }))
                    }
                  />
                  Stackable
                </label>
              </div>
            )}

            {(couponMode === "existing" || couponMode === "new") && (
              <p className="mt-2 text-xs text-muted-foreground">
                Add <code className="rounded bg-muted px-1">{COUPON_PLACEHOLDER}</code> in the body
                to auto-insert the code.{" "}
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs"
                  onClick={insertPlaceholder}
                >
                  Insert placeholder
                </Button>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Template</Label>
            <div className="flex flex-wrap gap-2">
              {BLAST_TEMPLATES.map((t) => (
                <Button
                  key={t.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSubject(t.subject);
                    setBodyHtml(t.body);
                  }}
                >
                  {t.name}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Choose a template to fill subject and body. You can edit after applying.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. 10% off your next order!"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="body">Body (HTML)</Label>
            <Textarea
              id="body"
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              placeholder={`<h2>Hey there!</h2>
<p>We've got something sweet for you.</p>
<p>Use code <strong>${COUPON_PLACEHOLDER}</strong> for 10% off.</p>
<a href="https://order.tipsycake.com/products">Order now</a>`}
              rows={12}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              HTML allowed. Include coupon codes, links, and images. Paste your store URL from
              Settings.
            </p>
          </div>
          <Button
            type="button"
            onClick={handleSend}
            disabled={
              sending ||
              effectiveRecipientCount === 0 ||
              (couponMode === "existing" && existingCouponId === "none") ||
              (couponMode === "new" && !newCouponForm.code.trim())
            }
          >
            {sending
              ? "Queuing…"
              : blastMode === "test"
                ? `Send test to ${effectiveRecipientCount} email`
                : `Send to ${effectiveRecipientCount} recipients`}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Blasts</CardTitle>
          <CardDescription>
            Blast history and status. Emails are sent immediately — the first batch starts right
            away, with subsequent batches every 500ms (50 emails per batch).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(blasts ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No blasts yet.</p>
          ) : (
            <div className="space-y-3">
              {blasts?.map((b) => {
                const scope =
                  b.isTest === true
                    ? "Test (1 email)"
                    : b.lastOrderWithinDays != null
                      ? `Ordered within ${b.lastOrderWithinDays} days`
                      : "All customers";
                return (
                  <Collapsible key={b._id}>
                    <div className="rounded border p-3 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="font-medium">{b.subject}</p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            <span>{scope}</span>
                            <span>
                              {b.sentCount}/{b.totalRecipients} sent
                            </span>
                            <span>Created {formatDate(b.createdAt)}</span>
                            {b.completedAt != null && (
                              <span>Completed {formatDate(b.completedAt)}</span>
                            )}
                          </div>
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {bodyPreview(b.bodyHtml)}
                          </p>
                        </div>
                        <Badge
                          variant={
                            b.status === "completed"
                              ? "default"
                              : b.status === "failed"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {b.status}
                        </Badge>
                      </div>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs">
                          View full body
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-3 text-xs">
                          {b.bodyHtml}
                        </pre>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
