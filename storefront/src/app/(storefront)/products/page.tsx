"use client";

import Link from "next/link";
import { useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { productDisplayName } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductImage } from "@/components/ProductImage";

const MENU_DEFAULTS = {
  title: "Our Menu",
  subtitle: "Choose from our bundt cake selection. Select shape and extras.",
} as const;

export default function ProductsPage() {
  const products = useQuery(api.catalog.listProducts, {
    status: "active",
    inStockTodayOnly: false,
  });
  const settings = useSiteSettings();
  const contentLoading = settings.loading;
  const menuTitle = settings.get("contentMenuTitle") || MENU_DEFAULTS.title;
  const menuSubtitle = settings.get("contentMenuSubtitle") || MENU_DEFAULTS.subtitle;

  if (!products) {
    return (
      <main className="mx-auto w-full max-w-6xl p-6">
        <p className="text-sm text-muted-foreground">Loading products...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#faf8f5]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
        <header className="animate-fade-in-up space-y-2">
          {contentLoading ? (
            <>
              <div className="h-10 w-48 animate-pulse rounded bg-stone-300/50 sm:h-12 sm:w-56" />
              <div className="h-4 w-72 max-w-full animate-pulse rounded bg-stone-300/50 sm:w-96" />
            </>
          ) : (
            <>
              <h1 className="font-display text-4xl text-brand-text sm:text-5xl animate-title-shimmer">
                {menuTitle}
              </h1>
              <p className="text-stone-600">{menuSubtitle}</p>
            </>
          )}
        </header>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product, i) => (
            <Card
              key={product._id}
              className={`animate-scale-in stagger-${Math.min(i + 1, 6)} group h-full overflow-hidden rounded-2xl border-stone-200/80 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md`}
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-amber-50/30 p-3">
                <ProductImage
                  images={product.images}
                  name={product.name}
                  className="h-full w-full object-contain animate-menu-cake-spin transition-transform duration-300 group-hover:scale-105 group-hover:animate-none"
                />
              </div>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="font-display text-3xl text-brand-text line-clamp-2">
                  {productDisplayName(product.name)}
                </CardTitle>
                <div className="my-2 h-px bg-stone-200" />
                <p className="text-center text-lg font-bold text-brand-text">
                  ${(product.basePriceCents / 100).toFixed(2)}
                </p>
                <CardDescription className="line-clamp-2 text-left text-stone-600">
                  {product.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-6 pt-0">
                <Button
                  asChild
                  className="w-full rounded-lg bg-button py-6 text-sm font-medium uppercase tracking-wide text-stone-50 shadow-md transition-all hover:bg-button-hover active:scale-[0.98]"
                >
                  <Link href={`/products/${product._id}`}>Order</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </main>
  );
}
