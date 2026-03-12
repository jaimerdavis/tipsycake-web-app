"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SignInButton, SignUpButton, UserButton, useAuth, useClerk } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

/**
 * Auth nav buttons (Sign in, Sign up, My Account, Sign out, UserButton).
 * Only render when Clerk is configured - useAuth requires ClerkProvider.
 * UserButton is client-only to avoid hydration mismatch.
 */
export function AuthNav() {
  const { isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (isSignedIn) {
    return (
      <>
        <Button asChild variant="ghost" size="sm" className="rounded-full">
          <Link href="/account">My Account</Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full text-muted-foreground hover:text-foreground"
          onClick={() => void signOut()}
        >
          Sign out
        </Button>
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
