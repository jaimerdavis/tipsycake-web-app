"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";

const ADMIN_ROLES = ["admin", "manager", "kitchen", "dispatcher"] as const;

/**
 * Post-login landing page. Redirects users to the appropriate destination based on role:
 * - Admin/manager/kitchen/dispatcher → /admin/orders
 * - Everyone else → /account
 */
export default function AuthRedirectPage() {
  const router = useRouter();
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth();
  const me = useQuery(api.users.meOrNull);

  useEffect(() => {
    if (!clerkLoaded) return;
    if (!isSignedIn) {
      router.replace("/products");
      return;
    }
    if (me === undefined) return;
    if (me === null) {
      router.replace("/account");
      return;
    }
    const role = me.role as (typeof ADMIN_ROLES)[number];
    if (ADMIN_ROLES.includes(role)) {
      router.replace("/admin/orders");
    } else {
      router.replace("/account");
    }
  }, [clerkLoaded, isSignedIn, me, router]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-4">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="text-sm text-muted-foreground">Taking you to your account...</p>
    </div>
  );
}
