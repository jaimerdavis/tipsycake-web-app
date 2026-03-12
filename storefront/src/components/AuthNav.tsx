"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/SignOutButton";

/**
 * Auth nav buttons (Sign in, Sign up, My Account, Sign out, UserButton).
 * Only render when Clerk is configured - useAuth requires ClerkProvider.
 * UserButton is client-only to avoid hydration mismatch.
 */
export function AuthNav() {
  const { isSignedIn } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (isSignedIn) {
    return (
      <>
        <Button asChild variant="ghost" size="sm" className="rounded-full">
          <Link href="/account">My Account</Link>
        </Button>
        <SignOutButton className="inline-flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          Sign out
        </SignOutButton>
        {mounted && <UserButton appearance={{ variables: { colorPrimary: "#e92486" } }} />}
      </>
    );
  }

  return (
    <>
      <SignInButton mode="modal">
        <Button variant="ghost" size="sm" className="rounded-full">
          Log in
        </Button>
      </SignInButton>
      <SignUpButton mode="modal">
        <Button size="sm" className="rounded-full">
          Create account
        </Button>
      </SignUpButton>
    </>
  );
}
