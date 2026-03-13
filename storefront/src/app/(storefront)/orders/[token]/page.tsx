"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";

import { api } from "../../../../../convex/_generated/api";
import { productDisplayName } from "@/lib/utils";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DeliveryMap } from "@/components/DeliveryMap";
import { OrderStatusStepper } from "@/components/OrderStatusStepper";

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
  const settings = useSiteSettings();
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
      </header>

      <section className="space-y-3 sm:space-y-4">
        <h2 className="sr-only">Order progress</h2>
        <OrderStatusStepper order={order} />
      </section>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="font-display text-2xl text-brand-text">
            {order.fulfillmentMode === "pickup" ? "Where to pick up" : order.fulfillmentMode === "delivery" ? "Delivery address" : "Shipping address"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {order.fulfillmentMode === "pickup" ? (
            <p className="text-sm">
              {settings.get("storeAddress") || "Store address not set."}
            </p>
          ) : (
            <p className="text-sm">
              {order.addressFormatted || "Address not available."}
            </p>
          )}
        </CardContent>
      </Card>

      {order.fulfillmentMode === "delivery" && deliveryTracking && (
        <Card id="delivery" className="rounded-2xl scroll-mt-6">
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
          <CardTitle className="font-display text-2xl text-brand-text">Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {order.items.map((item) => {
            const name = productDisplayName((item.productSnapshot as { name?: string })?.name ?? "") || "Item";
            const variant = item.variantSnapshot
              ? (item.variantSnapshot as { label?: string }).label
              : null;
            const base = variant ? `${name} (${variant})` : name;
            const addons = (item.modifiersSnapshot ?? [])
              .map((m) => (m as { optionName?: string }).optionName)
              .filter(Boolean);
            const fullLine = addons.length > 0 ? `${base} + ${addons.join(", ")}` : base;
            return (
              <div key={item._id} className="flex items-center justify-between rounded border p-3">
                <div>
                  <p className="font-medium">{fullLine}</p>
                  <p className="text-xs text-muted-foreground">Qty {item.qty}</p>
                  {item.itemNote && (
                    <p className="mt-0.5 text-xs text-muted-foreground italic">Note: {item.itemNote}</p>
                  )}
                </div>
                <p className="font-medium">{dollars(item.unitPriceCents * item.qty)}</p>
              </div>
            );
          })}
          <div className="flex items-center justify-between border-t pt-3 font-semibold">
            <span>Total</span>
            <span>{dollars(order.pricingSnapshot.totalCents)}</span>
          </div>
        </CardContent>
      </Card>

    </main>
  );
}
