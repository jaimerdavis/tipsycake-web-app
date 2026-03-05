"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

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

/** Store lat/lng for distance calculation (e.g. bakery). */
const STORE_ORIGIN = { lat: 37.7749, lng: -122.4194 }; // placeholder; set via env

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

    const R = 3959; // Earth radius miles
    const dLat: number = ((lat - STORE_ORIGIN.lat) * Math.PI) / 180;
    const dLng: number = ((lng - STORE_ORIGIN.lng) * Math.PI) / 180;
    const a: number =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((STORE_ORIGIN.lat * Math.PI) / 180) *
        Math.cos((lat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    const c: number = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceMiles: number = R * c;

    interface DeliveryZone {
      _id: string;
      enabled: boolean;
      polygonGeoJson?: { coordinates?: number[][][] };
    }
    const zones = (await ctx.runQuery(api.addresses.listDeliveryZones, {})) as DeliveryZone[];

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

    await ctx.runMutation(api.addresses.upsertAddressCache, {
      addressId: args.addressId,
      distanceMiles,
      zoneId: (zoneId ?? undefined) as never,
      eligibleDelivery: zones.some((z: DeliveryZone) => z.enabled) && distanceMiles < 15,
      eligibleShipping: true,
      computedAt: Date.now(),
    });

    return { distanceMiles, zoneId, eligibleDelivery: distanceMiles < 15, eligibleShipping: true };
  },
});
