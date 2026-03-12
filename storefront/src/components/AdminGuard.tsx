"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ADMIN_ROLES = ["admin", "manager", "kitchen", "dispatcher"] as const;

/** Protects admin routes: redirects unauthenticated to sign-in, shows access denied for customers/drivers.
 * Uses Clerk's isSignedIn for redirect decision to avoid redirect loop (Convex auth can lag after sign-in).
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth();
  const user = useQuery(api.users.meOrNull);
  const settings = useSiteSettings();
  const homeHref = (settings.get("homeUrl") || "/").trim() || "/";

  useEffect(() => {
    if (!clerkLoaded) return;
    if (!isSignedIn) {
      const signInUrl = `/sign-in?redirect_url=${encodeURIComponent(pathname)}`;
      router.replace(signInUrl);
    }
  }, [clerkLoaded, isSignedIn, pathname, router]);

  if (!clerkLoaded) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Redirecting to sign in...</p>
      </div>
    );
  }

  if (user === undefined) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (user === null || !ADMIN_ROLES.includes(user.role as (typeof ADMIN_ROLES)[number])) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>
              You don&apos;t have permission to view this page. Admin access is required.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button asChild>
              <Link href={homeHref}>Back to store</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/account">My account</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
