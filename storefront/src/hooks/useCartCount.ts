"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { useAuth } from "@clerk/nextjs";
import { api } from "../../convex/_generated/api";
import { getOrCreateGuestSessionId } from "@/lib/guestSession";

/**
 * Returns the total number of items in the active cart (sum of qty across all items).
 * Returns 0 when no cart or cart is empty.
 */
export function useCartCount(): number {
  const { isSignedIn } = useAuth();
  const [guestSessionId, setGuestSessionId] = useState("");
  useEffect(() => {
    setGuestSessionId(getOrCreateGuestSessionId());
  }, []);

  const cart = useQuery(
    api.cart.getActive,
    isSignedIn ? {} : guestSessionId ? { guestSessionId } : "skip"
  );

  return useMemo(() => {
    if (!cart?.items?.length) return 0;
    return cart.items.reduce((sum, item) => sum + item.qty, 0);
  }, [cart?.items]);
}
