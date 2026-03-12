"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Map, { Marker, Source, Layer, type MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { STORE_ORIGIN } from "../../convex/lib/storeConfig";

const ROUTE_LAYER = {
  id: "route",
  type: "line" as const,
  paint: {
    "line-color": "#3b82f6",
    "line-width": 4,
    "line-opacity": 0.9,
  },
};

const ANIMATION_DURATION_MS = 1500;

/** Slice route coordinates by progress (0–1), interpolating along the line. */
function sliceCoordsByProgress(
  coords: [number, number][],
  progress: number
): [number, number][] {
  if (coords.length < 2) return coords;
  if (progress <= 0) return [coords[0], coords[0]];
  if (progress >= 1) return coords;

  const n = coords.length;
  const fractionalIndex = progress * (n - 1);
  const fullIdx = Math.floor(fractionalIndex);
  const frac = fractionalIndex - fullIdx;

  const sliced = coords.slice(0, fullIdx + 1);
  if (frac > 1e-6 && fullIdx + 1 < n) {
    const a = coords[fullIdx];
    const b = coords[fullIdx + 1];
    if (a && b) {
      sliced.push([
        a[0] + frac * (b[0] - a[0]),
        a[1] + frac * (b[1] - a[1]),
      ]);
    }
  }
  return sliced;
}

export interface CheckoutRouteMapProps {
  destination: { lat: number; lng: number };
  distanceMiles?: number;
  className?: string;
}

export function CheckoutRouteMap({
  destination,
  distanceMiles,
  className = "h-36 w-full rounded-lg",
}: CheckoutRouteMapProps) {
  const { get } = useSiteSettings();
  const token = get("mapboxAccessToken");
  const mapRef = useRef<MapRef | null>(null);
  const [fullRouteCoords, setFullRouteCoords] = useState<
    [number, number][] | null
  >(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);

  const fetchRoute = useCallback(
    async (origin: { lat: number; lng: number }, dest: { lat: number; lng: number }) => {
      if (!token) return;
      setRouteLoading(true);
      setProgress(0);
      try {
        const coords = `${origin.lng},${origin.lat};${dest.lng},${dest.lat}`;
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${token}&geometries=geojson`;
        const res = await fetch(url);
        const data = (await res.json()) as {
          routes?: Array<{
            geometry: { coordinates: [number, number][] };
          }>;
        };
        if (data.routes?.[0]) {
          const route = data.routes[0];
          setFullRouteCoords(route.geometry.coordinates);
        } else {
          setFullRouteCoords(null);
        }
      } catch {
        setFullRouteCoords(null);
      } finally {
        setRouteLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    fetchRoute(STORE_ORIGIN, destination);
  }, [destination.lat, destination.lng, fetchRoute]);

  useEffect(() => {
    if (!fullRouteCoords || fullRouteCoords.length < 2) return;

    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const p = Math.min(1, elapsed / ANIMATION_DURATION_MS);
      setProgress(p);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [fullRouteCoords]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  if (!token) {
    return (
      <div
        className={`${className} flex items-center justify-center rounded-lg bg-muted/30`}
      >
        <p className="text-sm text-muted-foreground">
          Map unavailable (Mapbox token not configured)
        </p>
      </div>
    );
  }

  const slicedCoords =
    fullRouteCoords && fullRouteCoords.length >= 2
      ? sliceCoordsByProgress(fullRouteCoords, progress)
      : null;

  const routeGeoJson =
    slicedCoords && slicedCoords.length >= 2
      ? ({
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: slicedCoords,
          },
        } as GeoJSON.Feature)
      : null;

  const centerLng = (STORE_ORIGIN.lng + destination.lng) / 2;
  const centerLat = (STORE_ORIGIN.lat + destination.lat) / 2;

  return (
    <div className={`relative ${className}`}>
      <Map
        ref={(r) => {
          mapRef.current = r;
        }}
        mapboxAccessToken={token}
        initialViewState={{
          longitude: centerLng,
          latitude: centerLat,
          zoom: 11,
          pitch: 55,
          bearing: -15,
        }}
        onLoad={() => {
          const map = mapRef.current?.getMap?.();
          if (map?.fitBounds) {
            map.fitBounds(
              [
                [
                  Math.min(STORE_ORIGIN.lng, destination.lng),
                  Math.min(STORE_ORIGIN.lat, destination.lat),
                ],
                [
                  Math.max(STORE_ORIGIN.lng, destination.lng),
                  Math.max(STORE_ORIGIN.lat, destination.lat),
                ],
              ],
              { padding: 24, duration: 0 }
            );
            // Restore 3D tilt (fitBounds can reset pitch)
            map.setPitch(55);
            map.setBearing(-15);
          }
        }}
        style={{ width: "100%", height: "100%", borderRadius: "0.5rem" }}
        mapStyle="mapbox://styles/mapbox/standard"
      >
        {routeGeoJson && (
          <Source id="checkout-route" type="geojson" data={routeGeoJson}>
            <Layer {...ROUTE_LAYER} />
          </Source>
        )}

        <Marker
          longitude={STORE_ORIGIN.lng}
          latitude={STORE_ORIGIN.lat}
          anchor="bottom"
          color="#3b82f6"
          title="Store"
        />
        <Marker
          longitude={destination.lng}
          latitude={destination.lat}
          anchor="bottom"
          color="#22c55e"
          title="Delivery address"
        />
      </Map>

      {distanceMiles != null && (
        <div className="absolute bottom-2 left-2 z-10">
          <span className="inline-flex items-center rounded-md bg-background/90 px-2 py-1 text-xs font-medium text-foreground shadow">
            {distanceMiles.toFixed(1)} mi
          </span>
        </div>
      )}

      {routeLoading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/50 text-sm">
          Loading route…
        </div>
      )}
    </div>
  );
}
