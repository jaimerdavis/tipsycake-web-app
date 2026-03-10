"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";

import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { CUSTOMER_STATUS_LABELS } from "@/lib/orderStatusConfig";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Statuses that trigger customer email/SMS notification */
const NOTIFY_STATUSES = new Set([
  "order_accepted",
  "in_production",
  "ready_for_pickup",
  "out_for_delivery",
  "delivered",
  "shipped",
  "completed",
  "canceled",
]);

/** Next action per (status, fulfillmentMode). label = button text, nextStatus = status to set. */
function getStatusActions(
  status: string,
  fulfillmentMode: "pickup" | "delivery" | "shipping"
): { label: string; nextStatus: string }[] {
  const actions: { label: string; nextStatus: string }[] = [];
  switch (status) {
    case "paid_confirmed":
      actions.push({ label: "Acknowledge", nextStatus: "order_accepted" });
      break;
    case "order_accepted":
      actions.push({ label: "Plan & Prep", nextStatus: "in_production" });
      break;
    case "in_production":
      if (fulfillmentMode === "pickup") {
        actions.push({ label: "Ready for Pickup", nextStatus: "ready_for_pickup" });
      } else if (fulfillmentMode === "delivery") {
        // markReadyForDelivery is separate
      } else if (fulfillmentMode === "shipping") {
        actions.push({ label: "Shipped", nextStatus: "shipped" });
      }
      break;
    case "ready_for_pickup":
      actions.push({ label: "Mark Picked Up", nextStatus: "completed" });
      break;
    case "ready_for_delivery":
      actions.push({ label: "Out for Delivery", nextStatus: "out_for_delivery" });
      break;
    case "out_for_delivery":
      actions.push({ label: "Delivered", nextStatus: "delivered" });
      break;
    case "delivered":
    case "shipped":
      actions.push({ label: "Complete", nextStatus: "completed" });
      break;
    default:
      break;
  }
  return actions;
}

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
  { value: "order_accepted", label: "Order accepted" },
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

  const { results: orders = [], status: ordersStatus, loadMore: loadMoreOrders } = usePaginatedQuery(
    api.admin.orders.list,
    {
      fulfillmentMode:
        fulfillmentFilter === "all"
          ? undefined
          : (fulfillmentFilter as "pickup" | "delivery" | "shipping"),
      status: statusFilter === "all" ? undefined : statusFilter,
    },
    { initialNumItems: 50 }
  );
  const drivers = useQuery(api.admin.drivers.list);
  const updateStatus = useMutation(api.admin.orders.updateStatus);
  const markReadyForDelivery = useMutation(api.admin.orders.markReadyForDelivery);
  const assignDriver = useMutation(api.admin.orders.assignDriver);
  const setTracking = useMutation(api.admin.orders.setTracking);

  const [noteByOrder, setNoteByOrder] = useState<Record<string, string>>({});
  const [notifiedOrderId, setNotifiedOrderId] = useState<string | null>(null);
  const [cancelConfirmOrder, setCancelConfirmOrder] = useState<{
    _id: Id<"orders">;
    orderNumber: string;
  } | null>(null);
  const [trackingByOrder, setTrackingByOrder] = useState<
    Record<string, { carrier: string; number: string }>
  >({});

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-3 py-4 sm:px-6 sm:py-6">
      <header className="min-w-0 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Orders</h1>
        <p className="text-sm text-muted-foreground">
          Update status, assign drivers, and set shipping tracking.
        </p>
      </header>

      <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-4">
        <div className="flex min-w-0 shrink items-center gap-2">
          <Label htmlFor="fulfillment-filter" className="shrink-0 whitespace-nowrap text-sm">
            Fulfillment
          </Label>
          <Select value={fulfillmentFilter} onValueChange={setFulfillmentFilter}>
            <SelectTrigger id="fulfillment-filter" className="min-w-0 w-[130px] sm:w-[160px]">
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
        <div className="flex min-w-0 shrink items-center gap-2">
          <Label htmlFor="status-filter" className="shrink-0 whitespace-nowrap text-sm">
            Status
          </Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger id="status-filter" className="min-w-0 w-[140px] sm:w-[180px]">
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

      <section className="grid min-w-0 gap-4">
        {orders.map((order) => (
          <Card key={order._id} className="min-w-0 overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-baseline gap-3">
                  <CardTitle className="font-mono text-xl">#{order.orderNumber}</CardTitle>
                  <Badge variant="outline" className="capitalize font-normal">
                    {order.fulfillmentMode}
                  </Badge>
                  <Badge variant={order.status === "paid_confirmed" ? "default" : "secondary"}>
                    {CUSTOMER_STATUS_LABELS[order.status] ?? order.status.replace(/_/g, " ")}
                  </Badge>
                </div>
                <span className="text-sm text-muted-foreground">
                  {new Date(order.createdAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
                    Customer
                  </p>
                  <p className="font-medium">
                    {order.userId ? order.userName ?? "Account" : "Guest"}
                    {order.userEmail && (
                      <span className="ml-1 text-muted-foreground text-sm">({order.userEmail})</span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">{order.contactPhone ?? order.contactEmail ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
                    Items · Total
                  </p>
                  <ul className="space-y-0.5 text-sm">
                    {(order.items ?? []).map((item, i) => {
                      const name = (item.productSnapshot as { name?: string })?.name ?? "Item";
                      const variant = item.variantSnapshot
                        ? (item.variantSnapshot as { label?: string }).label
                        : null;
                      const line = variant ? `${name} (${variant})` : name;
                      return (
                        <li key={i} className="flex justify-between gap-2">
                          <span className="truncate">{line} × {item.qty}</span>
                          <span className="shrink-0 text-muted-foreground">
                            ${((item.unitPriceCents * item.qty) / 100).toFixed(2)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-1 font-semibold">
                    ${(order.pricingSnapshot.totalCents / 100).toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`/orders/${order.guestToken}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Edit / View order
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() =>
                    setDeleteConfirmOrder({ _id: order._id, orderNumber: order.orderNumber })
                  }
                >
                  Delete order
                </Button>
              </div>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {order.fulfillmentMode === "delivery" &&
                    order.status === "in_production" && (
                      <Button
                        size="sm"
                        onClick={() => markReadyForDelivery({ orderId: order._id })}
                      >
                        Ready for Delivery
                      </Button>
                    )}
                  {getStatusActions(
                    order.status,
                    order.fulfillmentMode as "pickup" | "delivery" | "shipping"
                  ).map((action) => (
                    <Button
                      key={action.nextStatus}
                      size="sm"
                      onClick={async () => {
                        await updateStatus({
                          orderId: order._id,
                          status: action.nextStatus,
                          note: (noteByOrder[order._id] ?? "").trim() || undefined,
                        });
                        if (
                          NOTIFY_STATUSES.has(action.nextStatus) &&
                          (order.contactEmail || order.contactPhone)
                        ) {
                          setNotifiedOrderId(order._id);
                          setTimeout(() => setNotifiedOrderId(null), 4000);
                        }
                      }}
                    >
                      {action.label}
                    </Button>
                  ))}
                  {["completed", "delivered", "shipped"].includes(order.status) && (
                    <span className="text-xs text-green-600 dark:text-green-400">
                      Customer notified ✓
                    </span>
                  )}
                  {notifiedOrderId === order._id && (
                    <span className="animate-pulse text-xs text-green-600 dark:text-green-400">
                      Customer notified ✓
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="sr-only">Note</Label>
                  <Input
                    placeholder="Optional note"
                    value={noteByOrder[order._id] ?? ""}
                    onChange={(e) =>
                      setNoteByOrder((prev) => ({ ...prev, [order._id]: e.target.value }))
                    }
                    className="h-8 w-40 text-sm"
                  />
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

              {order.fulfillmentMode === "shipping" && (
                <div className="grid gap-2 sm:grid-cols-3">
                  <Select
                    value={
                      trackingByOrder[order._id]?.carrier ??
                      order.carrier ??
                      "UPS"
                    }
                    onValueChange={(v) =>
                      setTrackingByOrder((prev) => ({
                        ...prev,
                        [order._id]: {
                          ...(prev[order._id] ?? {
                            carrier: order.carrier ?? "UPS",
                            number: order.trackingNumber ?? "",
                          }),
                          carrier: v,
                        },
                      }))
                    }
                  >
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
                    value={
                      trackingByOrder[order._id]?.number ??
                      order.trackingNumber ??
                      ""
                    }
                    onChange={(e) =>
                      setTrackingByOrder((prev) => ({
                        ...prev,
                        [order._id]: {
                          ...(prev[order._id] ?? {
                            carrier: order.carrier ?? "UPS",
                            number: order.trackingNumber ?? "",
                          }),
                          number: e.target.value,
                        },
                      }))
                    }
                    placeholder="Tracking number"
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      const t = trackingByOrder[order._id] ?? {
                        carrier: order.carrier ?? "UPS",
                        number: order.trackingNumber ?? "",
                      };
                      setTracking({
                        orderId: order._id,
                        carrier: t.carrier,
                        trackingNumber: t.number,
                      });
                    }}
                  >
                    Set tracking
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {ordersStatus === "CanLoadMore" && (
          <Button variant="outline" onClick={() => loadMoreOrders(50)}>
            Load more orders
          </Button>
        )}
      </section>

      <AlertDialog
        open={cancelConfirmOrder !== null}
        onOpenChange={(open) => !open && setCancelConfirmOrder(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel order?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel order #{cancelConfirmOrder?.orderNumber}? The customer
              will be notified that their order has been cancelled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, keep order</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!cancelConfirmOrder) return;
                await updateStatus({
                  orderId: cancelConfirmOrder._id,
                  status: "canceled",
                  note: "Cancelled by admin",
                });
                setCancelConfirmOrder(null);
              }}
            >
              Yes, cancel order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
