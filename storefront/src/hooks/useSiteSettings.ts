"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const ENV_FALLBACKS: Record<string, string | undefined> = {
  stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  googleMapsClientKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  mapboxAccessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
};

export function useSiteSettings() {
  const dbSettings = useQuery(api.admin.settings.getPublic);
  return {
    loading: dbSettings === undefined,
    get(key: string): string {
      return dbSettings?.[key] || ENV_FALLBACKS[key] || "";
    },
  };
}
