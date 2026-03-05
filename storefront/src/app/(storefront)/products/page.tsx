"use client";

import Link from "next/link";
import { useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductImage } from "@/components/ProductImage";

export default function ProductsPage() {
  const products = useQuery(api.catalog.listProducts, {
    status: "active",
    inStockTodayOnly: false,
  });

  if (!products) {
    return (
      <main className="mx-auto w-full max-w-6xl p-6">
        <p className="text-sm text-muted-foreground">Loading products...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Our Menu</h1>
        <p className="text-muted-foreground">
          Browse our handcrafted selection. Customize flavors, sizes, and toppings.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <Card key={product._id} className="group h-full overflow-hidden">
            <div className="relative aspect-[4/3] overflow-hidden">
              <ProductImage
                images={product.images}
                name={product.name}
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
              {product.inStockToday && (
                <Badge className="absolute top-2 right-2 bg-emerald-600 text-white">
                  In stock today
                </Badge>
              )}
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="line-clamp-1">{product.name}</CardTitle>
              <CardDescription className="line-clamp-2">{product.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-lg font-semibold">
                  ${(product.basePriceCents / 100).toFixed(2)}
                </p>
                <div className="flex gap-1">
                  {product.fulfillmentFlags.pickup && <Badge variant="outline" className="text-xs">Pickup</Badge>}
                  {product.fulfillmentFlags.delivery && <Badge variant="outline" className="text-xs">Delivery</Badge>}
                  {product.fulfillmentFlags.shipping && <Badge variant="outline" className="text-xs">Shipping</Badge>}
                </div>
              </div>
              <Button asChild className="w-full">
                <Link href={`/products/${product._id}`}>Customize &amp; Order</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
