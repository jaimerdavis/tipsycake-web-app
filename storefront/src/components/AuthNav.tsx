"use client";

import Link from "next/link";
import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

/**
 * Auth nav buttons (Sign in, Sign up, Account, UserButton).
 * Only render when Clerk is configured - useAuth requires ClerkProvider.
 */
export function AuthNav() {
  const { isSignedIn } = useAuth();

  if (isSignedIn) {
    return (
      <>
        <Button asChild variant="ghost" size="sm" className="rounded-full">
          <Link href="/account">Account</Link>
        </Button>
        <UserButton appearance={{ variables: { colorPrimary: "#e92486" } }} />
      </>
    );
  }

  return (
    <>
      <SignInButton mode="modal">
        <Button variant="ghost" size="sm" className="rounded-full">
          Sign in
        </Button>
      </SignInButton>
      <SignUpButton mode="modal">
        <Button size="sm" className="rounded-full">
          Sign up
        </Button>
      </SignUpButton>
    </>
  );
}
