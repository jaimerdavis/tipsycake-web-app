"use client";

import { useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DeliveryMap } from "@/components/DeliveryMap";
import { MapboxDeliveryMap } from "@/components/MapboxDeliveryMap";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function AdminTrackingPage() {
  const activeDrivers = useQuery(api.tracking.getActiveDriverLocations);
  const { get } = useSiteSettings();
  const mapboxToken = get("mapboxAccessToken");

  const adminMarkers =
    activeDrivers?.map((d) => ({
      driverLocation: d.latestLocation,
      destination: d.destination,
      driverTrail: d.driverTrail,
      driverName: d.driverName,
      orderNumber: d.orderNumber,
    })) ?? [];

  const MapComponent = mapboxToken ? MapboxDeliveryMap : DeliveryMap;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Driver Tracking</h1>
        <p className="text-sm text-muted-foreground">
          Live view of active deliveries. Driver locations update as they ping.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Active Deliveries Map</CardTitle>
          <CardDescription>
            {activeDrivers && activeDrivers.length > 0
              ? `${activeDrivers.length} active assignment(s)`
              : "No active deliveries"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MapComponent
            adminMarkers={adminMarkers.length > 0 ? adminMarkers : undefined}
            className="h-96 w-full rounded-lg border"
          />
        </CardContent>
      </Card>

      {activeDrivers && activeDrivers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active Assignments</CardTitle>
            <CardDescription>Orders currently out for delivery</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeDrivers.map((d) => (
              <div
                key={d.assignmentId}
                className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">Order {d.orderNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    Driver: {d.driverName}
                    {d.latestLocation
                      ? ` • Last ping: ${d.latestLocation.lat.toFixed(4)}, ${d.latestLocation.lng.toFixed(4)}`
                      : " • No location pings yet"}
                  </p>
                </div>
                <Badge>{d.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
