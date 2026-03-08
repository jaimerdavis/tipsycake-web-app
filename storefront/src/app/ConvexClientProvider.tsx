"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";
import { StoreUserSync } from "@/components/StoreUserSync";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function ConvexClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!convex) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-center">
        <p className="text-destructive">
          Missing NEXT_PUBLIC_CONVEX_URL. Add it to .env.local and restart.
        </p>
      </div>
    );
  }
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (publishableKey) {
    return (
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <StoreUserSync>{children}</StoreUserSync>
      </ConvexProviderWithClerk>
    );
  }
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
