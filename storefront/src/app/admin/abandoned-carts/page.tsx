"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString();
}

export default function AbandonedCartsPage() {
  const carts = useQuery(api.admin.analytics.listAbandonedCarts);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Abandoned Carts</h1>
        <p className="text-sm text-muted-foreground">
          Carts left without checkout. Recovery emails are sent automatically.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Abandoned Carts</CardTitle>
          <CardDescription>
            Last 100 abandoned carts, newest first
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!carts ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : carts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No abandoned carts.</p>
          ) : (
            <div className="space-y-3">
              {carts.map((cart) => (
                <div
                  key={cart._id}
                  className="flex flex-col gap-1 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {cart.contactEmail || "No email"}
                      {cart.contactPhone ? ` · ${cart.contactPhone}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {cart.productSummary}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {cart.itemCount} item(s) · {dollars(cart.subtotalCents)}
                      {cart.appliedCouponCode ? (
                        <> · Coupon: {cart.appliedCouponCode}</>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 sm:shrink-0">
                    <Badge variant="outline" className="text-xs">
                      {formatDate(cart.updatedAt)}
                    </Badge>
                    <Link href="/products">
                      <span className="text-xs text-primary hover:underline">
                        View products
                      </span>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        <Link href="/admin/analytics" className="text-primary hover:underline">
          Analytics
        </Link>{" "}
        shows cart funnel metrics.{" "}
        <Link href="/admin/settings/email" className="text-primary hover:underline">
          Email Settings
        </Link>{" "}
        configures abandoned cart recovery.
      </p>
    </div>
  );
}
