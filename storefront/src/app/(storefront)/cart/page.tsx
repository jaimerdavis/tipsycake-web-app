"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductImage } from "@/components/ProductImage";

import { getOrCreateGuestSessionId } from "@/lib/guestSession";
import { productDisplayName } from "@/lib/utils";

export default function CartPage() {
  const searchParams = useSearchParams();
  const restoreCartId = searchParams.get("restore");
  const [guestSessionId, setGuestSessionId] = useState("");
  useEffect(() => {
    setGuestSessionId(getOrCreateGuestSessionId());
  }, []);
  const [couponCode, setCouponCode] = useState("");
  const [couponMessage, setCouponMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [tipInput, setTipInput] = useState("0.00");

  const restoreAbandonedCart = useMutation(api.cart.restoreAbandonedCart);

  useEffect(() => {
    if (!restoreCartId || !guestSessionId) return;
    restoreAbandonedCart({
      cartId: restoreCartId as Id<"carts">,
      guestSessionId,
    })
      .then(() => {
        window.history.replaceState({}, "", "/cart");
      })
      .catch(() => {});
  }, [restoreCartId, guestSessionId, restoreAbandonedCart]);

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
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 sm:px-6">
        <h1 className="font-display text-4xl text-brand-text">Nothing in the oven yet</h1>
        <p className="text-sm text-muted-foreground">Your cart is empty.</p>
        <Button asChild className="w-fit rounded-full bg-button text-stone-50 hover:bg-button-hover transition-all active:scale-[0.97]">
          <Link href="/products">Browse cakes</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="animate-fade-in-up space-y-2">
        <h1 className="font-display text-4xl text-brand-text sm:text-5xl">Cake Order Summary</h1>
        <p className="text-sm text-muted-foreground">
          Review your items before checkout.
        </p>
      </header>

      <section className="grid gap-4">
        {cart.items.map((item, i) => (
          <Card key={item._id} className={`animate-fade-in-up stagger-${Math.min(i + 1, 6)} rounded-2xl transition-shadow duration-200 hover:shadow-md`}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl">
                  <ProductImage
                    images={item.productImages}
                    name={item.productName}
                    className="h-full w-full object-cover animate-slow-spin"
                  />
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="font-display text-2xl text-brand-text">{productDisplayName(item.productName ?? "")}</p>
                  <p className="text-sm text-muted-foreground">
                    ${(item.unitPriceSnapshotCents / 100).toFixed(2)} each
                  </p>
                  {item.itemNote && (
                    <p className="text-xs text-muted-foreground italic">Note: {item.itemNote}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-xl transition-all active:scale-95"
                    onClick={async () => {
                      await updateItem({ cartItemId: item._id, qty: Math.max(1, item.qty - 1) });
                    }}
                  >
                    -
                  </Button>
                  <span className="w-8 text-center text-sm font-medium tabular-nums">
                    {item.qty}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-xl transition-all active:scale-95"
                    onClick={async () => {
                      await updateItem({ cartItemId: item._id, qty: item.qty + 1 });
                    }}
                  >
                    +
                  </Button>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="rounded-full"
                    asChild
                  >
                    <Link href={`/products/${item.productId}?cartItemId=${item._id}`}>Modify</Link>
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="rounded-full"
                      >
                        Remove
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-2xl">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-display text-2xl text-brand-text">Remove item?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to remove <span className="font-medium">{productDisplayName(item.productName ?? "")}</span> from your order? This can&apos;t be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-full">Keep it</AlertDialogCancel>
                        <AlertDialogAction
                          className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={async () => {
                            await removeItem({ cartItemId: item._id });
                          }}
                        >
                          Yes, remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        <Button variant="outline" asChild className="w-fit rounded-full transition-all duration-200 active:scale-[0.97]">
          <Link href="/products">Add more cakes</Link>
        </Button>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="font-display text-2xl text-brand-text">Coupon</CardTitle>
            <CardDescription>Apply a discount code to your order</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setCouponMessage(null);
                if (!couponCode.trim()) {
                  setCouponMessage({ text: "Please enter a coupon code.", error: true });
                  return;
                }
                try {
                  await applyCoupon({ cartId: cart._id, code: couponCode });
                  setCouponMessage({ text: "Coupon applied!", error: false });
                  setCouponCode("");
                } catch (err) {
                  setCouponMessage({
                    text: err instanceof Error ? err.message : "Invalid coupon code.",
                    error: true,
                  });
                }
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="coupon">Code</Label>
                <Input
                  id="coupon"
                  className="rounded-xl"
                  value={couponCode}
                  onChange={(event) => setCouponCode(event.target.value)}
                  placeholder="Enter code"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  className="rounded-full bg-button text-stone-50 hover:bg-button-hover transition-all active:scale-[0.97]"
                >
                Apply
              </Button>
              {cart.appliedCouponCode && (
                <Button
                  variant="outline"
                  className="rounded-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={async () => {
                    await removeCoupon({ cartId: cart._id });
                    setCouponMessage({ text: "Coupon removed.", error: false });
                  }}
                >
                  &times; Remove coupon
                </Button>
              )}
            </div>
            {couponMessage && (
              <p className={`text-sm ${couponMessage.error ? "text-red-600" : "text-green-600"}`}>
                {couponMessage.text}
              </p>
            )}
            {cart.appliedCouponCode && (
              <Badge variant="outline" className="rounded-full bg-green-50 text-green-700 border-green-200">
                Applied: {cart.appliedCouponCode}
              </Badge>
            )}
            </form>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="font-display text-2xl text-brand-text">Tip</CardTitle>
            <CardDescription>Add a tip to your order.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="tip">Tip ($)</Label>
              <Input
                id="tip"
                type="text"
                inputMode="decimal"
                className="rounded-xl"
                placeholder="0.00"
                value={tipInput}
                onChange={(event) => {
                  const v = event.target.value;
                  if (v === "") {
                    setTipInput("");
                    return;
                  }
                  if (/^\d*\.?\d{0,2}$/.test(v)) {
                    setTipInput(v);
                  }
                }}
                onBlur={() => {
                  const parsed = parseFloat(tipInput);
                  if (Number.isNaN(parsed) || parsed < 0) {
                    setTipInput("0.00");
                  } else {
                    setTipInput(parsed.toFixed(2));
                  }
                }}
              />
            </div>
            <div className="flex gap-2">
              <Button
                className="rounded-full bg-button text-stone-50 hover:bg-button-hover transition-all active:scale-[0.97]"
                onClick={async () => {
                  const cents = Math.max(0, Math.round((parseFloat(tipInput) || 0) * 100));
                  await setTip({
                    cartId: cart._id,
                    amount: cents,
                  });
                  setTipInput((cents / 100).toFixed(2));
                }}
              >
                Save tip
              </Button>
              {cart.tipCents > 0 && (
                <Button
                  variant="outline"
                  className="rounded-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={async () => {
                    await setTip({ cartId: cart._id, amount: 0 });
                    setTipInput("0.00");
                  }}
                >
                  &times; Remove tip
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {totals ? (
        <Card className="animate-fade-in-up stagger-3 rounded-2xl">
          <CardHeader>
            <CardTitle className="font-display text-2xl text-brand-text">Order Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-1.5 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>${(totals.subtotalCents / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>
                  {cart.fulfillmentMode === "pickup"
                    ? "Pickup"
                    : "Delivery / Shipping"}
                </span>
                <span>
                  {cart.fulfillmentMode === "pickup" ? "$0" : "TBD"}
                </span>
              </div>
              {totals.discountCents > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount</span>
                  <span>-${(totals.discountCents / 100).toFixed(2)}</span>
                </div>
              )}
              {totals.tipCents > 0 && (
                <div className="flex justify-between">
                  <span>Tip</span>
                  <span>${(totals.tipCents / 100).toFixed(2)}</span>
                </div>
              )}
              {totals.taxCents > 0 && (
                <div className="flex justify-between">
                  <span>Tax</span>
                  <span>${(totals.taxCents / 100).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2 text-base font-semibold">
                <span>Total</span>
                <span>${(totals.totalCents / 100).toFixed(2)}</span>
              </div>
            </div>
            <Button asChild className="w-full rounded-full bg-button text-stone-50 hover:bg-button-hover transition-all duration-200 active:scale-[0.97]" size="lg">
              <Link href="/checkout">Proceed to checkout</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
