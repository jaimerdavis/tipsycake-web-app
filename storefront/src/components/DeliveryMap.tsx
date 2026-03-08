"use client";

import { useEffect, useRef } from "react";
import { useSiteSettings } from "@/hooks/useSiteSettings";

interface DeliveryMapProps {
  driverLocation?: { lat: number; lng: number } | null;
  destination?: { lat: number; lng: number; formatted?: string } | null;
  /** Admin mode: show multiple driver+destination pairs on one map */
  adminMarkers?: Array<{
    driverLocation?: { lat: number; lng: number } | null;
    destination?: { lat: number; lng: number; formatted?: string } | null;
    driverTrail?: Array<{ lat: number; lng: number }>;
    driverName?: string;
    orderNumber?: string;
  }>;
  className?: string;
}

export function DeliveryMap({
  driverLocation,
  destination,
  adminMarkers,
  className = "h-64 w-full rounded-lg",
}: DeliveryMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const { get } = useSiteSettings();
  const apiKey = get("googleMapsClientKey");
  const driverRef = useRef(driverLocation);
  const destRef = useRef(destination);
  const adminRef = useRef(adminMarkers);

  useEffect(() => {
    driverRef.current = driverLocation;
    destRef.current = destination;
    adminRef.current = adminMarkers;
    if (!apiKey) return;

    const initMap = () => {
      if (!mapRef.current || !window.google?.maps) return;
      const driver = driverRef.current;
      const dest = destRef.current;
      const admin = adminRef.current;

      const bounds = new window.google.maps.LatLngBounds();
      const hasAdmin = Array.isArray(admin) && admin.length > 0;

      let center = { lat: 26.139, lng: -80.216 };
      if (!hasAdmin && dest?.lat != null && dest?.lng != null) {
        center = { lat: dest.lat, lng: dest.lng };
      } else if (!hasAdmin && driver?.lat != null && driver?.lng != null) {
        center = { lat: driver.lat, lng: driver.lng };
      }

      const map = new window.google.maps.Map(mapRef.current, {
        center,
        zoom: 14,
      });

      if (hasAdmin && admin) {
        for (const m of admin) {
          if (m.driverTrail && m.driverTrail.length > 1) {
            const path = m.driverTrail.map(
              (p) => new window.google.maps.LatLng(p.lat, p.lng)
            );
            new window.google.maps.Polyline({
              path,
              map,
              strokeColor: "#3b82f6",
              strokeOpacity: 0.8,
              strokeWeight: 4,
            });
            path.forEach((p) => bounds.extend(p));
          }
          if (m.driverLocation?.lat != null && m.driverLocation?.lng != null) {
            const pos = new window.google.maps.LatLng(m.driverLocation.lat, m.driverLocation.lng);
            new window.google.maps.Marker({
              position: pos,
              map,
              title: `Driver: ${m.driverName ?? "?"} (${m.orderNumber ?? ""})`,
            });
            bounds.extend(pos);
          }
          if (m.destination?.lat != null && m.destination?.lng != null) {
            const pos = new window.google.maps.LatLng(m.destination.lat, m.destination.lng);
            new window.google.maps.Marker({
              position: pos,
              map,
              title: `Order ${m.orderNumber ?? "?"} - Delivery`,
            });
            bounds.extend(pos);
          }
        }
      } else {
        const hasDriver = driver?.lat != null && driver?.lng != null;
        const hasDest = dest?.lat != null && dest?.lng != null;

        if (hasDriver && driver) {
          const driverPos = new window.google.maps.LatLng(driver.lat, driver.lng);
          new window.google.maps.Marker({
            position: driverPos,
            map,
            title: "Driver",
          });
          bounds.extend(driverPos);
        }
        if (hasDest && dest) {
          const destPos = new window.google.maps.LatLng(dest.lat, dest.lng);
          new window.google.maps.Marker({
            position: destPos,
            map,
            title: "Delivery address",
          });
          bounds.extend(destPos);
        }
      }

      if (!bounds.isEmpty()) {
        (map as { fitBounds: (b: unknown) => void }).fitBounds(bounds);
      }
    };

    if (window.google?.maps) {
      initMap();
      return;
    }

    window.initDeliveryMap = initMap;

    const existingScript = document.querySelector(
      'script[src*="maps.googleapis.com/maps/api/js"]'
    );
    if (!existingScript) {
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initDeliveryMap`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    } else {
      const checkReady = setInterval(() => {
        if (window.google?.maps) {
          clearInterval(checkReady);
          initMap();
        }
      }, 100);
      return () => clearInterval(checkReady);
    }

    return () => {
      delete window.initDeliveryMap;
    };
  }, [
    apiKey,
    driverLocation?.lat,
    driverLocation?.lng,
    destination?.lat,
    destination?.lng,
    adminMarkers?.length,
    adminMarkers?.flatMap((m) => m.driverTrail ?? []).length,
  ]);

  if (!apiKey) {
    return (
      <div className={`${className} flex items-center justify-center bg-muted/30 rounded-lg`}>
        <p className="text-sm text-muted-foreground">Map unavailable (API key not configured)</p>
      </div>
    );
  }

  return <div ref={mapRef} className={className} aria-label="Delivery map" />;
}
