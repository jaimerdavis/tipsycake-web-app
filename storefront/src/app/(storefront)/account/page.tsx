"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useAction, useConvexAuth } from "convex/react";
import { useClerk, useAuth, UserButton } from "@clerk/nextjs";
import { useState, useEffect, useSyncExternalStore } from "react";

import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CUSTOMER_STATUS_LABELS } from "@/lib/orderStatusConfig";
import { ChevronDown, ChevronRight, Package } from "lucide-react";

export const dynamic = "force-dynamic";

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

const SHARE_BONUS_POINTS = 500;

export default function AccountPage() {
  const { isLoaded, isSignedIn } = useAuth();
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
  const [userButtonMounted, setUserButtonMounted] = useState(false);
  const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  useEffect(() => {
    setUserButtonMounted(true);
  }, []);

  const runDebugSync = useAction(api.usersSync.debugSyncResult);
  const debugSessionState = useQuery(api.users.debugSessionState);
  const [retryPending, setRetryPending] = useState(false);
  const { signOut } = useClerk();
  const router = useRouter();

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
        </Button>
      </main>
    );
  }

  // Redirect to products when signed out (avoids blank/rendering state from RedirectToSignIn)
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/products");
    }
  }, [isLoaded, isSignedIn, router]);

  if (isLoaded && !isSignedIn) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
        <p className="text-sm text-muted-foreground">Redirecting…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-brand-text">
            {me?.name
              ? `Welcome back, ${me.name.split(/\s+/)[0]}!`
              : "My Account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            View order history and track your orders
          </p>
        </div>
        {userButtonMounted ? (
          <UserButton
            appearance={{
              variables: { colorPrimary: "#e92486" },
            }}
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-muted animate-pulse" aria-hidden />
        )}
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
                  Placed an order as a guest? Create an account or log in with the same email and we&apos;ll link your order history.
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
            <ul className="space-y-4">
              {orders.map((order, index) => {
                const isLatest = index === 0;
                const statusLabel = CUSTOMER_STATUS_LABELS[order.status] ?? order.status.replace(/_/g, " ");
                return (
                  <li key={order._id}>
                    <div
                      className={`flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between transition-all ${
                        isLatest
                          ? "border-2 border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-white shadow-md"
                          : "border bg-card"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {isLatest && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                              <Package className="h-3 w-3" />
                              Latest order
                            </span>
                          )}
                          <p className="font-medium">
                            Order #{order.orderNumber}
                          </p>
                          <Badge variant={isLatest ? "default" : "secondary"} className="capitalize">
                            {statusLabel}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground capitalize mt-1">
                          {order.fulfillmentMode} &middot;{" "}
                          {new Date(order.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {order.items
                            .map(
                              (item) =>
                                `${(item.productSnapshot as { name?: string })?.name ?? "Item"} × ${item.qty}`
                            )
                            .join(", ")}
                        </p>
                        <span className="mt-1 block font-semibold">
                          {dollars(order.pricingSnapshot.totalCents)}
                        </span>
                      </div>
                      <Button asChild variant="outline" size="sm" className="shrink-0 rounded-full">
                        <Link href={`/orders/${order.guestToken}`}>
                          View details
                        </Link>
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Collapsible defaultOpen={false}>
        <Card>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="group flex w-full items-center justify-between p-6 text-left transition-colors hover:bg-muted/30 rounded-lg"
            >
              <div>
                <CardTitle className="font-display text-xl text-brand-text">
                  Earn Points
                </CardTitle>
                <CardDescription>
                  Share and earn loyalty points
                </CardDescription>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground group-data-[state=open]:hidden" />
              <ChevronDown className="h-5 w-5 shrink-0 hidden text-muted-foreground group-data-[state=open]:block" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6 pt-0">
              {shareBonusClaimed === false && (
                <div className="space-y-2 rounded-lg border p-4">
                  <p className="font-medium">Share & Earn — {SHARE_BONUS_POINTS} points (one-time)</p>
                  <p className="text-sm text-muted-foreground">
                    Share TheTipsyCake with friends and claim your bonus.
                  </p>
                  {shareError && (
                    <p className="text-sm text-destructive">{shareError}</p>
                  )}
                  <Button
                    onClick={handleShareAndClaim}
                    disabled={sharePending}
                    size="sm"
                    className="rounded-full bg-button text-stone-50 hover:bg-button-hover"
                  >
                    {sharePending ? "Sharing…" : "Share & claim 500 points"}
                  </Button>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

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

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/products">Browse Menu</Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/cart">View Cart</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/account/privacy">Privacy &amp; Data</Link>
        </Button>
      </div>
    </main>
  );
}
