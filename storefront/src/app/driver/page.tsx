"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AddToHomeScreenPrompt, OfflineIndicator } from "@/components/DriverPWAHelpers";
import { MapboxDeliveryMap } from "@/components/MapboxDeliveryMap";
import { useSiteSettings } from "@/hooks/useSiteSettings";

const PING_INTERVAL_MS = 18000;
const MIN_DISTANCE_METERS = 50;

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function DriverPortalPage() {
  const me = useQuery(api.users.meOrNull);

  if (me === undefined) {
    return (
      <main className="mx-auto flex min-h-[40vh] w-full max-w-4xl flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  if (me === null) {
    return (
      <main className="mx-auto flex min-h-[40vh] w-full max-w-4xl flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Driver Portal</h1>
        <p className="text-sm text-muted-foreground">
          Sign in with a driver account to claim deliveries and update status.
        </p>
        <Button asChild>
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </main>
    );
  }

  if (me.role !== "driver") {
    return (
      <main className="mx-auto flex min-h-[40vh] w-full max-w-4xl flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Driver access only</h1>
        <p className="text-sm text-muted-foreground">
          You&apos;re signed in as {me.role}. Sign in with a driver account to access the driver portal.
        </p>
        <Button asChild variant="outline">
          <Link href="/">Back to store</Link>
        </Button>
      </main>
    );
  }

  return <DriverPortalContent />;
}

function DriverPortalContent() {
  const { get } = useSiteSettings();
  const mapboxToken = get("mapboxAccessToken");
  const available = useQuery(api.driver.availableForClaim);
  const assignments = useQuery(api.driver.myAssignments);
  const claimOrder = useMutation(api.driver.claimOrder);
  const updateStatus = useMutation(api.driver.updateStatus);
  const pingLocation = useMutation(api.driver.pingLocation);
  const uploadProof = useMutation(api.driver.uploadProofOfDelivery);
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);

  const [livePosition, setLivePosition] = useState<{ lat: number; lng: number } | null>(null);
  const [claiming, setClaiming] = useState<Id<"orders"> | null>(null);
  const [deliverConfirmId, setDeliverConfirmId] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [pinging, setPinging] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const watchIdRef = useRef<number | null>(null);
  const lastPingRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastPingTimeRef = useRef<number>(0);

  const enRouteAssignments = (assignments ?? []).filter((a) => a.status === "en_route");
  const activeEnRoute = enRouteAssignments[0];
  const activeWithDest = (assignments ?? []).find(
    (a) => (a.status === "assigned" || a.status === "en_route") && a.destination
  );

  useEffect(() => {
    if (enRouteAssignments.length === 0 || !navigator.geolocation) return;

    const doPing = (assignmentId: string, lat: number, lng: number) => {
      const now = Date.now();
      const last = lastPingRef.current;
      const distOk = !last || haversineMeters(last.lat, last.lng, lat, lng) >= MIN_DISTANCE_METERS;
      const timeOk = now - lastPingTimeRef.current >= PING_INTERVAL_MS;
      if (!distOk && !timeOk) return;

      lastPingRef.current = { lat, lng };
      lastPingTimeRef.current = now;
      pingLocation({
        assignmentId: assignmentId as never,
        lat,
        lng,
      }).catch(() => {});
    };

    const handlePosition = (pos: GeolocationPosition, aid: string) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setLivePosition({ lat, lng });
      doPing(aid, lat, lng);
    };

    const aid = enRouteAssignments[0]._id;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => handlePosition(pos, aid),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [enRouteAssignments.map((a) => a._id).join(), pingLocation]);

  useEffect(() => {
    if (!activeEnRoute) setLivePosition(null);
  }, [activeEnRoute?._id]);

  async function handleClaim(orderId: Id<"orders">) {
    setClaiming(orderId);
    try {
      await claimOrder({ orderId });
      toast.success("Order claimed. It's now in your assignments.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not claim order");
    } finally {
      setClaiming(null);
    }
  }

  async function handlePingLocation(assignmentId: string) {
    setGeoError(null);
    setPinging(assignmentId);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("Geolocation not supported"));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });
      await pingLocation({
        assignmentId: assignmentId as never,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not get location";
      setGeoError(msg);
      toast.error(`${msg} Check GPS permissions or try again.`);
    } finally {
      setPinging(null);
    }
  }

  async function handleProofUpload(assignmentId: string, file: File) {
    setUploading(assignmentId);
    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = (await result.json()) as { storageId: string };
      await uploadProof({ assignmentId: assignmentId as never, storageId });
    } finally {
      setUploading(null);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <OfflineIndicator />
      <AddToHomeScreenPrompt />
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Driver Portal</h1>
        <p className="text-sm text-muted-foreground">
          Claim available deliveries, update status, ping location, upload proof of delivery.
        </p>
      </header>

      {available && available.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-medium">Available deliveries</h2>
          <p className="text-xs text-muted-foreground">
            Claim an order to add it to your assignments. Another driver may claim it first.
          </p>
          <div className="grid gap-3">
            {available.map((order) => (
              <Card key={order._id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{order.orderNumber}</CardTitle>
                  <CardDescription>
                    {order.addressFormatted ?? "Address on file"}
                    {order.contactPhone && ` • ${order.contactPhone}`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    ${(order.pricingSnapshot.totalCents / 100).toFixed(2)}
                  </p>
                  <Button
                    size="sm"
                    disabled={claiming === order._id}
                    onClick={() => handleClaim(order._id)}
                  >
                    {claiming === order._id ? "Claiming…" : "Claim"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {activeWithDest?.destination && mapboxToken && (
        <section className="space-y-2">
          <h2 className="text-lg font-medium">Delivery map</h2>
          <MapboxDeliveryMap
            driverLocation={activeEnRoute ? livePosition : undefined}
            destination={activeWithDest.destination}
            showDirections={!!activeEnRoute}
            showSteps={!!activeEnRoute}
            className="h-72 w-full rounded-lg border"
          />
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-medium">My assignments</h2>
        {(!assignments || assignments.length === 0) && (
          <p className="text-sm text-muted-foreground">No assignments yet.</p>
        )}
      </section>

      <section className="grid gap-4">
        {(assignments ?? []).map((assignment) => (
          <Card key={assignment._id}>
            <CardHeader>
              <CardTitle className="text-base">
                {assignment.orderNumber}
              </CardTitle>
              <CardDescription>
                {assignment.addressFormatted ?? "Address on file"}
                {assignment.contactPhone && ` • ${assignment.contactPhone}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Badge>{assignment.status}</Badge>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={assignment.status === "en_route"}
                  onClick={async () => {
                    await updateStatus({ assignmentId: assignment._id, status: "en_route" });
                    try {
                      const pos = await new Promise<GeolocationPosition>((res, rej) =>
                        navigator.geolocation?.getCurrentPosition(res, rej, {
                          enableHighAccuracy: true,
                          maximumAge: 5000,
                        })
                      );
                      if (pos)
                        await pingLocation({
                          assignmentId: assignment._id,
                          lat: pos.coords.latitude,
                          lng: pos.coords.longitude,
                        });
                    } catch {
                      // Location optional on status change
                    }
                  }}
                >
                  Mark En Route
                </Button>
                <Button
                  size="sm"
                  disabled={assignment.status === "delivered"}
                  onClick={() => setDeliverConfirmId(assignment._id)}
                >
                  Mark Delivered
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {assignment.addressFormatted && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 min-w-9 p-0"
                    onClick={() => {
                      void navigator.clipboard.writeText(assignment.addressFormatted ?? "");
                      toast.success("Address copied");
                    }}
                    title="Copy address"
                  >
                    Copy address
                  </Button>
                )}
                {assignment.contactPhone && (
                  <a href={`tel:${assignment.contactPhone.replace(/\D/g, "")}`}>
                    <Button variant="ghost" size="sm" className="h-9" title="Call customer">
                      Call customer
                    </Button>
                  </a>
                )}
              </div>

              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pinging === assignment._id}
                  onClick={() => handlePingLocation(assignment._id)}
                >
                  {pinging === assignment._id ? "Getting location…" : "Ping location (GPS)"}
                </Button>
                {geoError && (
                  <p className="text-xs text-destructive">{geoError}</p>
                )}
              </div>

              <div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={(el) => {
                    if (el) fileInputRefs.current.set(assignment._id, el);
                  }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleProofUpload(assignment._id, file);
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={uploading === assignment._id}
                  onClick={() => fileInputRefs.current.get(assignment._id)?.click()}
                >
                  {uploading === assignment._id ? "Uploading…" : "Upload Proof Photo"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <AlertDialog
        open={deliverConfirmId != null}
        onOpenChange={(open) => !open && setDeliverConfirmId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as delivered?</AlertDialogTitle>
            <AlertDialogDescription>
              This will notify the customer and complete the delivery. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deliverConfirmId) {
                  await updateStatus({ assignmentId: deliverConfirmId as never, status: "delivered" });
                  setDeliverConfirmId(null);
                  toast.success("Delivery marked complete.");
                }
              }}
            >
              Mark delivered
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
