import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Display name for products: removes "Cake" suffix except for Jamaican Fruit Cake */
export function productDisplayName(name: string): string {
  if (name === "Jamaican Fruit Cake") return name;
  return name.replace(/\s+Cake$/i, "").trim() || name;
}
