"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminOrdersPage() {
  const orders = useQuery(api.admin.orders.list, {});
  const drivers = useQuery(api.admin.drivers.list);
  const updateStatus = useMutation(api.admin.orders.updateStatus);
  const assignDriver = useMutation(api.admin.orders.assignDriver);
  const setTracking = useMutation(api.admin.shipping.setTracking);

  const [statusValue, setStatusValue] = useState("in_production");
  const [note, setNote] = useState("");
  const [trackingCarrier, setTrackingCarrier] = useState("UPS");
  const [trackingNumber, setTrackingNumber] = useState("");

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Orders</h1>
        <p className="text-sm text-muted-foreground">
          Update status, assign drivers, and set shipping tracking.
        </p>
      </header>

      <section className="grid gap-4">
        {(orders ?? []).map((order) => (
          <Card key={order._id}>
            <CardHeader>
              <CardTitle>{order.orderNumber}</CardTitle>
              <CardDescription>{order.fulfillmentMode}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Badge>{order.status}</Badge>
              <p className="text-sm">Total: {order.pricingSnapshot.totalCents} cents</p>
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

              <div className="flex flex-wrap items-center gap-2">
                {(drivers ?? [])
                  .filter((driver) => driver.active)
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

              <div className="grid gap-2 sm:grid-cols-3">
                <Input
                  value={trackingCarrier}
                  onChange={(event) => setTrackingCarrier(event.target.value)}
                  placeholder="Carrier"
                />
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
