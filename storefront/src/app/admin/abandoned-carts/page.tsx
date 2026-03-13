"use client";

import Link from "next/link";
import { useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AbandonedCartsPage() {
  const list = useQuery(api.admin.analytics.listAbandonedCarts);
  const settings = useSiteSettings();
  const siteUrl = (settings.get("siteUrl") || "").trim() || undefined;
  const baseUrl = siteUrl ?? (typeof window !== "undefined" ? window.location.origin : "");

  if (list === undefined) {
    return (
      <div className="px-4 py-6 sm:px-6">
        <p className="text-sm text-muted-foreground">Loading abandoned carts…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Abandoned Carts</h1>
        <p className="text-sm text-muted-foreground">
          Carts that were left without checkout. Send customers a restore link to recover sales.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Cart list</CardTitle>
          <CardDescription>
            {list.length === 0
              ? "No abandoned carts"
              : `${list.length} abandoned cart${list.length === 1 ? "" : "s"}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">No abandoned carts found.</p>
          ) : (
            <div className="space-y-3">
              {list.map((row) => (
                <div
                  key={row.cartId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="flex flex-col gap-1">
                    {row.contactEmail && (
                      <span className="text-sm font-medium">{row.contactEmail}</span>
                    )}
                    {row.contactPhone && (
                      <span className="text-sm text-muted-foreground">{row.contactPhone}</span>
                    )}
                    {!row.contactEmail && !row.contactPhone && (
                      <span className="text-sm text-muted-foreground">No contact</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {row.itemCount} item{row.itemCount === 1 ? "" : "s"} · abandoned{" "}
                      {formatRelativeTime(row.updatedAt)}
                    </span>
                  </div>
                  <Link
                    href={`/cart?restore=${row.cartId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Open restore link
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatRelativeTime(ms: number): string {
  const now = Date.now();
  const diff = now - ms;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
