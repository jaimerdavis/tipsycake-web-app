"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";

import { api } from "../../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Order Status</h1>
        <p className="text-sm text-muted-foreground">
          Order #{order.orderNumber} • {order.fulfillmentMode}
        </p>
        <Badge>{order.status}</Badge>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
          <CardDescription>TRK-001 status events</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {order.events.map((event) => (
            <div key={event._id} className="flex items-center justify-between rounded border p-2 text-sm">
              <span>{event.status}</span>
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
          <CardDescription>Immutable order snapshot</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {order.items.map((item) => (
            <div key={item._id} className="rounded border p-2">
              <p>Qty {item.qty}</p>
              <p>Unit {item.unitPriceCents} cents</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
