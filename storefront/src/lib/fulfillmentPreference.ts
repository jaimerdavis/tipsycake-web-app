const PREFERRED_FULFILLMENT_KEY = "tipsycake.preferredFulfillmentMode";

export type FulfillmentMode = "pickup" | "delivery" | "shipping";

export function getPreferredFulfillment(): FulfillmentMode | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(PREFERRED_FULFILLMENT_KEY);
  if (raw === "pickup" || raw === "delivery" || raw === "shipping") {
    return raw;
  }
  return null;
}

export function setPreferredFulfillment(mode: FulfillmentMode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PREFERRED_FULFILLMENT_KEY, mode);
}

export function clearPreferredFulfillment(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PREFERRED_FULFILLMENT_KEY);
}
