/**
 * Centralized store config. Single source for values used across maps, checkout, etc.
 * Override via siteSettings in the future if needed.
 */

/**
 * Default base URL for the order app (storefront + admin at order.thetipsycake.com).
 * Used when siteSettings.siteUrl or NEXT_PUBLIC_SITE_URL is not set.
 * All email links (admin, order tracking, cart) must use this or the configured value — never invented or placeholder URLs.
 */
export const DEFAULT_SITE_URL = "https://order.thetipsycake.com";

/** Store lat/lng for distance calculation (Lauderhill FL). */
export const STORE_ORIGIN = { lat: 26.187, lng: -80.265 };

/** Delivery cutoff: beyond this distance, local delivery is not available (use shipping). Overridable via siteSettings.deliveryMaxMiles. */
export const DELIVERY_MAX_MILES = 20;

/** Shipping fee per cake in cents ($19 default). Applied when fulfillment = shipping. Overridable via siteSettings.shippingFeePerCakeCents. */
export const SHIPPING_FEE_PER_CAKE_CENTS = 1900;
