import { ConvexError } from "convex/values";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Extract user-friendly message from Convex-wrapped errors (e.g. coupon apply). */
export function extractCouponErrorMessage(err: unknown): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  // Fallback: ConvexError can lose instanceof across bundles; check for .data
  const obj = err && typeof err === "object" ? (err as { data?: unknown }) : null;
  if (obj && typeof obj.data === "string") return obj.data;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const match = msg.match(/Uncaught Error:\s*(.+?)(?=\s+at handler|$)/s);
  if (match) return match[1].trim();
  if (msg.includes("We couldn't find that code")) return "We couldn't find that code. Please double-check the spelling and try again.";
  if (msg.includes("no longer active")) return "This coupon is no longer active.";
  if (msg.includes("Coupon expired")) return "Coupon expired.";
  if (msg.includes("usage limit reached")) return "Coupon usage limit reached.";
  if (msg.includes("Per-customer usage limit")) return "Per-customer usage limit reached.";
  return msg || "Invalid coupon code.";
}

/** Display name for products: removes "Cake" suffix except for Jamaican Fruit Cake */
export function productDisplayName(name: string): string {
  if (name === "Jamaican Fruit Cake") return name;
  return name.replace(/\s+Cake$/i, "").trim() || name;
}
