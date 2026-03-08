"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CARRIERS = ["UPS", "FedEx", "USPS"] as const;

const FULFILLMENT_FILTERS = [
  { value: "all", label: "All fulfillment" },
  { value: "pickup", label: "Pickup" },
  { value: "delivery", label: "Delivery" },
  { value: "shipping", label: "Shipping" },
] as const;

const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "paid_confirmed", label: "Paid / New" },
  { value: "ready_for_pickup", label: "Ready for pickup" },
  { value: "ready_for_delivery", label: "Ready for delivery" },
  { value: "in_production", label: "In production" },
  { value: "out_for_delivery", label: "Out for delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "shipped", label: "Shipped" },
  { value: "completed", label: "Completed" },
] as const;

export default function AdminOrdersPage() {
  const [fulfillmentFilter, setFulfillmentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [debugEmail, setDebugEmail] = useState("jaime.davis@designdevelopnow.com");

  const orders = useQuery(api.admin.orders.list, {
    fulfillmentMode:
      fulfillmentFilter === "all"
        ? undefined
        : (fulfillmentFilter as "pickup" | "delivery" | "shipping"),
    status: statusFilter === "all" ? undefined : statusFilter,
  });
  const drivers = useQuery(api.admin.drivers.list);
  const debugLookup = useQuery(
    api.admin.orders.debugEmailLookup,
    debugEmail.trim() ? { email: debugEmail.trim() } : "skip"
  );
  const updateStatus = useMutation(api.admin.orders.updateStatus);
  const markReadyForDelivery = useMutation(api.admin.orders.markReadyForDelivery);
  const assignDriver = useMutation(api.admin.orders.assignDriver);
  const setTracking = useMutation(api.admin.orders.setTracking);

  const [statusValue, setStatusValue] = useState("in_production");
  const [note, setNote] = useState("");
  const [trackingCarrier, setTrackingCarrier] = useState("UPS");
  const [trackingNumber, setTrackingNumber] = useState("");

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Orders</h1>
        <p className="text-sm text-muted-foreground">
          Update status, assign drivers, and set shipping tracking.
        </p>
      </header>

      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="fulfillment-filter" className="whitespace-nowrap">
            Fulfillment
          </Label>
          <Select value={fulfillmentFilter} onValueChange={setFulfillmentFilter}>
            <SelectTrigger id="fulfillment-filter" className="w-[160px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              {FULFILLMENT_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="status-filter" className="whitespace-nowrap">
            Status
          </Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger id="status-filter" className="w-[180px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((f) => (
                <SelectItem key={f.value || "all"} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Debug: lookup orders by email (for account linking issues) */}
      <Card className="border-amber-200 bg-amber-50/50">
        <CardHeader>
          <CardTitle className="text-base">Debug: Order lookup by email</CardTitle>
          <CardDescription>
            Check if orders exist for an email and whether they&apos;re linked to a user. Use when orders don&apos;t show on /account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Enter email (e.g. jaime.davis@designdevelopnow.com)"
              value={debugEmail}
              onChange={(e) => setDebugEmail(e.target.value)}
              className="max-w-md"
            />
          </div>
          {debugLookup && (
            <div className="rounded border bg-white p-3 text-sm">
              <p className="font-medium mb-2">
                Orders with contactEmail &quot;{debugLookup.orders[0]?.contactEmail ?? debugEmail.trim().toLowerCase()}&quot;: {debugLookup.orders.length}
              </p>
              {debugLookup.orders.length === 0 ? (
                <p className="text-muted-foreground">
                  No orders found. The order may use a different email, or contactEmail wasn&apos;t saved.
                </p>
              ) : (
                <ul className="space-y-1">
                  {debugLookup.orders.map((o) => (
                    <li key={o._id}>
                      {o.orderNumber} — userId: {o.userId ?? "null (not linked)"} — {o.status}
                    </li>
                  ))}
                </ul>
              )}
              <p className="font-medium mt-3 mb-1">
                Users with matching email: {debugLookup.usersWithMatchingEmail.length}
              </p>
              {debugLookup.usersWithMatchingEmail.length === 0 ? (
                <p className="text-muted-foreground">
                  No Convex user has this email. StoreUserSync may not have run, or Clerk uses a different email.
                </p>
              ) : (
                <ul className="space-y-1">
                  {debugLookup.usersWithMatchingEmail.map((u) => (
                    <li key={u._id}>
                      {u.name} — {u.email} — id: {u._id}
                    </li>
                  ))}
                </ul>
              )}
              {debugLookup.allUsersSample && debugLookup.allUsersSample.length > 0 && (
                <>
                  <p className="font-medium mt-3 mb-1">
                    All Convex users (sample, tokenIdentifier format): {debugLookup.allUsersSample.length}
                  </p>
                  <ul className="space-y-1 text-xs font-mono">
                    {debugLookup.allUsersSample.map((u) => (
                      <li key={u._id}>
                        {u.email} | {u.tokenIdentifierPrefix}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-4">
        {(orders ?? []).map((order) => (
          <Card key={order._id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>{order.orderNumber}</CardTitle>
                  <CardDescription className="capitalize">{order.fulfillmentMode}</CardDescription>
                </div>
                <Badge variant={order.status === "paid_confirmed" ? "default" : "secondary"}>
                  {order.status.replace(/_/g, " ")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Customer / who ordered */}
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="font-medium text-muted-foreground mb-1">Customer</p>
                <div className="space-y-0.5">
                  {order.userId ? (
                    <p>
                      <span className="font-medium">{order.userName ?? "Account user"}</span>
                      {order.userEmail && (
                        <span className="text-muted-foreground"> ({order.userEmail})</span>
                      )}
                      <span className="text-green-600 text-xs ml-1">• Linked to account</span>
                    </p>
                  ) : (
                    <p className="text-muted-foreground">Guest order</p>
                  )}
                  <p>Email: {order.contactEmail ?? "—"}</p>
                  <p>Phone: {order.contactPhone ?? "—"}</p>
                  {!order.userId && order.contactEmail && (
                    <p className="text-amber-600 text-xs mt-1">
                      Not linked to account — will not appear on customer&apos;s My Account unless checkout email matches their sign-in email
                    </p>
                  )}
                </div>
              </div>

              {/* What they ordered */}
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="font-medium text-muted-foreground mb-2">Items</p>
                <ul className="space-y-1">
                  {(order.items ?? []).map((item, i) => {
                    const name = (item.productSnapshot as { name?: string })?.name ?? "Item";
                    const variant = item.variantSnapshot
                      ? (item.variantSnapshot as { label?: string }).label
                      : null;
                    const line = variant ? `${name} — ${variant}` : name;
                    return (
                      <li key={i} className="flex justify-between gap-2">
                        <span>
                          {line} × {item.qty}
                        </span>
                        <span className="text-muted-foreground">
                          ${((item.unitPriceCents * item.qty) / 100).toFixed(2)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 font-medium">
                  Total: ${(order.pricingSnapshot.totalCents / 100).toFixed(2)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {new Date(order.createdAt).toLocaleString()}
                </span>
                <a
                  href={`/orders/${order.guestToken}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  View tracking page
                </a>
              </div>
              {order.fulfillmentMode === "pickup" && order.status === "ready_for_pickup" && (
                <Button
                  size="sm"
                  onClick={() =>
                    updateStatus({
                      orderId: order._id,
                      status: "completed",
                      note: "Marked picked up",
                    })
                  }
                >
                  Mark picked up
                </Button>
              )}
              {order.fulfillmentMode === "delivery" && order.status === "in_production" && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => markReadyForDelivery({ orderId: order._id })}
                >
                  Mark ready for delivery
                </Button>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Input value={statusValue} onChange={(event) => setStatusValue(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Note</Label>
                  <Input value={note} onChange={(event) => setNote(event.target.value)} />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={() =>
                      updateStatus({
                        orderId: order._id,
                        status: statusValue,
                        note: note || undefined,
                      })
                    }
                  >
                    Update status
                  </Button>
                </div>
              </div>

              {order.fulfillmentMode === "delivery" &&
                (order.status === "in_production" || order.status === "ready_for_delivery") && (
                  <div className="flex flex-wrap items-center gap-2">
                    {(drivers ?? [])
                      .filter((d) => d.active)
                      .map((driver) => (
                        <Button
                          key={driver._id}
                          size="sm"
                          variant="outline"
                          onClick={() => assignDriver({ orderId: order._id, driverId: driver._id })}
                        >
                          Assign {driver.name}
                        </Button>
                      ))}
                  </div>
                )}

              <div className="grid gap-2 sm:grid-cols-3">
                <Select value={trackingCarrier} onValueChange={setTrackingCarrier}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Carrier" />
                  </SelectTrigger>
                  <SelectContent>
                    {CARRIERS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={trackingNumber}
                  onChange={(event) => setTrackingNumber(event.target.value)}
                  placeholder="Tracking number"
                />
                <Button
                  variant="outline"
                  onClick={() =>
                    setTracking({
                      orderId: order._id,
                      carrier: trackingCarrier,
                      trackingNumber,
                    })
                  }
                >
                  Set tracking
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
