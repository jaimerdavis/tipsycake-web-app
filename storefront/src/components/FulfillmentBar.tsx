"use client";

import { useState } from "react";
import { Car, ChevronDown, Package, Truck } from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { setPreferredFulfillment } from "@/lib/fulfillmentPreference";
import type { FulfillmentMode } from "@/lib/fulfillmentPreference";
import { cn } from "@/lib/utils";

const FULFILLMENT_OPTIONS = [
  { mode: "delivery" as const, label: "Local Delivery", Icon: Truck },
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
  const [open, setOpen] = useState(false);

  async function handleSelect(mode: FulfillmentMode) {
    setPreferredFulfillment(mode);
    await onSelect(mode);
    setOpen(false);
  }

  const currentLabel =
    currentMode === "pickup"
      ? "Pickup"
      : currentMode === "delivery"
        ? "Delivery"
        : currentMode === "shipping"
          ? "Ship"
          : null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-stone-200/80 bg-gradient-to-r from-white via-rose-50/40 to-white px-3 py-2 text-xs font-medium text-stone-600 shadow-sm transition-colors hover:opacity-95 active:scale-[0.99]"
          aria-label="Choose delivery, pickup, or shipping"
        >
          <Truck className="h-3.5 w-3.5 shrink-0 text-stone-500" aria-hidden />
          <span>Delivery</span>
          <span className="text-stone-400" aria-hidden>
            •
          </span>
          <Car className="h-3.5 w-3.5 shrink-0 text-stone-500" aria-hidden />
          <span>Pickup</span>
          <span className="text-stone-400" aria-hidden>
            •
          </span>
          <Package className="h-3.5 w-3.5 shrink-0 text-stone-500" aria-hidden />
          <span>Ship</span>
          <ChevronDown className="ml-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden />
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>How would you like your order?</SheetTitle>
          <SheetDescription>
            {currentLabel
              ? `Currently: ${currentLabel}`
              : "Choose delivery, pickup, or shipping."}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 flex flex-col gap-2">
          {FULFILLMENT_OPTIONS.map(({ mode, label, Icon }) => {
            const isSelected = currentMode === mode;
            const isPickup = mode === "pickup";

            return (
              <div key={mode} className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                    isSelected ? "bg-brand/20 text-brand" : "bg-stone-100 text-stone-600"
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <button
                  type="button"
                  onClick={() => void handleSelect(mode)}
                  className={cn(
                    "flex flex-1 cursor-pointer items-center rounded-lg border px-4 py-3 text-left font-medium transition-colors",
                    isSelected
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-stone-200 bg-white hover:bg-stone-50"
                  )}
                >
                  {label}
                  {!isPickup && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      — Set in checkout
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
