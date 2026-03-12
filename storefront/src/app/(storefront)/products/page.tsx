"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";

import { api } from "../../../../convex/_generated/api";
import { ProductImage } from "@/components/ProductImage";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { ProductBadges } from "@/components/ProductBadge";
import { productDisplayName } from "@/lib/utils";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getOrCreateGuestSessionId } from "@/lib/guestSession";

function truncateToWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ");
}

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

  const settings = useSiteSettings();
  const menuTextUs = settings.get("contentMenuTextUs")?.trim() ?? "";
  const storePhone = settings.get("storePhone")?.trim();
  const smsHref = storePhone
    ? `sms:${storePhone.replace(/\D/g, "").length === 10 ? `+1${storePhone.replace(/\D/g, "")}` : storePhone.replace(/\D/g, "")}`
    : null;
  const showTextUsBlock = !!smsHref;
  const textUsLabel = menuTextUs || "Questions? Click here to send us a Text";

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

  if (!products) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-rose-100/70 via-stone-50/80 to-white p-6 pb-safe">
        <p className="text-sm text-stone-500">Loading products...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-100/70 via-stone-50/80 to-white pb-28 sm:pb-safe">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-3 py-4 sm:gap-6 sm:px-6 sm:py-6">
        <section className="relative z-0 grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-4 lg:grid-cols-2">
          {(products ?? []).map((product, i) => {
            const qty = qtyByProduct[product._id as string] ?? 0;
            const cartItemId = cartItemIdByProduct[product._id as string];

            return (
              <Card
                key={product._id}
                className={cn(
                  "group flex h-full flex-col overflow-hidden rounded-lg bg-gradient-to-b from-amber-50/90 via-rose-50/80 to-stone-100/90 shadow-[0_6px_20px_rgba(0,0,0,0.05)] transition-all duration-200 active:scale-[0.98] sm:rounded-xl",
                  `animate-scale-in stagger-${Math.min(i + 1, 6)}`
                )}
              >
                <Link href={`/products/${product._id}`} className="flex flex-1 flex-col">
                  <CardHeader className="p-3 pb-1 pt-3 sm:p-4 sm:pt-4 sm:pb-2">
                    <CardTitle className="font-display text-lg font-bold text-amber-950 line-clamp-1 sm:text-xl lg:text-[1.35rem]">
                      {productDisplayName(product.name)}
                    </CardTitle>
                    {(() => {
                      const p = product as { description?: string; shortDescription?: string };
                      const teaser = p.shortDescription?.trim()
                        || (p.description ? truncateToWords(p.description, 8) : "");
                      if (!teaser) return null;
                      return (
                        <p className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">
                          {teaser}
                        </p>
                      );
                    })()}
                  </CardHeader>
                    <div className="relative p-3 pt-1 sm:p-4 sm:pt-2">
                    <ProductBadges badges={(product as { badges?: string[] }).badges} size="sm" className="absolute left-1 top-1 z-10" />
                    <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-gradient-to-br from-rose-100/50 via-stone-100/90 to-amber-100/30 p-2 sm:p-3">
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
                      className="h-6 rounded-full bg-brand px-2.5 text-xs text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.08),inset_0_-2px_4px_rgba(0,0,0,0.18)] hover:bg-brand-hover"
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

        {showTextUsBlock && smsHref && (
          <div className="flex justify-center pt-6">
            <Button asChild variant="outline" size="sm" className="rounded-full shadow-sm">
              <a href={smsHref}>{textUsLabel}</a>
            </Button>
          </div>
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
