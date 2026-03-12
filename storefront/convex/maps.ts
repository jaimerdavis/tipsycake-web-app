"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { STORE_ORIGIN } from "./lib/storeConfig";

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
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

/**
 * Get driving distance from store to address via Google Distance Matrix API.
 * Returns null on API failure; caller should fall back to haversine.
 */
async function getDrivingDistanceMiles(
  destLat: number,
  destLng: number,
  apiKey: string
): Promise<number | null> {
  const origin = `${STORE_ORIGIN.lat},${STORE_ORIGIN.lng}`;
  const dest = `${destLat},${destLng}`;
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(dest)}&mode=driving&key=${apiKey}`;
  const res = await fetch(url);
  const data = (await res.json()) as {
    status: string;
    rows?: Array<{
      elements?: Array<{
        status: string;
        distance?: { value: number };
      }>;
    }>;
  };
  if (data.status !== "OK" || !data.rows?.[0]?.elements?.[0]) return null;
  const el = data.rows[0].elements[0];
  if (el.status !== "OK" || el.distance == null) return null;
  return Math.round((el.distance.value / 1609.344) * 10) / 10; // meters to miles
}

/**
 * Normalize and geocode an address using external API.
 * FUL-006: Integrates with Google Places/Geocoding when API key is configured.
 * Returns formatted address + lat/lng for distance/zone computation.
 */
export const normalizeAndGeocodeAddress = action({
  args: {
    line1: v.string(),
    line2: v.optional(v.string()),
    city: v.string(),
    state: v.string(),
    zip: v.string(),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return {
        formatted: [args.line1, args.line2, args.city, args.state, args.zip]
          .filter(Boolean)
          .join(", "),
        line1: args.line1,
        line2: args.line2,
        city: args.city,
        state: args.state,
        zip: args.zip,
        lat: 0,
        lng: 0,
        placeId: null,
        error: "GOOGLE_MAPS_API_KEY not configured; returning unvalidated address",
      };
    }

    const addressStr = [args.line1, args.line2, args.city, args.state, args.zip]
      .filter(Boolean)
      .join(", ");
    const enc = encodeURIComponent(addressStr);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${enc}&key=${apiKey}`;

    const res = await fetch(url);
    const data = (await res.json()) as {
      status: string;
      results?: Array<{
        place_id: string;
        formatted_address: string;
        address_components: Array<{
          types: string[];
          long_name: string;
          short_name: string;
        }>;
        geometry: { location: { lat: number; lng: number } };
      }>;
    };

    if (data.status !== "OK" || !data.results?.length) {
      return {
        formatted: addressStr,
        line1: args.line1,
        line2: args.line2,
        city: args.city,
        state: args.state,
        zip: args.zip,
        lat: 0,
        lng: 0,
        placeId: null,
        error: data.status === "ZERO_RESULTS" ? "Address not found" : "Geocoding failed",
      };
    }

    const r = data.results[0];
    const loc = r.geometry.location;
    let line1 = args.line1;
    let city = args.city;
    let state = args.state;
    let zip = args.zip;

    for (const c of r.address_components) {
      if (c.types.includes("street_number") || c.types.includes("route")) {
        line1 = c.long_name + (line1 ? ` ${line1}` : "");
      }
      if (c.types.includes("locality")) city = c.long_name;
      if (c.types.includes("administrative_area_level_1")) state = c.short_name;
      if (c.types.includes("postal_code")) zip = c.long_name;
    }

    return {
      formatted: r.formatted_address,
      line1,
      line2: args.line2,
      city,
      state,
      zip,
      lat: loc.lat,
      lng: loc.lng,
      placeId: r.place_id,
      error: null,
    };
  },
});

/**
 * Compute distance from store origin and determine delivery zone.
 * FUL-006: Populates addressCache for eligibility lookups.
 */
export const computeDistanceAndZone = action({
  args: {
    addressId: v.id("addresses"),
  },
  handler: async (ctx, args): Promise<{
    distanceMiles: number;
    zoneId: string | null;
    eligibleDelivery: boolean;
    eligibleShipping: boolean;
  }> => {
    const address = (await ctx.runQuery(api.addresses.getAddressById, {
      addressId: args.addressId,
    })) as { lat: number; lng: number } | null;
    if (!address) throw new Error("Address not found");

    const lat: number = address.lat;
    const lng: number = address.lng;

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const drivingMiles = apiKey
      ? await getDrivingDistanceMiles(lat, lng, apiKey)
      : null;
    const distanceMiles: number =
      drivingMiles ?? haversineMiles(lat, lng, STORE_ORIGIN.lat, STORE_ORIGIN.lng);

    interface DeliveryZone {
      _id: string;
      enabled: boolean;
      polygonGeoJson?: { coordinates?: number[][][] };
    }
    const zones = (await ctx.runQuery(api.addresses.listDeliveryZones, {})) as DeliveryZone[];
    const { deliveryMaxMiles } = await ctx.runQuery(api.checkout.getDeliveryConfigQuery, {});

    let zoneId: string | null = null;
    const x = lng;
    const y = lat;
    for (const z of zones) {
      if (!z.polygonGeoJson) continue;
      const coords = z.polygonGeoJson?.coordinates?.[0];
      if (!coords) continue;
      let inside = false;
      const n = coords.length;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = coords[i][0];
        const yi = coords[i][1];
        const xj = coords[j][0];
        const yj = coords[j][1];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
          inside = !inside;
        }
      }
      if (inside) {
        zoneId = z._id;
        break;
      }
    }

    const eligibleDelivery = distanceMiles <= deliveryMaxMiles;
    // When no polygon zones exist, base eligibility on distance only. When zones exist, require at least one enabled.
    const eligibleByZone = zones.length === 0 || zones.some((z: DeliveryZone) => z.enabled);
    await ctx.runMutation(api.addresses.upsertAddressCache, {
      addressId: args.addressId,
      distanceMiles,
      zoneId: (zoneId ?? undefined) as never,
      eligibleDelivery: eligibleByZone && eligibleDelivery,
      eligibleShipping: true,
      computedAt: Date.now(),
    });

    return { distanceMiles, zoneId, eligibleDelivery, eligibleShipping: true };
  },
});

type TestAddressResult =
  | { error: string; distanceMiles: null; eligibleDelivery: null; tierFeeCents: null; tierLabel: null }
  | { error: null; formattedAddress: string; distanceMiles: number; eligibleDelivery: boolean; tierFeeCents: number | null; tierLabel: string | null };

/**
 * Test an address for delivery: geocode, compute distance from store, find matching tier.
 * Admin-only. Use on the delivery pricing page to verify tier configuration.
 */
export const testAddressForDelivery = action({
  args: {
    addressStr: v.string(),
  },
  handler: async (ctx, args): Promise<TestAddressResult> => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return {
        error: "GOOGLE_MAPS_API_KEY not configured",
        distanceMiles: null,
        eligibleDelivery: null,
        tierFeeCents: null,
        tierLabel: null,
      };
    }

    const enc = encodeURIComponent(args.addressStr.trim());
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${enc}&key=${apiKey}`;
    const res = await fetch(url);
    const data = (await res.json()) as {
      status: string;
      results?: Array<{ geometry: { location: { lat: number; lng: number } }; formatted_address: string }>;
    };

    if (data.status !== "OK" || !data.results?.length) {
      return {
        error: data.status === "ZERO_RESULTS" ? "Address not found" : "Geocoding failed",
        distanceMiles: null,
        eligibleDelivery: null,
        tierFeeCents: null,
        tierLabel: null,
      };
    }

    const loc = data.results[0].geometry.location;
    const drivingMiles = await getDrivingDistanceMiles(loc.lat, loc.lng, apiKey);
    const distanceMiles =
      drivingMiles ?? Math.round(haversineMiles(loc.lat, loc.lng, STORE_ORIGIN.lat, STORE_ORIGIN.lng) * 10) / 10;

    const { deliveryMaxMiles } = await ctx.runQuery(api.checkout.getDeliveryConfigQuery, {}) as { deliveryMaxMiles: number };
    const tiers = await ctx.runQuery(api.checkout.listDeliveryTiers, {}) as Array<{ enabled: boolean; minMiles: number; maxMiles: number; feeCents: number }>;
    const enabledTiers = tiers.filter((t) => t.enabled);
    const tier = enabledTiers.find(
      (t) => distanceMiles >= t.minMiles && distanceMiles < t.maxMiles
    );

    return {
      error: null,
      formattedAddress: data.results[0].formatted_address,
      distanceMiles,
      eligibleDelivery: distanceMiles <= deliveryMaxMiles,
      tierFeeCents: tier?.feeCents ?? null,
      tierLabel: tier ? `${tier.minMiles}–${tier.maxMiles} mi` : null,
    };
  },
});
