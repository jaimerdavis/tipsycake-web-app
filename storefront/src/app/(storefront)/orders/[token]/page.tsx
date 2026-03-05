"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";

import { api } from "../../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const CARRIER_TRACKING_URLS: Record<string, (num: string) => string> = {
  ups: (n) => `https://www.ups.com/track?tracknum=${n}`,
  fedex: (n) => `https://www.fedex.com/fedextrack/?trknbr=${n}`,
  usps: (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`,
};

function buildTrackingUrl(carrier: string, trackingNumber: string): string | null {
  const builder = CARRIER_TRACKING_URLS[carrier.toLowerCase()];
  if (builder) return builder(trackingNumber);
  return null;
}

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function OrderStatusByTokenPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const order = useQuery(api.orders.getByToken, { token });

  if (!order) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <p className="text-sm text-muted-foreground">Loading order status...</p>
      </main>
    );
  }

  const trackingUrl =
    order.carrier && order.trackingNumber
      ? buildTrackingUrl(order.carrier, order.trackingNumber)
      : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Order Status</h1>
        <p className="text-sm text-muted-foreground">
          Order #{order.orderNumber} &middot;{" "}
          <span className="capitalize">{order.fulfillmentMode}</span>
        </p>
        <Badge>{order.status}</Badge>
      </header>

      {(order.carrier || order.trackingNumber) && (
        <Card>
          <CardHeader>
            <CardTitle>Shipping &amp; Tracking</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {order.carrier && (
              <p>
                <span className="text-muted-foreground">Carrier:</span>{" "}
                <span className="font-medium uppercase">{order.carrier}</span>
              </p>
            )}
            {order.trackingNumber && (
              <p>
                <span className="text-muted-foreground">Tracking #:</span>{" "}
                {trackingUrl ? (
                  <a
                    href={trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-rose-600 underline underline-offset-2 hover:text-rose-700"
                  >
                    {order.trackingNumber}
                  </a>
                ) : (
                  <span className="font-medium">{order.trackingNumber}</span>
                )}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
          <CardDescription>Status updates for your order</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {order.events.map((event) => (
            <div key={event._id} className="flex items-center justify-between rounded border p-2 text-sm">
              <span className="capitalize">{event.status.replace(/_/g, " ")}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(event.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {order.items.map((item) => (
            <div key={item._id} className="flex items-center justify-between rounded border p-3">
              <div>
                <p className="font-medium">
                  {(item.productSnapshot as { name?: string })?.name ?? "Item"}
                </p>
                <p className="text-xs text-muted-foreground">Qty {item.qty}</p>
              </div>
              <p className="font-medium">{dollars(item.unitPriceCents * item.qty)}</p>
            </div>
          ))}
          <div className="flex items-center justify-between border-t pt-3 font-semibold">
            <span>Total</span>
            <span>{dollars(order.pricingSnapshot.totalCents)}</span>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
