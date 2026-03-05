"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function getOrCreateGuestSessionId() {
  const key = "tipsycake_guest_session_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = `guest_${crypto.randomUUID()}`;
  window.localStorage.setItem(key, created);
  return created;
}

export default function CartPage() {
  const guestSessionId = useMemo(() => {
    if (typeof window === "undefined") return "";
    return getOrCreateGuestSessionId();
  }, []);
  const [couponCode, setCouponCode] = useState("");
  const [tipInput, setTipInput] = useState("0");

  const cart = useQuery(
    api.cart.getActive,
    guestSessionId ? { guestSessionId } : "skip"
  );

  const updateItem = useMutation(api.cart.updateItem);
  const removeItem = useMutation(api.cart.removeItem);
  const applyCoupon = useMutation(api.cart.applyCoupon);
  const removeCoupon = useMutation(api.cart.removeCoupon);
  const setTip = useMutation(api.cart.setTip);

  const totals = useMemo(() => {
    if (!cart) return null;
    return cart.pricing;
  }, [cart]);

  if (!guestSessionId) {
    return (
      <main className="mx-auto w-full max-w-4xl p-6">
        <p className="text-sm text-muted-foreground">Preparing cart session...</p>
      </main>
    );
  }

  if (!cart) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Your Cart</h1>
        <p className="text-sm text-muted-foreground">No active cart yet.</p>
        <Button asChild className="w-fit">
          <Link href="/products">Browse products</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Your Cart</h1>
        <p className="text-sm text-muted-foreground">
          Server-side totals are calculated from item snapshots.
        </p>
      </header>

      <section className="grid gap-4">
        {cart.items.map((item) => (
          <Card key={item._id}>
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">Product ID: {item.productId}</p>
                <p className="text-xs text-muted-foreground">
                  Unit snapshot: {item.unitPriceSnapshotCents} cents
                </p>
                <p className="text-xs text-muted-foreground">Qty: {item.qty}</p>
                {item.itemNote ? <p className="text-xs">Note: {item.itemNote}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await updateItem({ cartItemId: item._id, qty: Math.max(1, item.qty - 1) });
                  }}
                >
                  -
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await updateItem({ cartItemId: item._id, qty: item.qty + 1 });
                  }}
                >
                  +
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={async () => {
                    await removeItem({ cartItemId: item._id });
                  }}
                >
                  Remove
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Coupon</CardTitle>
            <CardDescription>Coupon engine deep validation comes in PRM tasks.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="coupon">Code</Label>
              <Input
                id="coupon"
                value={couponCode}
                onChange={(event) => setCouponCode(event.target.value)}
                placeholder="WELCOME10"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={async () => {
                  await applyCoupon({ cartId: cart._id, code: couponCode });
                  setCouponCode("");
                }}
              >
                Apply
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  await removeCoupon({ cartId: cart._id });
                }}
              >
                Remove
              </Button>
            </div>
            <Badge variant="outline">
              Current: {cart.appliedCouponCode ?? "none"}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tip</CardTitle>
            <CardDescription>Set tip in cents (PAY-002).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="tip">Tip cents</Label>
              <Input
                id="tip"
                type="number"
                value={tipInput}
                onChange={(event) => setTipInput(event.target.value)}
              />
            </div>
            <Button
              onClick={async () => {
                await setTip({
                  cartId: cart._id,
                  amount: Number(tipInput),
                });
              }}
            >
              Save tip
            </Button>
          </CardContent>
        </Card>
      </section>

      {totals ? (
        <Card>
          <CardHeader>
            <CardTitle>Totals</CardTitle>
            <CardDescription>Computed server-side from pricing snapshot rules.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p>Subtotal: {totals.subtotalCents} cents</p>
            <p>Discounts: {totals.discountCents} cents</p>
            <p>Delivery fee: {totals.deliveryFeeCents} cents</p>
            <p>Shipping fee: {totals.shippingFeeCents} cents</p>
            <p>Tip: {totals.tipCents} cents</p>
            <p>Tax (stored): {totals.taxCents} cents</p>
            <p className="text-base font-semibold">Total: {totals.totalCents} cents</p>
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
