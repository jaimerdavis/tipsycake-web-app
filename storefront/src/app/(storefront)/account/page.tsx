"use client";

import Link from "next/link";
import { useQuery, useMutation, useAction, useConvexAuth } from "convex/react";
import { UserButton } from "@clerk/nextjs";
import { useState, useEffect } from "react";

import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

const SHARE_BONUS_POINTS = 500;

export default function AccountPage() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.meOrNull);
  const orders = useQuery(api.orders.listByUser);
  const storeUser = useMutation(api.users.storeUser);
  const syncUserEmailFromClerk = useAction(api.usersSync.syncUserEmailFromClerk);
  const linkOrdersByEmail = useMutation(api.orders.linkOrdersByEmail);
  const shareBonusClaimed = useQuery(api.loyalty.getShareBonusClaimed);
  const claimShareBonus = useMutation(api.loyalty.claimShareBonus);
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharePending, setSharePending] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugResult, setDebugResult] = useState<{
    sync?: { clerkUserId: string | null; apiStatus: number | null; apiStatusText: string | null; emailFromResponse: string | null; error: string | null };
    session?: { tokenIdentifier: string; userEmail: string | null; identityEmail: string | null; wouldSyncHaveEmail: boolean } | null;
  } | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [retryStatus, setRetryStatus] = useState<string | null>(null);
  const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  const runDebugSync = useAction(api.usersSync.debugSyncResult);
  const debugSessionState = useQuery(api.users.debugSessionState);
  const [retryPending, setRetryPending] = useState(false);

  async function handleRetrySyncAndLink() {
    setRetryStatus("Running…");
    setRetryPending(true);
    if (!me) {
      setRetryStatus("Account still loading. Please wait a moment and try again.");
      setRetryPending(false);
      return;
    }
    try {
      await syncUserEmailFromClerk();
      const linked = await linkOrdersByEmail();
      setRetryStatus(linked > 0 ? `Linked ${linked} order(s).` : "Sync complete. If you have orders, they should appear.");
    } catch (e) {
      setRetryStatus("Error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setRetryPending(false);
    }
  }

  async function handleRunDiagnostic() {
    setDebugLoading(true);
    setDebugResult({ sync: { clerkUserId: null, apiStatus: null, apiStatusText: null, emailFromResponse: null, error: "Running…" }, session: undefined });
    try {
      const sync = await runDebugSync();
      setDebugResult({
        sync: {
          clerkUserId: sync.clerkUserId,
          apiStatus: sync.apiStatus,
          apiStatusText: sync.apiStatusText,
          emailFromResponse: sync.emailFromResponse,
          error: sync.error,
        },
        session: debugSessionState ?? undefined,
      });
      setDebugOpen(true);
    } catch (e) {
      setDebugResult({
        sync: { clerkUserId: null, apiStatus: null, apiStatusText: null, emailFromResponse: null, error: String(e) },
        session: debugSessionState ?? undefined,
      });
      setDebugOpen(true);
    } finally {
      setDebugLoading(false);
    }
  }

  // Ensure Convex user exists before showing orders (fixes race with StoreUserSync)
  useEffect(() => {
    if (isAuthenticated && me === null) {
      storeUser().catch((err) => {
        console.error("[account] storeUser failed:", err);
      });
    }
  }, [isAuthenticated, me, storeUser]);

  // Sync Convex user email from Clerk API (no JWT template change needed), then link past orders
  useEffect(() => {
    if (!me) return;
    void syncUserEmailFromClerk()
      .then(() => linkOrdersByEmail())
      .catch((err) => {
        console.error("[account] syncUserEmailFromClerk or linkOrdersByEmail failed:", err);
      });
  }, [me, syncUserEmailFromClerk, linkOrdersByEmail]);

  async function handleRetrySync() {
    if (!me) return;
    setRetryStatus("Syncing…");
    try {
      await syncUserEmailFromClerk();
      const linked = await linkOrdersByEmail();
      setRetryStatus(linked > 0 ? `Linked ${linked} order(s). Refresh below.` : "Sync complete. No new orders to link.");
    } catch (e) {
      setRetryStatus("Error: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleShareAndClaim() {
    setShareError(null);
    setSharePending(true);
    try {
      const url = typeof window !== "undefined" ? window.location.origin : "";
      const title = "TheTipsyCake - Handcrafted Bundt Cakes";
      const text = "Check out TheTipsyCake for delicious handcrafted bundt cakes!";

      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title, text, url });
      } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        setShareError("Sharing not supported in this browser");
        return;
      }
      await claimShareBonus();
    } catch (e) {
      setShareError(e instanceof Error ? e.message : "Failed to claim bonus");
    } finally {
      setSharePending(false);
    }
  }

  if (!hasClerk) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
        <p className="text-sm text-muted-foreground">
          Sign-in is not configured. Add Clerk keys to enable account access.
        </p>
        <Button asChild>
          <Link href="/">Back to home</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-brand-text">
            My Account
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            View order history and track your orders
          </p>
        </div>
        <UserButton
          appearance={{
            variables: { colorPrimary: "#e92486" },
          }}
        />
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl text-brand-text">Order History</CardTitle>
          <CardDescription>Your recent orders</CardDescription>
        </CardHeader>
        <CardContent>
          {orders === undefined || (isAuthenticated && me === null) ? (
            <p className="text-sm text-muted-foreground">
              {isAuthenticated && me === null ? "Setting up your account..." : "Loading orders..."}
            </p>
          ) : orders.length === 0 ? (
            <>
              <p className="text-sm text-muted-foreground">
                No orders yet.{" "}
                <Link href="/products" className="font-medium text-brand-text underline">
                  Start ordering
                </Link>
              </p>
              <div className="mt-4 space-y-2 rounded-lg border-2 border-amber-400 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-900">Orders not showing?</p>
                <p className="text-xs text-amber-800">
                  Sync your account with Clerk and link past orders. Try &quot;Retry sync & link&quot; first, or run the diagnostic to see what&apos;s happening.
                </p>
                <div className="flex flex-wrap gap-2" style={{ touchAction: "manipulation" }}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={retryPending}
                    onClick={() => void handleRetrySyncAndLink()}
                  >
                    {retryPending ? "Syncing…" : "Retry sync & link"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={debugLoading}
                    onClick={() => void handleRunDiagnostic()}
                  >
                    {debugLoading ? "Running…" : "Run diagnostic"}
                  </Button>
                </div>
                {retryStatus && (
                  <p className="text-xs font-medium text-amber-900" role="status" aria-live="polite">
                    {retryStatus}
                  </p>
                )}
                {debugResult && (
                  <pre className="mt-2 max-h-48 overflow-auto rounded border bg-white p-2 text-xs">
                    {JSON.stringify(debugResult, null, 2)}
                  </pre>
                )}
              </div>
            </>
          ) : (
            <ul className="space-y-3">
              {orders.map((order) => (
                <li key={order._id}>
                  <Link
                    href={`/orders/${order.guestToken}`}
                    className="block rounded-lg border p-4 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">Order {order.orderNumber}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {order.fulfillmentMode} &middot;{" "}
                          {new Date(order.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge>{order.status}</Badge>
                        <span className="font-semibold">
                          {dollars(order.pricingSnapshot.totalCents)}
                        </span>
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-1 text-sm text-muted-foreground">
                      {order.items
                        .map(
                          (item) =>
                            `${(item.productSnapshot as { name?: string })?.name ?? "Item"} × ${item.qty}`
                        )
                        .join(", ")}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {shareBonusClaimed === false && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl text-brand-text">Share & Earn</CardTitle>
            <CardDescription>
              Share TheTipsyCake with friends and earn {SHARE_BONUS_POINTS} loyalty points (one-time)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {shareError && (
              <p className="text-sm text-destructive">{shareError}</p>
            )}
            <Button
              onClick={handleShareAndClaim}
              disabled={sharePending}
              className="rounded-full bg-button text-stone-50 hover:bg-button-hover"
            >
              {sharePending ? "Sharing…" : "Share & claim 500 points"}
            </Button>
          </CardContent>
        </Card>
      )}

      {orders?.length === 0 && me && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader>
            <CardTitle className="text-sm">Debug: Order linking</CardTitle>
            <CardDescription>
              If orders should appear but don&apos;t, run this to see sync status.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded border bg-white p-2 text-xs font-mono">
              <p><strong>Session:</strong> {debugSessionState ? JSON.stringify(debugSessionState, null, 2) : "loading…"}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={debugLoading}
              onClick={handleRunDiagnostic}
            >
              {debugLoading ? "Running…" : "Run diagnostic"}
            </Button>
            {debugResult && (
              <pre className="overflow-auto rounded border bg-white p-2 text-xs">
                {JSON.stringify(debugResult, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/products">Browse Menu</Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/cart">View Cart</Link>
        </Button>
      </div>
    </main>
  );
}
