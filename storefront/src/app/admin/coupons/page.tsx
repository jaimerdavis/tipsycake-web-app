"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type EditCoupon = {
  _id: Id<"coupons">;
  code: string;
  type: "percent" | "fixed" | "free_delivery";
  value: number;
  minSubtotalCents?: number;
  maxRedemptions?: number;
  maxRedemptionsPerCustomer?: number;
  enabled: boolean;
  stackable: boolean;
};

function EditCouponForm({
  coupon,
  onSave,
  onError,
}: {
  coupon: EditCoupon;
  onSave: (updates: {
    type?: "percent" | "fixed" | "free_delivery";
    value?: number;
    minSubtotalCents?: number;
    maxRedemptions?: number;
    maxRedemptionsPerCustomer?: number;
    enabled?: boolean;
    stackable?: boolean;
  }) => Promise<void>;
  onError: (err: unknown) => void;
}) {
  const [editForm, setEditForm] = useState({
    type: coupon.type,
    value: String(coupon.type === "fixed" ? coupon.value / 100 : coupon.value),
    minSubtotal: coupon.minSubtotalCents ? String(coupon.minSubtotalCents / 100) : "0",
    maxRedemptions: coupon.maxRedemptions ? String(coupon.maxRedemptions) : "",
    maxRedemptionsPerCustomer: coupon.maxRedemptionsPerCustomer ? String(coupon.maxRedemptionsPerCustomer) : "",
    enabled: coupon.enabled,
    stackable: coupon.stackable,
  });
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="flex flex-col gap-4 px-6 py-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await onSave({
            type: editForm.type,
            value: editForm.type === "fixed" ? Math.round(Number(editForm.value) * 100) : Number(editForm.value),
            minSubtotalCents: Number(editForm.minSubtotal) ? Math.round(Number(editForm.minSubtotal) * 100) : undefined,
            maxRedemptions: Number(editForm.maxRedemptions) || undefined,
            maxRedemptionsPerCustomer: Number(editForm.maxRedemptionsPerCustomer) || undefined,
            enabled: editForm.enabled,
            stackable: editForm.stackable,
          });
        } catch (err) {
          onError(err);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="space-y-2">
        <Label>Type</Label>
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={editForm.type}
          onChange={(e) => setEditForm((p) => ({ ...p, type: e.target.value as EditCoupon["type"] }))}
        >
          <option value="percent">Percentage off</option>
          <option value="fixed">Fixed amount off</option>
          <option value="free_delivery">Free delivery</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label>Value {editForm.type === "fixed" ? "($)" : editForm.type === "percent" ? "(%)" : ""}</Label>
        <Input
          type="number"
          step={editForm.type === "fixed" ? "0.01" : "1"}
          value={editForm.value}
          onChange={(e) => setEditForm((p) => ({ ...p, value: e.target.value }))}
        />
      </div>
      <div className="space-y-2">
        <Label>Min subtotal ($)</Label>
        <Input
          type="number"
          step="0.01"
          value={editForm.minSubtotal}
          onChange={(e) => setEditForm((p) => ({ ...p, minSubtotal: e.target.value }))}
        />
      </div>
      <div className="space-y-2">
        <Label>Max redemptions</Label>
        <Input
          type="number"
          value={editForm.maxRedemptions}
          onChange={(e) => setEditForm((p) => ({ ...p, maxRedemptions: e.target.value }))}
        />
      </div>
      <div className="space-y-2">
        <Label>Max per customer</Label>
        <Input
          type="number"
          value={editForm.maxRedemptionsPerCustomer}
          onChange={(e) => setEditForm((p) => ({ ...p, maxRedemptionsPerCustomer: e.target.value }))}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={editForm.enabled}
          onChange={(e) => setEditForm((p) => ({ ...p, enabled: e.target.checked }))}
        />
        Enabled
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={editForm.stackable}
          onChange={(e) => setEditForm((p) => ({ ...p, stackable: e.target.checked }))}
        />
        Stackable
      </label>
      <SheetFooter>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </SheetFooter>
    </form>
  );
}

export default function AdminCouponsPage() {
  const coupons = useQuery(api.coupons.listCoupons);
  const createCoupon = useMutation(api.coupons.createCoupon);
  const updateCoupon = useMutation(api.coupons.updateCoupon);
  const deleteCoupon = useMutation(api.coupons.deleteCoupon);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<Id<"coupons"> | null>(null);
  const [editingCoupon, setEditingCoupon] = useState<{
    _id: Id<"coupons">;
    code: string;
    type: "percent" | "fixed" | "free_delivery";
    value: number;
    minSubtotalCents?: number;
    maxRedemptions?: number;
    maxRedemptionsPerCustomer?: number;
    enabled: boolean;
    stackable: boolean;
  } | null>(null);
  const [form, setForm] = useState({
    code: "",
    type: "percent" as "percent" | "fixed" | "free_delivery",
    value: "10",
    minSubtotal: "0",
    maxRedemptions: "",
    maxRedemptionsPerCustomer: "",
    enabled: true,
    stackable: false,
  });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Coupons</h1>
        <p className="text-sm text-muted-foreground">
          Create and manage discount codes.
        </p>
        {message ? <Badge variant="secondary">{message}</Badge> : null}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Create Coupon</CardTitle>
            <CardDescription>Set up a new discount code</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="code">Code</Label>
            <Input
              id="code"
              value={form.code}
              onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <select
              id="type"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.type}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  type: event.target.value as "percent" | "fixed" | "free_delivery",
                }))
              }
            >
              <option value="percent">Percentage off</option>
              <option value="fixed">Fixed amount off</option>
              <option value="free_delivery">Free delivery</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="value">Value</Label>
            <Input
              id="value"
              type="number"
              value={form.value}
              onChange={(event) => setForm((prev) => ({ ...prev, value: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minSubtotal">Min subtotal ($)</Label>
            <Input
              id="minSubtotal"
              type="number"
              step="0.01"
              value={form.minSubtotal}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, minSubtotal: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxRedemptions">Max redemptions</Label>
            <Input
              id="maxRedemptions"
              type="number"
              value={form.maxRedemptions}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, maxRedemptions: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxPerCustomer">Max per customer</Label>
            <Input
              id="maxPerCustomer"
              type="number"
              value={form.maxRedemptionsPerCustomer}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, maxRedemptionsPerCustomer: event.target.value }))
              }
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => setForm((prev) => ({ ...prev, enabled: event.target.checked }))}
            />
            Enabled
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.stackable}
              onChange={(event) => setForm((prev) => ({ ...prev, stackable: event.target.checked }))}
            />
            Stackable
          </label>
          <div className="sm:col-span-2">
            <Button
              onClick={async () => {
                try {
                  await createCoupon({
                    code: form.code,
                    type: form.type,
                    value: Number(form.value),
                    minSubtotalCents: Number(form.minSubtotal) ? Math.round(Number(form.minSubtotal) * 100) : undefined,
                    maxRedemptions: Number(form.maxRedemptions) || undefined,
                    maxRedemptionsPerCustomer:
                      Number(form.maxRedemptionsPerCustomer) || undefined,
                    stackable: form.stackable,
                    enabled: form.enabled,
                  });
                  setMessage("Coupon created.");
                  setForm({
                    code: "",
                    type: "percent",
                    value: "10",
                    minSubtotal: "0",
                    maxRedemptions: "",
                    maxRedemptionsPerCustomer: "",
                    enabled: true,
                    stackable: false,
                  });
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : "Create failed");
                }
              }}
            >
              Create coupon
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Coupons</CardTitle>
          <CardDescription>Configured coupon list</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(coupons ?? []).map((coupon) => (
            <div key={coupon._id} className="flex items-center justify-between gap-2 rounded border p-3 text-sm">
              <div>
                <p className="font-medium">{coupon.code}</p>
                <p className="text-xs text-muted-foreground">
                  {coupon.type === "percent"
                    ? `${coupon.value}% off`
                    : coupon.type === "fixed"
                      ? `$${(coupon.value / 100).toFixed(2)} off`
                      : "Free delivery"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={coupon.enabled ? "default" : "outline"}>
                  {coupon.enabled ? "enabled" : "disabled"}
                </Badge>
                <Sheet open={editingCoupon?._id === coupon._id} onOpenChange={(open) => !open && setEditingCoupon(null)}>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm" onClick={() => setEditingCoupon({
                      _id: coupon._id,
                      code: coupon.code,
                      type: coupon.type,
                      value: coupon.value,
                      minSubtotalCents: coupon.minSubtotalCents,
                      maxRedemptions: coupon.maxRedemptions,
                      maxRedemptionsPerCustomer: coupon.maxRedemptionsPerCustomer,
                      enabled: coupon.enabled,
                      stackable: coupon.stackable,
                    })}>
                      Edit
                    </Button>
                  </SheetTrigger>
                  <SheetContent>
                    <SheetHeader>
                      <SheetTitle>Edit coupon</SheetTitle>
                      <SheetDescription>Update {coupon.code}. Code cannot be changed.</SheetDescription>
                    </SheetHeader>
                    {editingCoupon?._id === coupon._id && (
                      <EditCouponForm
                        key={editingCoupon._id}
                        coupon={editingCoupon}
                        onSave={async (updates) => {
                          await updateCoupon({ couponId: coupon._id, ...updates });
                          setMessage("Coupon updated.");
                          setEditingCoupon(null);
                        }}
                        onError={(err) => setMessage(err instanceof Error ? err.message : "Update failed")}
                      />
                    )}
                  </SheetContent>
                </Sheet>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteConfirmId(coupon._id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <AlertDialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete coupon?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the coupon. Carts with this coupon applied will need to re-enter a valid code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deleteConfirmId) {
                  await deleteCoupon({ couponId: deleteConfirmId });
                  setMessage("Coupon deleted.");
                  setDeleteConfirmId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
