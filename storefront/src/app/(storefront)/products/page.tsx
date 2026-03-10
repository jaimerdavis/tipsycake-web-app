"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";

import { api } from "../../../../convex/_generated/api";
import { FulfillmentBar } from "@/components/FulfillmentBar";
import { ProductImage } from "@/components/ProductImage";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { productDisplayName } from "@/lib/utils";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getOrCreateGuestSessionId } from "@/lib/guestSession";
import {
  getPreferredFulfillment,
  type FulfillmentMode,
} from "@/lib/fulfillmentPreference";

export default function ProductsPage() {
  const [guestSessionId, setGuestSessionId] = useState("");
  useEffect(() => {
    setGuestSessionId(getOrCreateGuestSessionId());
  }, []);

  const products = useQuery(api.catalog.listProducts, {
    status: "active",
    inStockTodayOnly: false,
  });
  const cart = useQuery(
    api.cart.getActive,
    guestSessionId ? { guestSessionId } : "skip"
  );
  const updateItem = useMutation(api.cart.updateItem);
  const setFulfillment = useMutation(api.checkout.setFulfillment);

  const settings = useSiteSettings();
  const heroImageUrl = settings.get("heroImageUrl")?.trim();
  const menuTextUs = settings.get("contentMenuTextUs")?.trim() ?? "";
  const storePhone = settings.get("storePhone")?.trim();
  const smsHref = storePhone
    ? `sms:${storePhone.replace(/\D/g, "").length === 10 ? `+1${storePhone.replace(/\D/g, "")}` : storePhone.replace(/\D/g, "")}`
    : null;
  const showTextUsBlock = menuTextUs.length > 0;

  const { qtyByProduct, cartItemIdByProduct } = useMemo(() => {
    const qtyBy: Record<string, number> = {};
    const idBy: Record<string, Id<"cartItems">> = {};
    if (!cart?.items) return { qtyByProduct: qtyBy, cartItemIdByProduct: idBy };
    for (const item of cart.items) {
      const pid = item.productId as string;
      qtyBy[pid] = (qtyBy[pid] ?? 0) + item.qty;
      if (!idBy[pid]) idBy[pid] = item._id;
    }
    return { qtyByProduct: qtyBy, cartItemIdByProduct: idBy };
  }, [cart?.items]);

  const hasCartItems = (cart?.items?.length ?? 0) > 0;
  const cartTotalCents = cart?.pricing?.totalCents ?? 0;

  const [storedMode, setStoredMode] = useState<FulfillmentMode | null>(() =>
    getPreferredFulfillment()
  );
  const currentMode: FulfillmentMode | null =
    cart?.fulfillmentMode ?? storedMode ?? null;

  const handleSelect = useCallback(
    async (mode: FulfillmentMode) => {
      setStoredMode(mode);
      if (mode === "pickup" && cart?._id) {
        await setFulfillment({ cartId: cart._id, mode: "pickup" });
      }
    },
    [cart?._id, setFulfillment]
  );

  if (!products) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-rose-100/70 via-stone-50/80 to-white p-6 pb-safe">
        <p className="text-sm text-stone-500">Loading products...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-100/70 via-stone-50/80 to-white pb-28 sm:pb-safe">
      {/* Hero image — flows from top, seamless fade into content */}
      {heroImageUrl ? (
        <div className="relative -mb-4 h-40 w-full overflow-hidden sm:h-52 md:h-60">
          <img
            src={heroImageUrl}
            alt=""
            className="h-full w-full object-cover object-center"
          />
          <div
            className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-rose-100/90 via-rose-50/50 to-transparent sm:h-24"
            aria-hidden
          />
        </div>
      ) : null}

      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-3 py-4 sm:gap-6 sm:px-6 sm:py-6">
        {/* Fulfillment selector bar — compact, not full width on desktop */}
        <div className="w-full sm:mx-auto sm:max-w-sm">
          <FulfillmentBar
            cartId={cart?._id ?? null}
            currentMode={currentMode}
            onSelect={handleSelect}
          />
        </div>

        <section className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {(products ?? []).map((product, i) => {
            const qty = qtyByProduct[product._id as string] ?? 0;
            const cartItemId = cartItemIdByProduct[product._id as string];

            return (
              <Card
                key={product._id}
                className={cn(
                  "group flex h-full flex-col overflow-hidden rounded-xl bg-white shadow-md transition-all duration-200 active:scale-[0.98] sm:rounded-2xl",
                  `animate-scale-in stagger-${Math.min(i + 1, 6)}`
                )}
              >
                <Link href={`/products/${product._id}`} className="flex flex-1 flex-col">
                  <div className="p-3 sm:p-4">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-gradient-to-br from-rose-100/50 via-stone-100/90 to-amber-100/30 p-2 sm:p-3">
                      <ProductImage
                      images={product.images}
                      name={product.name}
                      className={cn(
                        "h-full w-full object-contain transition-transform duration-300 group-active:scale-105 group-active:animate-none sm:group-hover:scale-105 sm:group-hover:animate-none",
                        i % 2 === 0 ? "animate-menu-cake-spin" : "animate-menu-cake-spin-reverse"
                      )}
                    />
                    </div>
                  </div>
                  <CardHeader className="flex-1 p-3 pb-2 pt-2 sm:p-4 sm:pt-4 sm:pb-2">
                    <CardTitle className="font-display text-base font-bold text-stone-900 line-clamp-2 sm:text-xl lg:text-2xl">
                      {productDisplayName(product.name)}
                    </CardTitle>
                  </CardHeader>
                </Link>

                <div className="flex items-center justify-between gap-2 p-3 pt-2 sm:p-4 sm:pt-3">
                  <p className="text-sm font-bold text-brand-text sm:text-base">
                    ${(product.basePriceCents / 100).toFixed(2)}
                  </p>
                  {qty > 0 && cartItemId ? (
                    <div className="flex items-center gap-1 rounded-full bg-brand px-2 py-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.08),inset_0_-2px_4px_rgba(0,0,0,0.18)]">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 shrink-0 rounded-full p-0 text-white hover:bg-brand-hover hover:text-white"
                        onClick={() =>
                          updateItem({
                            cartItemId,
                            qty: Math.max(0, qty - 1),
                          })
                        }
                      >
                        −
                      </Button>
                      <span className="min-w-[1.25rem] text-center text-xs font-medium text-white">
                        {qty}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 shrink-0 rounded-full p-0 text-white hover:bg-brand-hover hover:text-white"
                        onClick={() =>
                          updateItem({
                            cartItemId,
                            qty: qty + 1,
                          })
                        }
                      >
                        +
                      </Button>
                    </div>
                  ) : (
                    <Button
                      asChild
                      size="sm"
                      className="h-8 rounded-full bg-brand px-4 text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.08),inset_0_-2px_4px_rgba(0,0,0,0.18)] hover:bg-brand-hover"
                    >
                      <Link href={`/products/${product._id}`}>+ Add</Link>
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </section>

        {(products ?? []).length === 0 && (
          <p className="py-8 text-center text-sm text-stone-500">
            No products available.
          </p>
        )}

        {showTextUsBlock && (
          <p className="pt-6 text-center">
            {smsHref ? (
              <a
                href={smsHref}
                className="text-sm font-medium text-brand-text underline-offset-4 hover:underline"
              >
                {menuTextUs}
              </a>
            ) : (
              <span className="text-sm font-medium text-stone-600">{menuTextUs}</span>
            )}
          </p>
        )}
      </div>

      {hasCartItems && (
        <Link
          href="/cart"
          className="fixed bottom-14 left-0 right-0 z-50 flex items-center justify-between bg-brand px-6 py-4 text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.08),inset_0_-2px_4px_rgba(0,0,0,0.18)] transition-colors hover:bg-brand-hover sm:bottom-0 sm:pb-safe"
        >
          <span className="font-medium">View Cart</span>
          <span className="font-bold">${(cartTotalCents / 100).toFixed(2)}</span>
        </Link>
      )}
    </div>
  );
}
