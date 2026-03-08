"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";

import { api } from "../../../../../convex/_generated/api";
import { productDisplayName } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DeliveryMap } from "@/components/DeliveryMap";

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
  const token = params.token as string;
  const order = useQuery(api.orders.getByToken, { token });
  const deliveryTracking = useQuery(
    api.orders.getDeliveryTrackingByToken,
    order?.fulfillmentMode === "delivery" ? { token } : "skip"
  );

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
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="animate-fade-in-up space-y-2">
        <h1 className="font-display text-4xl text-brand-text">Order Status</h1>
        <p className="text-sm text-muted-foreground">
          Order #{order.orderNumber} &middot;{" "}
          <span className="capitalize">{order.fulfillmentMode}</span>
        </p>
        <Badge className="rounded-full">{order.status}</Badge>
      </header>

      {order.fulfillmentMode === "delivery" && deliveryTracking && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="font-display text-2xl text-brand-text">Delivery Tracking</CardTitle>
            <CardDescription>
              {deliveryTracking.driverName && `Driver: ${deliveryTracking.driverName}`}
              {deliveryTracking.eta && ` • ETA: ${deliveryTracking.eta}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeliveryMap
              driverLocation={deliveryTracking.latestLocation ?? undefined}
              destination={deliveryTracking.destination ?? undefined}
              className="h-64 w-full rounded-lg border"
            />
          </CardContent>
        </Card>
      )}

      {(order.carrier || order.trackingNumber) && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="font-display text-2xl text-brand-text">Shipping &amp; Tracking</CardTitle>
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
                    className="font-medium text-brand-text underline underline-offset-2 hover:text-brand-hover"
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

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="font-display text-2xl text-brand-text">Timeline</CardTitle>
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

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="font-display text-2xl text-brand-text">Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {order.items.map((item) => (
            <div key={item._id} className="flex items-center justify-between rounded border p-3">
              <div>
                <p className="font-medium">
                  {productDisplayName((item.productSnapshot as { name?: string })?.name ?? "") || "Item"}
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
