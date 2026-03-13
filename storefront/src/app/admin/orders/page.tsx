"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { ChevronRight } from "lucide-react";

import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { CUSTOMER_STATUS_LABELS } from "@/lib/orderStatusConfig";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { toast } from "sonner";

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
  const searchParams = useSearchParams();
  const emailFilter = searchParams.get("email")?.trim() || undefined;
  const [search, setSearch] = useState("");
  const [fulfillmentFilter, setFulfillmentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [productFilter, setProductFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const products = useQuery(api.admin.catalog.listProducts);
  const { results: orders = [], status: ordersStatus, loadMore: loadMoreOrders } = usePaginatedQuery(
    api.admin.orders.list,
    {
      contactEmail: emailFilter,
      search: search.trim() || undefined,
      productId:
        productFilter === "all"
          ? undefined
          : (productFilter as Id<"products">),
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
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
  const resendOrderConfirmation = useMutation(api.admin.orders.resendOrderConfirmation);
  const resendOwnerNotification = useMutation(api.admin.orders.resendOwnerNotification);

  const [noteByOrder, setNoteByOrder] = useState<Record<string, string>>({});
  const [resendingOrderId, setResendingOrderId] = useState<Id<"orders"> | null>(null);
  const [resendingOwnerId, setResendingOwnerId] = useState<Id<"orders"> | null>(null);
  const [notifiedOrderId, setNotifiedOrderId] = useState<string | null>(null);
  const [cancelConfirmOrder, setCancelConfirmOrder] = useState<{
    _id: Id<"orders">;
    orderNumber: string;
  } | null>(null);
  const [trackingByOrder, setTrackingByOrder] = useState<
    Record<string, { carrier: string; number: string }>
  >({});

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:gap-6 sm:px-6 sm:py-6">
      <header className="min-w-0 space-y-1">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Admin Orders</h1>
        <p className="text-sm text-muted-foreground">
          Update status, assign drivers, and set shipping tracking.
        </p>
      </header>

      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <Label htmlFor="search" className="sr-only">
            Search orders
          </Label>
          <Input
            id="search"
            type="search"
            placeholder="Order #, email, or customer name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 w-full sm:max-w-xs"
          />
          {(search || productFilter !== "all" || dateFrom || dateTo) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-10 touch-manipulation"
              onClick={() => {
                setSearch("");
                setProductFilter("all");
                setDateFrom("");
                setDateTo("");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
          <div className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1 sm:w-auto">
            <Label htmlFor="product-filter" className="shrink-0 text-sm text-muted-foreground sm:whitespace-nowrap">
              Cake
            </Label>
            <Select value={productFilter} onValueChange={setProductFilter}>
              <SelectTrigger id="product-filter" className="min-w-0 flex-1 touch-manipulation sm:w-[140px]">
                <SelectValue placeholder="All cakes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cakes</SelectItem>
                {(products ?? []).map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <Label htmlFor="date-from" className="shrink-0 text-sm text-muted-foreground">
              From
            </Label>
            <Input
              id="date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="min-w-0 flex-1 touch-manipulation sm:w-[130px]"
            />
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <Label htmlFor="date-to" className="shrink-0 text-sm text-muted-foreground">
              To
            </Label>
            <Input
              id="date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="min-w-0 flex-1 touch-manipulation sm:w-[130px]"
            />
          </div>
        </div>
      </div>

      {emailFilter && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Filtering by:</span>
          <span className="truncate font-medium">{emailFilter}</span>
          <Button variant="ghost" size="sm" className="h-9 touch-manipulation shrink-0" asChild>
            <Link href="/admin/orders">Clear</Link>
          </Button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <Label htmlFor="fulfillment-filter" className="shrink-0 text-sm sm:whitespace-nowrap">
            Fulfillment
          </Label>
          <Select value={fulfillmentFilter} onValueChange={setFulfillmentFilter}>
            <SelectTrigger id="fulfillment-filter" className="min-w-0 flex-1 touch-manipulation sm:w-[160px]">
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
        <div className="flex min-w-0 items-center gap-2">
          <Label htmlFor="status-filter" className="shrink-0 text-sm sm:whitespace-nowrap">
            Status
          </Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger id="status-filter" className="min-w-0 flex-1 touch-manipulation sm:w-[180px]">
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

      <section className="space-y-2">
        {orders.map((order) => (
          <Collapsible key={order._id} asChild defaultOpen={false}>
            <Card className="min-w-0 overflow-hidden group/collapse">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full min-h-[52px] touch-manipulation text-left px-4 py-3 hover:bg-muted/50 active:bg-muted/70 transition-colors rounded-t-lg sm:rounded-t-none"
                  aria-label={`Expand order #${order.orderNumber}`}
                >
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]/collapse:rotate-90" />
                      <CardTitle className="font-mono text-base sm:text-lg">#{order.orderNumber}</CardTitle>
                      <Badge variant="outline" className="capitalize font-normal text-xs shrink-0">
                        {order.fulfillmentMode}
                      </Badge>
                      <Badge variant={order.status === "paid_confirmed" ? "default" : "secondary"} className="text-xs shrink-0">
                        {CUSTOMER_STATUS_LABELS[order.status] ?? order.status.replace(/_/g, " ")}
                      </Badge>
                      <span className="text-sm text-muted-foreground truncate hidden sm:inline">
                        {(order.contactName as string | undefined) ??
                          (order.userId ? order.userName ?? "Account" : order.contactEmail ?? "Guest")}
                      </span>
                      <span className="text-sm font-medium shrink-0">
                        ${(order.pricingSnapshot.totalCents / 100).toFixed(2)}
                      </span>
                    </div>
                    <span className="text-xs sm:text-sm text-muted-foreground shrink-0 pl-6 sm:pl-0">
                      {new Date(order.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-1 pl-6 sm:hidden">
                    {(order.contactName as string | undefined) ??
                      (order.userId ? order.userName ?? "Account" : order.contactEmail ?? "Guest")}
                  </p>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-4 pt-0">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
                    Customer
                  </p>
                  <p className="font-medium">
                    {(order.contactName as string | undefined) ??
                      (order.userId ? order.userName ?? "Account" : "Guest")}
                    {order.userEmail && (
                      <span className="ml-1 text-muted-foreground text-sm">({order.userEmail})</span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">{order.contactPhone ?? order.contactEmail ?? "—"}</p>
                  {(order.fulfillmentMode === "delivery" || order.fulfillmentMode === "shipping") &&
                    (order.addressFormatted ? (
                      <p className="mt-1.5 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Delivery:</span> {order.addressFormatted}
                      </p>
                    ) : (
                      <p className="mt-1.5 text-sm text-amber-600 dark:text-amber-500">Address missing</p>
                    ))}
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
                      const base = variant ? `${name} (${variant})` : name;
                      const addons = (item.modifiersSnapshot ?? [])
                        .map((m) => (m as { optionName?: string }).optionName)
                        .filter(Boolean);
                      const line = addons.length > 0 ? `${base} + ${addons.join(", ")}` : base;
                      return (
                        <li key={i} className="flex justify-between gap-2">
                          <span className="min-w-0 flex-1">
                            <span className="truncate block">{line} × {item.qty}</span>
                            {item.itemNote && (
                              <span className="text-xs text-muted-foreground italic block truncate">
                                Note: {item.itemNote}
                              </span>
                            )}
                          </span>
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

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" className="h-10 min-w-[44px] touch-manipulation" asChild>
                  <Link
                    href={`/orders/${order.guestToken}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Edit / View order
                  </Link>
                </Button>
                {(order.contactEmail || order.userEmail) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 min-w-[44px] touch-manipulation"
                    disabled={resendingOrderId === order._id}
                    onClick={async () => {
                      setResendingOrderId(order._id);
                      try {
                        await resendOrderConfirmation({ orderId: order._id });
                        toast.success("Confirmation email resent");
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Failed to resend");
                      } finally {
                        setResendingOrderId(null);
                      }
                    }}
                  >
                    {resendingOrderId === order._id ? "Sending…" : "Resend confirmation"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 min-w-[44px] touch-manipulation"
                  disabled={resendingOwnerId === order._id}
                  onClick={async () => {
                    setResendingOwnerId(order._id);
                    try {
                      await resendOwnerNotification({ orderId: order._id });
                      toast.success("Owner notification resent");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed to resend");
                    } finally {
                      setResendingOwnerId(null);
                    }
                  }}
                >
                  {resendingOwnerId === order._id ? "Sending…" : "Resend owner notification"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 min-w-[44px] touch-manipulation text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() =>
                    setCancelConfirmOrder({ _id: order._id, orderNumber: order.orderNumber })
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
                        className="h-10 min-w-[44px] touch-manipulation"
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
                      className="h-10 min-w-[44px] touch-manipulation"
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
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Label className="sr-only">Note</Label>
                  <Input
                    placeholder="Optional note"
                    value={noteByOrder[order._id] ?? ""}
                    onChange={(e) =>
                      setNoteByOrder((prev) => ({ ...prev, [order._id]: e.target.value }))
                    }
                    className="h-10 min-w-0 flex-1 touch-manipulation text-sm sm:w-40"
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
                          className="h-10 min-w-[44px] touch-manipulation"
                          onClick={() => assignDriver({ orderId: order._id, driverId: driver._id })}
                        >
                          Assign {driver.name}
                        </Button>
                      ))}
                  </div>
                )}

              {order.fulfillmentMode === "shipping" && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
                    <SelectTrigger className="h-10 w-full touch-manipulation">
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
                    className="h-10 touch-manipulation"
                  />
                  <Button
                    variant="outline"
                    className="h-10 touch-manipulation"
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
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ))}
        {ordersStatus === "CanLoadMore" && (
          <Button variant="outline" className="h-11 w-full touch-manipulation sm:w-auto" onClick={() => loadMoreOrders(50)}>
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
