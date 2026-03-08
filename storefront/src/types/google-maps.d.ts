/**
 * Shared Google Maps API types for AddressAutocomplete (places) and DeliveryMap (maps).
 * Merged to avoid conflicting Window.google declarations.
 */
declare global {
  interface Window {
    initDeliveryMap?: () => void;
    initGooglePlaces?: () => void;
    google?: {
      maps: {
        Map: new (el: HTMLElement, opts: object) => object;
        LatLng: new (lat: number, lng: number) => object;
        LatLngBounds: new () => { extend: (p: object) => void; isEmpty: () => boolean };
        Marker: new (opts: object) => object;
        places: {
          Autocomplete: new (
            input: HTMLInputElement,
            options?: {
              types?: string[];
              componentRestrictions?: { country: string };
              fields?: string[];
            }
          ) => {
            addListener: (event: string, callback: () => void) => void;
            getPlace: () => {
              formatted_address?: string;
              place_id?: string;
              geometry?: { location: { lat: () => number; lng: () => number } };
              address_components?: Array<{
                types: string[];
                long_name: string;
                short_name: string;
              }>;
            };
          };
        };
      };
    };
  }
}

export {};
