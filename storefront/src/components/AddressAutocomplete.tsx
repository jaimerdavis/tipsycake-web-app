"use client";

import { useCallback, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { useSiteSettings } from "@/hooks/useSiteSettings";

interface AddressResult {
  formatted: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
  placeId: string;
}

interface AddressAutocompleteProps {
  onSelect: (address: AddressResult) => void;
  placeholder?: string;
}

function parseAddressComponents(
  components: Array<{ types: string[]; long_name: string; short_name: string }>
) {
  let streetNumber = "";
  let route = "";
  let city = "";
  let state = "";
  let zip = "";

  for (const c of components) {
    if (c.types.includes("street_number")) streetNumber = c.long_name;
    if (c.types.includes("route")) route = c.long_name;
    if (c.types.includes("locality")) city = c.long_name;
    if (c.types.includes("administrative_area_level_1")) state = c.short_name;
    if (c.types.includes("postal_code")) zip = c.long_name;
  }

  return {
    line1: [streetNumber, route].filter(Boolean).join(" "),
    city,
    state,
    zip,
  };
}

export function AddressAutocomplete({
  onSelect,
  placeholder = "Start typing your address...",
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const initializedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  const { get } = useSiteSettings();
  const apiKey = get("googleMapsClientKey");

  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  const initAutocomplete = useCallback(() => {
    if (initializedRef.current) return;
    if (!inputRef.current || !window.google?.maps?.places) return;

    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ["address"],
      componentRestrictions: { country: "us" },
      fields: [
        "formatted_address",
        "geometry",
        "place_id",
        "address_components",
      ],
    });

    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      if (!place.geometry?.location || !place.address_components) return;

      const parsed = parseAddressComponents(place.address_components);
      onSelectRef.current({
        formatted: place.formatted_address ?? "",
        line1: parsed.line1,
        city: parsed.city,
        state: parsed.state,
        zip: parsed.zip,
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        placeId: place.place_id ?? "",
      });
    });

    initializedRef.current = true;
  }, []);

  useEffect(() => {
    if (!apiKey) return;

    if (window.google?.maps?.places) {
      initAutocomplete();
      return;
    }

    window.initGooglePlaces = () => {
      initAutocomplete();
    };

    const existingScript = document.querySelector(
      'script[src*="maps.googleapis.com/maps/api/js"]'
    );
    if (!existingScript) {
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGooglePlaces`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    return () => {
      delete window.initGooglePlaces;
    };
  }, [initAutocomplete, apiKey]);

  if (!apiKey) {
    return (
      <p className="text-xs text-muted-foreground">
        Google Maps API key not configured. Use manual address entry below.
      </p>
    );
  }

  return (
    <Input
      ref={inputRef}
      placeholder={placeholder}
      autoComplete="street-address"
    />
  );
}
