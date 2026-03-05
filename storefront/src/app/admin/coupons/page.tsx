"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminCouponsPage() {
  const coupons = useQuery(api.coupons.listCoupons);
  const createCoupon = useMutation(api.coupons.createCoupon);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: "",
    type: "percent" as "percent" | "fixed" | "free_delivery",
    value: "10",
    minSubtotalCents: "0",
    maxRedemptions: "",
    maxRedemptionsPerCustomer: "",
    enabled: true,
    stackable: false,
  });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Coupons</h1>
        <p className="text-sm text-muted-foreground">
          Create and review coupons. Redemption is enforced atomically during order finalization.
        </p>
        {message ? <Badge variant="secondary">{message}</Badge> : null}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Create Coupon</CardTitle>
          <CardDescription>PRM-001 + PRM-003</CardDescription>
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
              <option value="percent">percent</option>
              <option value="fixed">fixed</option>
              <option value="free_delivery">free_delivery</option>
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
            <Label htmlFor="minSubtotal">Min subtotal (cents)</Label>
            <Input
              id="minSubtotal"
              type="number"
              value={form.minSubtotalCents}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, minSubtotalCents: event.target.value }))
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
                    minSubtotalCents: Number(form.minSubtotalCents) || undefined,
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
                    minSubtotalCents: "0",
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
            <div key={coupon._id} className="flex items-center justify-between rounded border p-3 text-sm">
              <div>
                <p className="font-medium">{coupon.code}</p>
                <p className="text-xs text-muted-foreground">
                  {coupon.type} • value {coupon.value}
                </p>
              </div>
              <Badge variant={coupon.enabled ? "default" : "outline"}>
                {coupon.enabled ? "enabled" : "disabled"}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
