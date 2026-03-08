"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Map, {
  Marker,
  NavigationControl,
  Source,
  Layer,
  type MapRef,
} from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { useSiteSettings } from "@/hooks/useSiteSettings";

interface MapboxDeliveryMapProps {
  /** Driver current position (for driver view) */
  driverLocation?: { lat: number; lng: number } | null;
  /** Destination */
  destination?: { lat: number; lng: number; formatted?: string } | null;
  /** Admin mode: multiple driver+destination pairs */
  adminMarkers?: Array<{
    driverLocation?: { lat: number; lng: number } | null;
    destination?: { lat: number; lng: number; formatted?: string } | null;
    driverTrail?: Array<{ lat: number; lng: number }>;
    driverName?: string;
    orderNumber?: string;
  }>;
  /** Show route and Navigate button (driver mode) */
  showDirections?: boolean;
  /** Show turn-by-turn steps */
  showSteps?: boolean;
  className?: string;
}

interface RouteStep {
  instruction: string;
  distance?: number;
}

const ROUTE_LAYER = {
  id: "route",
  type: "line" as const,
  paint: {
    "line-color": "#3b82f6",
    "line-width": 4,
    "line-opacity": 0.9,
  },
};

export function MapboxDeliveryMap({
  driverLocation,
  destination,
  adminMarkers,
  showDirections = false,
  showSteps = false,
  className = "h-64 w-full rounded-lg",
}: MapboxDeliveryMapProps) {
  const { get } = useSiteSettings();
  const token = get("mapboxAccessToken");
  const mapRef = useRef<MapRef | null>(null);
  const [routeGeoJson, setRouteGeoJson] = useState<GeoJSON.Feature | null>(null);
  const [steps, setSteps] = useState<RouteStep[]>([]);
  const [routeLoading, setRouteLoading] = useState(false);

  const hasAdmin = Array.isArray(adminMarkers) && adminMarkers.length > 0;

  const fetchRoute = useCallback(
    async (origin: { lat: number; lng: number }, dest: { lat: number; lng: number }) => {
      if (!token) return;
      setRouteLoading(true);
      try {
        const coords = `${origin.lng},${origin.lat};${dest.lng},${dest.lat}`;
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${token}&geometries=geojson&steps=true`;
        const res = await fetch(url);
        const data = (await res.json()) as {
          routes?: Array<{
            geometry: { coordinates: [number, number][] };
            legs?: Array<{ steps?: Array<{ maneuver?: { instruction?: string }; distance?: number }> }>;
          }>;
        };
        if (data.routes?.[0]) {
          const route = data.routes[0];
          const coords = route.geometry.coordinates;
          setRouteGeoJson({
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: coords,
            },
          } as GeoJSON.Feature);
          const legSteps = route.legs?.flatMap((leg) => leg.steps ?? []) ?? [];
          setSteps(
            legSteps.map((s) => ({
              instruction: s.maneuver?.instruction ?? "",
              distance: s.distance,
            }))
          );
        } else {
          setRouteGeoJson(null);
          setSteps([]);
        }
      } catch {
        setRouteGeoJson(null);
        setSteps([]);
      } finally {
        setRouteLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (!showDirections || !driverLocation || !destination || !token) return;
    if (
      driverLocation.lat === destination.lat &&
      driverLocation.lng === destination.lng
    )
      return;
    void fetchRoute(driverLocation, destination);
  }, [showDirections, driverLocation?.lat, driverLocation?.lng, destination?.lat, destination?.lng, token, fetchRoute]);

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

  const center = hasAdmin
    ? undefined
    : destination ?? driverLocation ?? { lat: 26.139, lng: -80.216 };
  const zoom = 14;

  return (
    <div className={`relative ${className}`}>
      <Map
        ref={(r) => {
          mapRef.current = r;
        }}
        mapboxAccessToken={token}
        initialViewState={{
          longitude: center?.lng ?? -80.216,
          latitude: center?.lat ?? 26.139,
          zoom,
        }}
        style={{ width: "100%", height: "100%", borderRadius: "0.5rem" }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
      >
        <NavigationControl position="top-right" />

        {routeGeoJson && (
          <Source id="route" type="geojson" data={routeGeoJson}>
            <Layer {...ROUTE_LAYER} />
          </Source>
        )}

        {hasAdmin && adminMarkers ? (
          <>
            {adminMarkers.flatMap((m, i) => {
              const els: React.ReactNode[] = [];
              if (m.driverTrail && m.driverTrail.length > 1) {
                els.push(
                  <Source
                    key={`trail-${i}`}
                    id={`trail-${i}`}
                    type="geojson"
                    data={{
                      type: "Feature",
                      properties: {},
                      geometry: {
                        type: "LineString",
                        coordinates: m.driverTrail.map((p) => [p.lng, p.lat]),
                      },
                    } as GeoJSON.Feature}
                  >
                    <Layer
                      id={`trail-layer-${i}`}
                      type="line"
                      paint={{
                        "line-color": "#3b82f6",
                        "line-width": 4,
                        "line-opacity": 0.8,
                      }}
                    />
                  </Source>
                );
              }
              if (m.driverLocation?.lat != null && m.driverLocation?.lng != null) {
                els.push(
                  <Marker
                    key={`driver-${i}`}
                    longitude={m.driverLocation.lng}
                    latitude={m.driverLocation.lat}
                    anchor="bottom"
                    color="#3b82f6"
                    title={`Driver: ${m.driverName ?? "?"} (${m.orderNumber ?? ""})`}
                  />
                );
              }
              if (m.destination?.lat != null && m.destination?.lng != null) {
                els.push(
                  <Marker
                    key={`dest-${i}`}
                    longitude={m.destination.lng}
                    latitude={m.destination.lat}
                    anchor="bottom"
                    color="#22c55e"
                    title={`Order ${m.orderNumber ?? "?"} - Delivery`}
                  />
                );
              }
              return els;
            })}
          </>
        ) : (
          <>
            {driverLocation?.lat != null && driverLocation?.lng != null && (
              <Marker
                longitude={driverLocation.lng}
                latitude={driverLocation.lat}
                anchor="bottom"
                color="#3b82f6"
                title="You"
              />
            )}
            {destination?.lat != null && destination?.lng != null && (
              <Marker
                longitude={destination.lng}
                latitude={destination.lat}
                anchor="bottom"
                color="#22c55e"
                title="Delivery address"
              />
            )}
          </>
        )}
      </Map>

      {showDirections && destination && (
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}`}
          target="_blank"
          rel="noreferrer"
          className="absolute bottom-4 left-4 z-10"
        >
          <span className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90">
            Navigate in Google Maps
          </span>
        </a>
      )}

      {showSteps && steps.length > 0 && (
        <div className="absolute right-4 top-14 z-10 max-h-48 overflow-y-auto rounded-md border bg-background/95 p-2 text-xs shadow">
          {steps.map((s, i) => (
            <div key={i} className="py-1">
              {s.instruction}
              {s.distance != null && (
                <span className="ml-1 text-muted-foreground">
                  ({(s.distance / 1609.34).toFixed(1)} mi)
                </span>
              )}
            </div>
          ))}
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
