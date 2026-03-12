"use client";

import { Car, Package, Truck } from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";

import { setPreferredFulfillment } from "@/lib/fulfillmentPreference";
import type { FulfillmentMode } from "@/lib/fulfillmentPreference";
import { cn } from "@/lib/utils";

const FULFILLMENT_OPTIONS = [
  { mode: "delivery" as const, label: "Delivery", Icon: Truck },
  { mode: "pickup" as const, label: "Pickup", Icon: Car },
  { mode: "shipping" as const, label: "Ship", Icon: Package },
] as const;

export function FulfillmentBar({
  cartId,
  currentMode,
  onSelect,
}: {
  cartId: Id<"carts"> | null;
  currentMode: FulfillmentMode | null;
  onSelect: (mode: FulfillmentMode) => Promise<void>;
}) {
  async function handleSelect(mode: FulfillmentMode) {
    setPreferredFulfillment(mode);
    await onSelect(mode);
  }

  return (
    <div
      className="flex w-full gap-1 rounded-lg"
      role="group"
      aria-label="Choose delivery, pickup, or shipping"
    >
      {FULFILLMENT_OPTIONS.map(({ mode, label, Icon }) => {
        const isSelected = currentMode === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void handleSelect(mode);
            }}
            className={cn(
              "relative z-10 flex min-h-[44px] flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-lg border px-2 py-2.5 text-xs font-medium shadow-sm transition-colors active:scale-[0.98] sm:min-h-0 sm:px-3 sm:py-3 sm:text-sm",
              isSelected
                ? "border-brand bg-brand/15 text-brand shadow-md ring-1 ring-brand/30"
                : "border-stone-200/80 bg-transparent text-stone-600 hover:border-stone-300 hover:bg-rose-50/40"
            )}
          >
            <Icon
              className={cn(
                "h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4",
                isSelected ? "text-brand" : "text-stone-500"
              )}
              aria-hidden
            />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
