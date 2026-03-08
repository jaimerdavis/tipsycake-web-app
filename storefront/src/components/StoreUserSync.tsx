"use client";

import { useEffect } from "react";
import { useMutation, useConvexAuth } from "convex/react";
import { api } from "../../convex/_generated/api";

/**
 * Syncs Clerk identity to Convex users table on sign-in.
 * Must be a child of ConvexProviderWithClerk when Clerk is configured.
 */
export function StoreUserSync({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const storeUser = useMutation(api.users.storeUser);

  useEffect(() => {
    if (isAuthenticated) {
      storeUser().catch(() => {
        // Ignore - user may not exist yet or mutation may fail on first render
      });
    }
  }, [isAuthenticated, storeUser]);

  return <>{children}</>;
}
