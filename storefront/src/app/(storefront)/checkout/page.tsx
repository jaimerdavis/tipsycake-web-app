"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { SignInButton, SignUpButton, useUser } from "@clerk/nextjs";
import { CheckCircle2, ChevronDown } from "lucide-react";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { StripePaymentForm } from "@/components/StripePaymentForm";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { useSiteSettings } from "@/hooks/useSiteSettings";

import { getOrCreateGuestSessionId as getGuestSessionId } from "@/lib/guestSession";
import {
  clearPreferredFulfillment,
  getPreferredFulfillment,
} from "@/lib/fulfillmentPreference";
import { toast } from "sonner";
import { extractCouponErrorMessage, productDisplayName } from "@/lib/utils";

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDateForDisplay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSlotTime(hm: string): string {
  const [h, m] = hm.split(":").map(Number);
  const hour = h % 12 || 12;
  const ampm = h < 12 ? "AM" : "PM";
  return m === 0 ? `${hour}${ampm}` : `${hour}:${String(m).padStart(2, "0")}${ampm}`;
}

function formatSecondsAsCountdown(secs: number): string {
  if (secs <= 0) return "0s";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

function SameDayCutoffTimer({
  initialMinutes,
  cutoffTime,
}: {
  initialMinutes: number;
  cutoffTime?: string;
}) {
  const [secondsLeft, setSecondsLeft] = useState(initialMinutes * 60);

  useEffect(() => {
    setSecondsLeft(initialMinutes * 60);
  }, [initialMinutes]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  return (
    <p className="mt-1.5 font-medium tabular-nums">
      Same day orders must be received by {cutoffTime ? formatSlotTime(cutoffTime) : "store cutoff"} — {formatSecondsAsCountdown(secondsLeft)} left
    </p>
  );
}

const FULFILLMENT_LABELS: Record<"pickup" | "delivery" | "shipping", string> = {
  pickup: "Pickup",
  delivery: "Local Delivery",
  shipping: "Shipping",
};

/** Extract customer-friendly message from setFulfillment errors (Convex wraps server errors). */
function fulfillmentErrorMessage(err: unknown, maxMiles: number): string {
  const msg = err instanceof Error ? err.message : "";
  if (msg.includes("qualifies for local delivery") || msg.includes("deliver locally")) {
    return `We deliver locally within ${maxMiles} miles and ship to addresses beyond that. Your address qualifies for local delivery.`;
  }
  return msg || "Update failed";
}

function PlaceFreeOrderButton({
  cartId,
  onSuccess,
  onError,
}: {
  cartId: Id<"carts">;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const completeFreeOrder = useMutation(api.orders.completeFreeOrder);
  const [pending, setPending] = useState(false);

  async function handlePlaceOrder() {
    setPending(true);
    onError("");
    try {
      await completeFreeOrder({ cartId });
      onSuccess();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to place order");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      onClick={handlePlaceOrder}
      disabled={pending}
      className="w-full rounded-full bg-button text-stone-50 hover:bg-button-hover"
    >
      {pending ? "Placing order…" : "Place order"}
    </Button>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading checkout…</div>}>
      <CheckoutContent />
    </Suspense>
  );
}

const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

function CheckoutContent() {
  const router = useRouter();
  const [guestSessionId, setGuestSessionId] = useState("");
  useEffect(() => {
    setGuestSessionId(getGuestSessionId());
  }, []);
  const settings = useSiteSettings();
  const pickupAddress = settings.get("storeAddress");
  const { user } = useUser();
  const convertGuestCartToUser = useMutation(api.cart.convertGuestCartToUser);
  const [mergeAttempted, setMergeAttempted] = useState(false);

  const cart = useQuery(api.cart.getActive, guestSessionId ? { guestSessionId } : "skip");

  // When signed in with guest session, merge guest cart into user cart so order gets userId
  useEffect(() => {
    if (!user || !guestSessionId || mergeAttempted) return;
    setMergeAttempted(true);
    convertGuestCartToUser({ guestSessionId }).catch(() => {
      // Don't reset mergeAttempted - would cause infinite retry loop on persistent errors
    });
  }, [user, guestSessionId, mergeAttempted, convertGuestCartToUser]);
  const clerkEmail = user?.primaryEmailAddress?.emailAddress ?? "";
  const clerkPhone = user?.primaryPhoneNumber?.phoneNumber ?? "";
  const addresses = useQuery(
    api.addresses.listAddresses,
    guestSessionId ? { guestSessionId, contactEmail: cart?.contactEmail ?? undefined } : "skip"
  );

  const [selectedMode, setSelectedMode] = useState<"" | "pickup" | "delivery" | "shipping">("");
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const [newAddress, setNewAddress] = useState({
    formatted: "",
    line1: "",
    city: "",
    state: "",
    zip: "",
    lat: "0",
    lng: "0",
  });

  const searchParams = useSearchParams();
  const urlStatus = searchParams.get("status");
  const urlCartId = searchParams.get("cartId");
  const [paymentSuccess, setPaymentSuccess] = useState(urlStatus === "success");
  const [confirmedCartId, setConfirmedCartId] = useState<string | null>(
    urlStatus === "success" ? (urlCartId || (cart?._id ?? null)) : null
  );

  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactName, setContactName] = useState("");
  const [cakeFor, setCakeFor] = useState("");
  const [occasion, setOccasion] = useState("");
  const [contactSynced, setContactSynced] = useState(false);

  const [savingContact, setSavingContact] = useState(false);
  const [savingFulfillment, setSavingFulfillment] = useState(false);
  const [fulfillmentSheetOpen, setFulfillmentSheetOpen] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [showManualAddress, setShowManualAddress] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [addressToConfirm, setAddressToConfirm] = useState<{
    formatted: string;
    line1: string;
    city: string;
    state: string;
    zip: string;
    lat: number;
    lng: number;
    placeId?: string;
  } | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [couponMessage, setCouponMessage] = useState<{ text: string; error: boolean } | null>(null);

  const applyCoupon = useMutation(api.cart.applyCoupon);
  const removeCoupon = useMutation(api.cart.removeCoupon);

  const GUEST_CHOSEN_KEY = "checkoutGuestChosen";
  const [guestCheckoutChosen, setGuestCheckoutChosen] = useState(false);
  const [guestConfirmOpen, setGuestConfirmOpen] = useState(false);
  const signUpTriggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setGuestCheckoutChosen(sessionStorage.getItem(GUEST_CHOSEN_KEY) === "1");
  }, []);

  const justCompletedCartIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (paymentSuccess && cart?._id && !confirmedCartId) {
      setConfirmedCartId(cart._id);
    }
  }, [paymentSuccess, cart?._id, confirmedCartId]);

  const effectiveConfirmedCartId = confirmedCartId ?? justCompletedCartIdRef.current;
  const confirmedOrder = useQuery(
    api.orders.getByCartId,
    effectiveConfirmedCartId ? { cartId: effectiveConfirmedCartId as Id<"carts"> } : "skip"
  );

  const clerkName =
    user?.firstName && user?.lastName
      ? `${user.firstName} ${user.lastName}`.trim()
      : user?.firstName ?? user?.lastName ?? "";

  useEffect(() => {
    if (!cart) return;
    const email = cart.contactEmail ?? clerkEmail ?? "";
    const phone = cart.contactPhone ?? clerkPhone ?? "";
    const name = cart.contactName ?? clerkName ?? "";
    const forVal = cart.cakeFor ?? "";
    const occ = cart.occasion ?? "";
    setContactEmail(email);
    setContactPhone(phone);
    setContactName(name);
    setCakeFor(forVal);
    setOccasion(occ);
    // Only sync address from cart when initializing or when cart confirms our selection.
    // Avoid overwriting during setFulfillment in-flight (prevents address "bouncing").
    setSelectedAddressId((prev) => {
      if (!cart.addressId) return "";
      if (!prev || prev === cart.addressId) return cart.addressId;
      return prev;
    });
    if (!selectedMode) {
      if (cart.fulfillmentMode) {
        setSelectedMode(cart.fulfillmentMode);
      } else {
        const preferred = getPreferredFulfillment();
        if (preferred) setSelectedMode(preferred);
      }
    }
    setContactSynced(true);
  }, [cart, clerkEmail, clerkPhone, clerkName]);

  const setContact = useMutation(api.cart.setContact);
  const autoSavedRef = useRef(false);
  useEffect(() => {
    if (!cart || !clerkEmail || cart.contactEmail || autoSavedRef.current) return;
    autoSavedRef.current = true;
    setContact({
      cartId: cart._id,
      email: clerkEmail,
      phone: clerkPhone || undefined,
      contactName: clerkName || undefined,
    }).catch(() => {
      // Don't reset autoSavedRef - would cause repeated retries on every deps change
    });
  }, [cart?._id, cart?.contactEmail, clerkEmail, clerkPhone, setContact]);

  const needsAddress = selectedMode === "delivery" || selectedMode === "shipping";
  const needsSchedulingForMode = selectedMode === "pickup" || selectedMode === "delivery";
  const cakeCount = cart?.items?.reduce((s, i) => s + i.qty, 0) ?? 0;
  const deliveryConfig = useQuery(api.checkout.getDeliveryConfigQuery, {});
  const eligibility = useQuery(
    api.checkout.getEligibility,
    needsAddress && selectedAddressId
      ? { addressId: selectedAddressId as never, cakeCount }
      : "skip"
  );

  useEffect(() => {
    if (
      selectedMode === "delivery" &&
      eligibility &&
      !eligibility.delivery.eligible &&
      eligibility.delivery.reason?.includes("Beyond")
    ) {
      setSelectedMode("shipping");
    }
  }, [selectedMode, eligibility]);


  const needsScheduling = needsSchedulingForMode;
  const contactReady = cart ? !!(cart.contactEmail && cart.contactPhone) : false;
  const fulfillmentReady = cart ? !!cart.fulfillmentMode : false;
  const schedulingReady = cart ? (!needsScheduling || !!cart.slotHoldId) : false;
  const addressReady =
    !needsAddress ||
    (!!cart?.addressId &&
      (!addresses || addresses.some((a) => a._id === cart!.addressId)));
  const paymentReady =
    contactReady && fulfillmentReady && schedulingReady && addressReady;

  const contactSectionRef = useRef<HTMLElement>(null);
  const fulfillmentSectionRef = useRef<HTMLElement>(null);
  const schedulingSectionRef = useRef<HTMLElement>(null);
  const [sectionBlockMessage, setSectionBlockMessage] = useState<{
    contact?: string;
    fulfillment?: string;
    scheduling?: string;
    address?: string;
  } | null>(null);

  const scrollToFirstBlocker = useCallback(() => {
    setSectionBlockMessage(null);
    // When delivery/shipping is selected but fulfillment isn't saved yet, the blocker is address (must select/confirm address first)
    const addressBlocker =
      needsAddress &&
      (!addressReady ||
        (!fulfillmentReady && (selectedMode === "delivery" || selectedMode === "shipping")));
    if (!fulfillmentReady && selectedMode !== "delivery" && selectedMode !== "shipping") {
      setSectionBlockMessage({ fulfillment: "Choose how to receive your order first." });
      fulfillmentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (addressBlocker) {
      setSectionBlockMessage({ address: "Select or confirm your delivery address to continue." });
      contactSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (!contactReady) {
      setSectionBlockMessage({ contact: "Save your email and phone to continue." });
      contactSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (!schedulingReady) {
      setSectionBlockMessage({ scheduling: "Select a date and time slot to continue." });
      schedulingSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
  }, [addressReady, contactReady, fulfillmentReady, needsAddress, schedulingReady, selectedMode]);

  useEffect(() => {
    setSectionBlockMessage((prev) => {
      if (!prev) return null;
      const next = { ...prev };
      if (contactReady && next.contact) delete next.contact;
      if (fulfillmentReady && next.fulfillment) delete next.fulfillment;
      if (addressReady && next.address) delete next.address;
      if (schedulingReady && next.scheduling) delete next.scheduling;
      return Object.keys(next).length === 0 ? null : next;
    });
  }, [addressReady, contactReady, fulfillmentReady, schedulingReady]);

  const setFulfillment = useMutation(api.checkout.setFulfillment);
  useEffect(() => {
    if (!cart || !selectedMode || selectedMode === "pickup") return;
    if (!selectedAddressId) return;
    const needsApply =
      cart.fulfillmentMode !== selectedMode || cart.addressId !== selectedAddressId;
    if (!needsApply) return;
    setSavingFulfillment(true);
    setFulfillment({
      cartId: cart._id,
      mode: selectedMode,
      addressId: selectedAddressId as never,
    })
      .then((result) => {
        const overridden = result && typeof result === "object" && "overriddenToDelivery" in result && result.overriddenToDelivery;
        if (overridden) {
          setSelectedMode("delivery");
          const maxMiles = deliveryConfig?.deliveryMaxMiles ?? 20;
          toast.info(
            `We deliver locally within ${maxMiles} miles and ship to addresses beyond that. Your address qualifies for local delivery.`
          );
        }
        clearPreferredFulfillment();
        setMessage("Fulfillment updated.");
      })
      .catch((err) => {
        setMessage(err instanceof Error ? err.message : "Update failed");
        if (selectedMode === "shipping" && cart) {
          setSelectedMode(cart.fulfillmentMode ?? "delivery");
        }
      })
      .finally(() => setSavingFulfillment(false));
  }, [selectedMode, selectedAddressId, cart?.fulfillmentMode, cart?.addressId, cart?._id, deliveryConfig?.deliveryMaxMiles, setFulfillment]);

  const createAddress = useMutation(api.addresses.createAddress);
  const deleteAddress = useMutation(api.addresses.deleteAddress);
  const createHold = useMutation(api.scheduling.createHold);
  const releaseHold = useMutation(api.scheduling.releaseHold);
  const availableDates = useQuery(
    api.scheduling.getAvailableDates,
    cart && needsSchedulingForMode
      ? {
          mode: selectedMode as "pickup" | "delivery" | "shipping",
          cartId: cart._id,
          addressId: selectedAddressId ? (selectedAddressId as never) : undefined,
        }
      : "skip"
  );
  const [selectedDate, setSelectedDate] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const autoSelectedSlotRef = useRef<string | null>(null);

  // Auto-select today when it's the first available date (so slots show without extra click)
  useEffect(() => {
    if (selectedDate || !availableDates?.length) return;
    const today = new Date();
    const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    if (availableDates.includes(todayYmd)) {
      setSelectedDate(todayYmd);
    } else if (availableDates[0]) {
      setSelectedDate(availableDates[0]);
    }
  }, [availableDates, selectedDate]);
  const currentHold = useQuery(
    api.scheduling.getHold,
    cart?.slotHoldId ? { holdId: cart.slotHoldId as never } : "skip"
  );
  const slots = useQuery(
    api.scheduling.getSlots,
    cart && selectedDate && needsSchedulingForMode
      ? {
          mode: selectedMode as "pickup" | "delivery" | "shipping",
          date: selectedDate,
          cartId: cart._id,
          addressId: selectedAddressId ? (selectedAddressId as never) : undefined,
        }
      : "skip"
  );

  // Auto-select first available slot when slots load (avoids "no slot selected" flow)
  useEffect(() => {
    if (!slots?.available?.length || slots.selectedSlotKey || !cart) return;
    const firstKey = slots.available[0].slotKey;
    if (autoSelectedSlotRef.current === firstKey) return;
    autoSelectedSlotRef.current = firstKey;
    createHold({ cartId: cart._id, slotKey: firstKey }).catch(() => {
      autoSelectedSlotRef.current = null;
    });
  }, [slots?.available, slots?.selectedSlotKey, cart, createHold]);

  // Reset auto-select ref when date changes so we can auto-select for new date
  useEffect(() => {
    autoSelectedSlotRef.current = null;
  }, [selectedDate]);

  // Show order confirmation when: (a) returning from Stripe redirect with success params, or
  // (b) payment completed in-page (Stripe no-redirect or $0 free order) and cart was cleared
  const isSuccessReturn = urlStatus === "success" && urlCartId;
  const isInPageSuccess = paymentSuccess && effectiveConfirmedCartId;

  // Clear guest flag when order succeeds or user signs in
  useEffect(() => {
    if (user || isSuccessReturn || (isInPageSuccess && confirmedOrder)) {
      sessionStorage.removeItem(GUEST_CHOSEN_KEY);
    }
  }, [user, isSuccessReturn, isInPageSuccess, confirmedOrder]);

  // Order confirmed — redirect signed-in users to /account after brief success display
  const showOrderConfirmed = !cart && (isSuccessReturn || isInPageSuccess);
  useEffect(() => {
    if (!showOrderConfirmed || !user) return;
    const t = setTimeout(() => router.replace("/account"), 1800);
    return () => clearTimeout(t);
  }, [showOrderConfirmed, user, router]);

  // Auth choice: show when Clerk configured, not signed in, has cart, guest not chosen, not in success/cancelled
  const showAuthChoice =
    hasClerk &&
    !user &&
    cart &&
    !guestCheckoutChosen &&
    !isSuccessReturn &&
    !isInPageSuccess &&
    urlStatus !== "cancelled";

  if (showAuthChoice) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
        <h1 className="font-display text-4xl text-brand-text sm:text-5xl">Checkout</h1>
        <p className="text-sm text-muted-foreground">
          Choose how you&apos;d like to continue.
        </p>
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col gap-4 pt-6">
            <div className="space-y-3">
              <SignUpButton mode="modal" forceRedirectUrl="/checkout">
                <Button className="w-full rounded-full bg-button text-stone-50 hover:bg-button-hover">
                  Create a FREE Account
                </Button>
              </SignUpButton>
              <div className="space-y-2">
                <Button
                  variant="secondary"
                  className="w-full rounded-full"
                  onClick={() => setGuestConfirmOpen(true)}
                >
                  Guest checkout
                </Button>
              </div>
              <SignInButton mode="modal" forceRedirectUrl="/checkout">
                <Button variant="outline" className="w-full rounded-full">
                  Existing customer — Log in
                </Button>
              </SignInButton>
            </div>
            <Button variant="ghost" asChild className="w-full rounded-full">
              <Link href="/cart">&larr; Back to cart</Link>
            </Button>
          </CardContent>
        </Card>
        <AlertDialog open={guestConfirmOpen} onOpenChange={setGuestConfirmOpen}>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display text-xl">
                Are you sure?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Create a free account to track orders, or continue as guest.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
              <SignUpButton mode="modal" forceRedirectUrl="/checkout">
                <button
                  ref={signUpTriggerRef}
                  type="button"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                />
              </SignUpButton>
              <Button
                variant="default"
                className="rounded-full w-full sm:w-auto"
                onClick={() => {
                  signUpTriggerRef.current?.click();
                  setGuestConfirmOpen(false);
                }}
              >
                Create Account
              </Button>
              <AlertDialogAction
                className="rounded-full"
                onClick={() => {
                  setGuestCheckoutChosen(true);
                  sessionStorage.setItem(GUEST_CHOSEN_KEY, "1");
                  setGuestConfirmOpen(false);
                }}
              >
                Continue as guest
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    );
  }

  if (showOrderConfirmed) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
        <div className="animate-fade-in-up flex flex-col items-center gap-6 rounded-3xl border-2 border-emerald-200 bg-gradient-to-b from-emerald-50/80 to-white p-8 sm:p-10 shadow-lg">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-10 w-10" strokeWidth={2} />
          </div>
          <div className="text-center space-y-2">
            <h1 className="font-display text-4xl text-brand-text sm:text-5xl">
              You&apos;re all set!
            </h1>
            <p className="text-lg font-medium text-emerald-800">
              Order confirmed &middot; Thank you!
            </p>
          </div>
        {confirmedOrder ? (
          <>
            <p className="text-sm text-center">
              Your order <strong>#{confirmedOrder.orderNumber}</strong> has been placed.
              {confirmedOrder.contactEmail && (
                <> A confirmation email is on its way to{" "}
                  <strong>{confirmedOrder.contactEmail}</strong>.
                </>
              )}
            </p>
            <div className="w-full max-w-sm rounded-xl border border-emerald-100 bg-white/80 p-4 text-sm space-y-2">
              <p><span className="font-medium text-muted-foreground">Order:</span> #{confirmedOrder.orderNumber}</p>
              <p><span className="font-medium text-muted-foreground">Fulfillment:</span> <span className="capitalize">{confirmedOrder.fulfillmentMode}</span></p>
              <p><span className="font-medium text-muted-foreground">Total:</span> {fmt(confirmedOrder.totalCents)}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild className="rounded-full bg-button text-stone-50 hover:bg-button-hover">
                <Link href={`/orders/${confirmedOrder.guestToken}`}>Track your order</Link>
              </Button>
              {user ? (
                <Button asChild variant="outline" className="rounded-full">
                  <Link href="/account">View your orders</Link>
                </Button>
              ) : (
                <Button asChild variant="outline" className="rounded-full">
                  <Link href="/products">Continue browsing</Link>
                </Button>
              )}
            </div>
            {!user && (
              <Card className="w-full max-w-sm rounded-2xl border-emerald-200 bg-white/80">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground mb-4">
                    Create an account to track this order, earn points, and get updates on new cakes.
                  </p>
                  <SignUpButton mode="modal" forceRedirectUrl="/account">
                    <Button variant="outline" className="rounded-full w-full">
                      Create account
                    </Button>
                  </SignUpButton>
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Processing your order… You will receive a confirmation email shortly.
            </p>
            <Button asChild className="rounded-full bg-button text-stone-50 hover:bg-button-hover">
              <Link href="/products">Continue browsing</Link>
            </Button>
          </>
        )}
        </div>
      </main>
    );
  }

  if (!cart) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 sm:px-6">
        <h1 className="font-display text-4xl text-brand-text">Checkout</h1>
        <p className="text-sm text-muted-foreground">
          {user ? "Your cart is empty. View your orders or browse cakes." : "Your cart is empty — browse cakes?"}
        </p>
        <div className="flex flex-wrap gap-3">
          {user && (
            <Button asChild className="rounded-full bg-button text-stone-50 hover:bg-button-hover">
              <Link href="/account">View your orders</Link>
            </Button>
          )}
          <Button asChild variant={user ? "outline" : "default"} className="rounded-full">
            <Link href="/products">{user ? "Browse cakes" : "Browse products"}</Link>
          </Button>
        </div>
      </main>
    );
  }

  const pricing = cart.pricing;
  const displayTotalCents =
    pricing && pricing.subtotalCents != null
      ? pricing.subtotalCents -
        pricing.discountCents +
        (selectedMode === "delivery" ? eligibility?.delivery.feeCents ?? 0 : 0) +
        (selectedMode === "shipping" ? eligibility?.shipping.feeCents ?? 0 : 0) +
        (cart.tipCents ?? 0)
      : 0;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="animate-fade-in-up space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-4xl text-brand-text sm:text-5xl">Checkout</h1>
          <Button variant="ghost" size="sm" className="rounded-full" asChild>
            <Link href="/cart">&larr; Back to cart</Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Choose how you want to receive your order and complete your payment.
        </p>
        {message && (
          <Badge variant="secondary" className="animate-fade-in rounded-full">
            {message}
          </Badge>
        )}
      </header>

      {/* ── 1. Fulfillment (choose first) ── */}
      <section ref={fulfillmentSectionRef}>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="font-display text-2xl text-brand-text">Fulfillment</CardTitle>
            <CardDescription>How would you like to receive your order?</CardDescription>
            <p className="text-xs text-muted-foreground">
              Local delivery within {deliveryConfig?.deliveryMaxMiles ?? 20} miles; beyond that, shipping only.
            </p>
            {sectionBlockMessage?.fulfillment && (
              <p className="text-sm text-amber-600 font-medium">{sectionBlockMessage.fulfillment}</p>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <Sheet open={fulfillmentSheetOpen} onOpenChange={setFulfillmentSheetOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  disabled={savingFulfillment}
                  className="h-12 w-full justify-between rounded-xl px-4 text-left font-normal data-[state=open]:bg-accent"
                >
                  <span>
                    {selectedMode
                      ? FULFILLMENT_LABELS[selectedMode]
                      : "Choose how to receive your order"}
                  </span>
                  <ChevronDown className="size-4 shrink-0 opacity-50" />
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-2xl">
                <SheetHeader>
                  <SheetTitle>Fulfillment</SheetTitle>
                  <SheetDescription>
                    How would you like to receive your order?
                  </SheetDescription>
                </SheetHeader>
                <div className="flex flex-col gap-2 px-6 pb-8 pt-4">
                  {(["pickup", "delivery", "shipping"] as const).map((mode) => {
                    // Only disable when address exists and is beyond zone — not when address is missing/removed
                    const deliveryDisabled = Boolean(
                      mode === "delivery" &&
                        needsAddress &&
                        selectedAddressId &&
                        eligibility &&
                        !eligibility.delivery.eligible &&
                        eligibility.delivery.reason !== "Address not found" &&
                        eligibility.delivery.reason !== "No address selected"
                    );
                    // Disable shipping when address is within delivery zone — we deliver locally, ship only beyond
                    const shippingDisabled = Boolean(
                      mode === "shipping" &&
                        needsAddress &&
                        selectedAddressId &&
                        eligibility?.delivery.eligible
                    );
                    const maxMiles = deliveryConfig?.deliveryMaxMiles ?? 20;
                    const canApply =
                      mode === "pickup" || (needsAddress && selectedAddressId);
                    return (
                      <Button
                        key={mode}
                        variant={selectedMode === mode ? "default" : "outline"}
                        disabled={deliveryDisabled || shippingDisabled || savingFulfillment}
                        title={
                          deliveryDisabled
                            ? eligibility?.delivery.reason ?? "Address beyond delivery radius — use shipping"
                            : shippingDisabled
                              ? `We deliver locally within ${maxMiles} miles and ship to addresses beyond that. Your address qualifies for local delivery.`
                              : undefined
                        }
                        className={`h-14 min-h-[44px] rounded-xl transition-all duration-150 active:scale-[0.98] ${selectedMode === mode ? "bg-button text-stone-50 hover:bg-button-hover" : ""}`}
                        onClick={async () => {
                          setSelectedMode(mode);
                          setFulfillmentSheetOpen(false);
                          if (!canApply) return;
                          if (cart.fulfillmentMode === mode) return;
                          setSavingFulfillment(true);
                          try {
                            const result = await setFulfillment({
                              cartId: cart._id,
                              mode,
                              addressId:
                                mode === "pickup"
                                  ? undefined
                                  : ((selectedAddressId as never) || undefined),
                            });
                            const overridden = result && typeof result === "object" && "overriddenToDelivery" in result && result.overriddenToDelivery;
                            if (overridden) {
                              setSelectedMode("delivery");
                              const maxMiles = deliveryConfig?.deliveryMaxMiles ?? 20;
                              toast.info(
                                `We deliver locally within ${maxMiles} miles and ship to addresses beyond that. Your address qualifies for local delivery.`
                              );
                            }
                            clearPreferredFulfillment();
                            setMessage("Fulfillment updated.");
                          } catch (err) {
                            setMessage(err instanceof Error ? err.message : "Update failed");
                            if (mode === "shipping") {
                              setSelectedMode(cart.fulfillmentMode ?? "delivery");
                            }
                          } finally {
                            setSavingFulfillment(false);
                          }
                        }}
                      >
                        {FULFILLMENT_LABELS[mode]}
                      </Button>
                    );
                  })}
                </div>
              </SheetContent>
            </Sheet>

            {cart.fulfillmentMode === selectedMode ? (
              <p className="text-xs text-green-600">
                {currentHold?.slotKey ? (
                  (() => {
                    const parts = currentHold.slotKey.split("|");
                    const dateYmd = parts[0] ?? "";
                    const startHm = parts[1] ?? "";
                    return (
                      <>
                        {FULFILLMENT_LABELS[selectedMode]} ·{" "}
                        {formatDateForDisplay(dateYmd)} at {formatSlotTime(startHm)}
                      </>
                    );
                  })()
                ) : (
                  `Currently set to ${FULFILLMENT_LABELS[cart.fulfillmentMode as keyof typeof FULFILLMENT_LABELS] ?? cart.fulfillmentMode}`
                )}
              </p>
            ) : selectedMode === "delivery" ? (
              <p className="text-xs text-muted-foreground">
                {selectedAddressId
                  ? "Your selected address below will be used for delivery."
                  : "Select or add your delivery address below to schedule Local Delivery."}
              </p>
            ) : selectedMode === "shipping" ? (
              <p className="text-xs text-muted-foreground">
                Ships within 1 business day. Typically delivered in 3 business days.
                {eligibility ? (
                  <> Shipping: {fmt(eligibility.shipping.feeCents)}
                  {cakeCount > 1 ? ` (${cakeCount} cakes × ${fmt(Math.round(eligibility.shipping.feeCents / cakeCount))})` : ""}.</>
                ) : null}
              </p>
            ) : null}

            {selectedMode === "pickup" && pickupAddress && (
              <div className="rounded-xl border bg-muted/30 px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Pickup location</p>
                <p className="text-sm">{pickupAddress}</p>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pickupAddress)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-xs text-brand-text hover:text-brand-hover underline underline-offset-2"
                >
                  View on map
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── 2. Contact & Address ── */}
      <section ref={contactSectionRef}>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="font-display text-2xl text-brand-text">
              {needsAddress ? "Contact & Delivery Info" : "Contact information"}
            </CardTitle>
            <CardDescription>
              {clerkEmail && (cart?.contactEmail || contactEmail)
                ? "Using your account email. Update if needed."
                : "Email and phone both required before payment. You can fill these in any order."}
            </CardDescription>
            {sectionBlockMessage?.contact && (
              <p className="text-sm text-amber-600 font-medium">{sectionBlockMessage.contact}</p>
            )}
            {sectionBlockMessage?.address && (
              <p className="text-sm text-amber-600 font-medium">{sectionBlockMessage.address}</p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              autoComplete="on"
              onSubmit={(e) => e.preventDefault()}
              className="space-y-4"
            >
            <div className="space-y-2">
              <Label htmlFor="contactName">Name (optional)</Label>
              <Input
                id="contactName"
                name="name"
                type="text"
                className="rounded-xl"
                placeholder="e.g. Jane Smith"
                autoComplete="name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                onBlur={async () => {
                  if (!cart || savingContact) return;
                  const email = contactEmail.trim() || undefined;
                  const phone = contactPhone.trim() || undefined;
                  const name = contactName.trim() || undefined;
                  const forVal = cakeFor.trim() || undefined;
                  const occ = occasion.trim() || undefined;
                  const unchanged =
                    email === (cart.contactEmail ?? "") &&
                    phone === (cart.contactPhone ?? "") &&
                    name === (cart.contactName ?? "") &&
                    forVal === (cart.cakeFor ?? "") &&
                    occ === (cart.occasion ?? "");
                  if (unchanged) return;
                  setSavingContact(true);
                  try {
                    await setContact({ cartId: cart._id, email, phone, contactName: name, cakeFor: forVal, occasion: occ });
                    setMessage("Contact info saved.");
                  } catch (err) {
                    setMessage(err instanceof Error ? err.message : "Save failed");
                  } finally {
                    setSavingContact(false);
                  }
                }}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contactEmail">
                  Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="contactEmail"
                  name="email"
                  type="email"
                  className="rounded-xl"
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  onBlur={async () => {
                    if (!cart || savingContact) return;
                    const email = contactEmail.trim() || undefined;
                    const phone = contactPhone.trim() || undefined;
                    const name = contactName.trim() || undefined;
                    const forVal = cakeFor.trim() || undefined;
                    const occ = occasion.trim() || undefined;
                    const unchanged =
                      email === (cart.contactEmail ?? "") &&
                      phone === (cart.contactPhone ?? "") &&
                      name === (cart.contactName ?? "") &&
                      forVal === (cart.cakeFor ?? "") &&
                      occ === (cart.occasion ?? "");
                    if (unchanged) return;
                    setSavingContact(true);
                    try {
                      await setContact({
                        cartId: cart._id,
                        email,
                        phone,
                        contactName: name,
                        cakeFor: forVal,
                        occasion: occ,
                      });
                      setMessage("Contact info saved.");
                    } catch (err) {
                      setMessage(err instanceof Error ? err.message : "Save failed");
                    } finally {
                      setSavingContact(false);
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactPhone">
                  Phone <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="contactPhone"
                  name="tel"
                  type="tel"
                  className="rounded-xl"
                  placeholder="+1 (555) 555-5555"
                  autoComplete="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  onBlur={async () => {
                    if (!cart || savingContact) return;
                    const email = contactEmail.trim() || undefined;
                    const phone = contactPhone.trim() || undefined;
                    const name = contactName.trim() || undefined;
                    const forVal = cakeFor.trim() || undefined;
                    const occ = occasion.trim() || undefined;
                    const unchanged =
                      email === (cart.contactEmail ?? "") &&
                      phone === (cart.contactPhone ?? "") &&
                      name === (cart.contactName ?? "") &&
                      forVal === (cart.cakeFor ?? "") &&
                      occ === (cart.occasion ?? "");
                    if (unchanged) return;
                    setSavingContact(true);
                    try {
                      await setContact({
                        cartId: cart._id,
                        email,
                        phone,
                        contactName: name,
                        cakeFor: forVal,
                        occasion: occ,
                      });
                      setMessage("Contact info saved.");
                    } catch (err) {
                      setMessage(err instanceof Error ? err.message : "Save failed");
                    } finally {
                      setSavingContact(false);
                    }
                  }}
                />
              </div>
            </div>
            <div className="space-y-3 pt-2">
              <div className="space-y-2">
                <Label htmlFor="cakeFor">Who is this cake for? (optional)</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={cakeFor.toLowerCase() === "myself" ? "default" : "outline"}
                    size="sm"
                    className="rounded-full"
                    onClick={() => {
                      setCakeFor("Myself");
                      if (cart && !savingContact) {
                        setSavingContact(true);
                        setContact({
                          cartId: cart._id,
                          email: contactEmail.trim() || undefined,
                          phone: contactPhone.trim() || undefined,
                          contactName: contactName.trim() || undefined,
                          cakeFor: "Myself",
                          occasion: occasion.trim() || undefined,
                        })
                          .then(() => setMessage("Contact info saved."))
                          .catch((err) => setMessage(err instanceof Error ? err.message : "Save failed"))
                          .finally(() => setSavingContact(false));
                      }
                    }}
                  >
                    For myself
                  </Button>
                </div>
                <Input
                  id="cakeFor"
                  name="cakeFor"
                  type="text"
                  className="rounded-xl"
                  placeholder="e.g. Sarah, John's birthday"
                  value={cakeFor}
                  onChange={(e) => setCakeFor(e.target.value)}
                  onBlur={async () => {
                    if (!cart || savingContact) return;
                    const email = contactEmail.trim() || undefined;
                    const phone = contactPhone.trim() || undefined;
                    const name = contactName.trim() || undefined;
                    const forVal = cakeFor.trim() || undefined;
                    const occ = occasion.trim() || undefined;
                    const unchanged =
                      email === (cart.contactEmail ?? "") &&
                      phone === (cart.contactPhone ?? "") &&
                      name === (cart.contactName ?? "") &&
                      forVal === (cart.cakeFor ?? "") &&
                      occ === (cart.occasion ?? "");
                    if (unchanged) return;
                    setSavingContact(true);
                    try {
                      await setContact({
                        cartId: cart._id,
                        email,
                        phone,
                        contactName: name,
                        cakeFor: forVal,
                        occasion: occ,
                      });
                      setMessage("Contact info saved.");
                    } catch (err) {
                      setMessage(err instanceof Error ? err.message : "Save failed");
                    } finally {
                      setSavingContact(false);
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="occasion">Occasion (optional)</Label>
                <div className="flex flex-wrap gap-2">
                  {["Birthday", "Anniversary", "Just because"].map((opt) => (
                    <Button
                      key={opt}
                      type="button"
                      variant={occasion === opt ? "default" : "outline"}
                      size="sm"
                      className="rounded-full"
                      onClick={() => {
                        setOccasion(occasion === opt ? "" : opt);
                        if (cart && !savingContact) {
                          setSavingContact(true);
                          const newOcc = occasion === opt ? undefined : opt;
                          setContact({
                            cartId: cart._id,
                            email: contactEmail.trim() || undefined,
                            phone: contactPhone.trim() || undefined,
                            contactName: contactName.trim() || undefined,
                            cakeFor: cakeFor.trim() || undefined,
                            occasion: newOcc,
                          })
                            .then(() => setMessage("Contact info saved."))
                            .catch((err) => setMessage(err instanceof Error ? err.message : "Save failed"))
                            .finally(() => setSavingContact(false));
                        }
                      }}
                    >
                      {opt}
                    </Button>
                  ))}
                </div>
                <Input
                  id="occasion"
                  name="occasion"
                  type="text"
                  className="rounded-xl"
                  placeholder="Other"
                  value={occasion}
                  onChange={(e) => setOccasion(e.target.value)}
                  onBlur={async () => {
                    if (!cart || savingContact) return;
                    const email = contactEmail.trim() || undefined;
                    const phone = contactPhone.trim() || undefined;
                    const name = contactName.trim() || undefined;
                    const forVal = cakeFor.trim() || undefined;
                    const occ = occasion.trim() || undefined;
                    const unchanged =
                      email === (cart.contactEmail ?? "") &&
                      phone === (cart.contactPhone ?? "") &&
                      name === (cart.contactName ?? "") &&
                      forVal === (cart.cakeFor ?? "") &&
                      occ === (cart.occasion ?? "");
                    if (unchanged) return;
                    setSavingContact(true);
                    try {
                      await setContact({
                        cartId: cart._id,
                        email,
                        phone,
                        contactName: name,
                        cakeFor: forVal,
                        occasion: occ,
                      });
                      setMessage("Contact info saved.");
                    } catch (err) {
                      setMessage(err instanceof Error ? err.message : "Save failed");
                    } finally {
                      setSavingContact(false);
                    }
                  }}
                />
              </div>
            </div>
            </form>

            {needsAddress && (
              <>
                <div className="border-t pt-4" />
                {addressToConfirm ? (
                  <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
                    <p className="text-sm font-medium text-foreground">Please confirm your address</p>
                    <p className="text-base leading-relaxed text-foreground">
                      {addressToConfirm.line1}
                      <br />
                      {[addressToConfirm.city, addressToConfirm.state, addressToConfirm.zip]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        disabled={savingAddress}
                        onClick={async () => {
                          setSavingAddress(true);
                          try {
                            const addressId = await createAddress({
                              ownerId: guestSessionId,
                              formatted: addressToConfirm.formatted,
                              line1: addressToConfirm.line1,
                              city: addressToConfirm.city,
                              state: addressToConfirm.state,
                              zip: addressToConfirm.zip,
                              lat: addressToConfirm.lat,
                              lng: addressToConfirm.lng,
                              placeId: addressToConfirm.placeId,
                            });
                            setSelectedAddressId(addressId);
                            setAddressToConfirm(null);
                            setShowAddAddress(false);
                            setMessage("Address saved.");
                          } catch (err) {
                            setMessage(err instanceof Error ? err.message : "Address save failed");
                          } finally {
                            setSavingAddress(false);
                          }
                        }}
                      >
                        {savingAddress ? "Saving…" : "Confirm address"}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={savingAddress}
                        onClick={() => setAddressToConfirm(null)}
                      >
                        Change
                      </Button>
                    </div>
                  </div>
                ) : (addresses ?? []).length > 0 && !showAddAddress ? (
                  <div className="space-y-2">
                    <Label className="text-base">Saved addresses</Label>
                    {selectedAddressId && (
                      <p className="text-xs text-muted-foreground">
                        Your selected address will be used for delivery.
                      </p>
                    )}
                    <div className="space-y-2">
                      {(addresses ?? []).map((address) => (
                        <div
                          key={address._id}
                          className={`flex items-center justify-between gap-2 rounded-xl border p-3 text-sm transition-all ${
                            selectedAddressId === address._id
                              ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                              : "hover:bg-muted/50"
                          }`}
                        >
                          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                            <input
                              type="radio"
                              name="selectedAddress"
                              checked={selectedAddressId === address._id}
                              onChange={() => setSelectedAddressId(address._id as string)}
                              className="h-4 w-4"
                            />
                            <span className="min-w-0 truncate">{address.formatted}</span>
                          </label>
                          {!address.ownerId?.startsWith("email:") &&
                            !address.ownerId?.startsWith("import:") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                              aria-label="Remove address"
                              onClick={async (e) => {
                                e.preventDefault();
                                try {
                                  await deleteAddress({
                                    addressId: address._id,
                                    guestSessionId: guestSessionId || undefined,
                                  });
                                  if (selectedAddressId === address._id) setSelectedAddressId("");
                                  setMessage("Address removed.");
                                } catch (err) {
                                  setMessage(err instanceof Error ? err.message : "Failed to remove");
                                }
                              }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    <Button
                      variant="link"
                      className="h-auto p-0 text-sm text-muted-foreground hover:text-foreground"
                      onClick={() => setShowAddAddress(true)}
                    >
                      Add new address
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label className="text-base">
                      {(addresses ?? []).length > 0 ? "Search for a new address" : "Delivery address"}
                    </Label>
                    <AddressAutocomplete
                      placeholder="Search for your address"
                      onSelect={(addr) => {
                        if (typeof addr.lat === "number" && typeof addr.lng === "number") {
                          setAddressToConfirm({
                            formatted: addr.formatted,
                            line1: addr.line1,
                            city: addr.city,
                            state: addr.state,
                            zip: addr.zip,
                            lat: addr.lat,
                            lng: addr.lng,
                            placeId: addr.placeId,
                          });
                        }
                      }}
                    />
                    {showAddAddress && (
                      <Button
                        variant="link"
                        className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setShowAddAddress(false)}
                      >
                        Back to saved addresses
                      </Button>
                    )}
                  </div>
                )}
                <Button
                  variant="link"
                  className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setShowManualAddress((prev) => !prev)}
                >
                  {showManualAddress ? "Hide manual entry" : "Enter address manually"}
                </Button>
                  {showManualAddress && (
                    <div className="space-y-2 rounded-lg border p-3">
                      <Input
                        id="formatted"
                        placeholder="Full address"
                        autoComplete="street-address"
                        value={newAddress.formatted}
                        onChange={(event) =>
                          setNewAddress((prev) => ({ ...prev, formatted: event.target.value }))
                        }
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <Input
                          placeholder="City"
                          autoComplete="address-level2"
                          value={newAddress.city}
                          onChange={(event) =>
                            setNewAddress((prev) => ({ ...prev, city: event.target.value }))
                          }
                        />
                        <Input
                          placeholder="State"
                          autoComplete="address-level1"
                          value={newAddress.state}
                          onChange={(event) =>
                            setNewAddress((prev) => ({ ...prev, state: event.target.value }))
                          }
                        />
                        <Input
                          placeholder="Zip"
                          autoComplete="postal-code"
                          value={newAddress.zip}
                          onChange={(event) =>
                            setNewAddress((prev) => ({ ...prev, zip: event.target.value }))
                          }
                        />
                      </div>
                      <Button
                        disabled={savingAddress}
                        size="sm"
                        onClick={async () => {
                          setSavingAddress(true);
                          try {
                            const addressId = await createAddress({
                              ownerId: guestSessionId,
                              formatted: newAddress.formatted,
                              line1: newAddress.line1 || newAddress.formatted,
                              city: newAddress.city,
                              state: newAddress.state,
                              zip: newAddress.zip,
                              lat: Number(newAddress.lat),
                              lng: Number(newAddress.lng),
                            });
                            setSelectedAddressId(addressId);
                            setMessage("Address saved.");
                            setShowManualAddress(false);
                          } catch (error) {
                            setMessage(error instanceof Error ? error.message : "Address save failed");
                          } finally {
                            setSavingAddress(false);
                          }
                        }}
                      >
                        {savingAddress ? "Saving…" : "Save address"}
                      </Button>
                    </div>
                  )}
              </>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── 3. Scheduling (pickup & delivery only; shipping ships within 24–48 hrs) ── */}
      {needsScheduling && (
      <section ref={schedulingSectionRef}>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="font-display text-2xl text-brand-text">Scheduling</CardTitle>
            <CardDescription>Choose a date and time — required before payment</CardDescription>
            {sectionBlockMessage?.scheduling && (
              <p className="text-sm text-amber-600 font-medium">{sectionBlockMessage.scheduling}</p>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Available date</Label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-11 w-full justify-start rounded-xl text-left font-normal data-[state=open]:bg-accent"
                  >
                    <span className="ml-2 truncate">
                      {selectedDate
                        ? formatDateForDisplay(selectedDate)
                        : "Select a date"}
                    </span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="ml-auto shrink-0 opacity-50"
                    >
                      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                      <line x1="16" x2="16" y1="2" y2="6" />
                      <line x1="8" x2="8" y1="2" y2="6" />
                      <line x1="3" x2="21" y1="10" y2="10" />
                    </svg>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto overflow-hidden rounded-2xl p-0 shadow-lg" align="start">
                  <Calendar
                    mode="single"
                    selected={
                      selectedDate
                        ? new Date(
                            Number(selectedDate.slice(0, 4)),
                            Number(selectedDate.slice(5, 7)) - 1,
                            Number(selectedDate.slice(8, 10))
                          )
                        : undefined
                    }
                    onSelect={(date) => {
                      if (date) {
                        const y = date.getFullYear();
                        const m = String(date.getMonth() + 1).padStart(2, "0");
                        const d = String(date.getDate()).padStart(2, "0");
                        setSelectedDate(`${y}-${m}-${d}`);
                        setCalendarOpen(false);
                      }
                    }}
                    disabled={(date) => {
                      const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                      return !(availableDates ?? []).includes(ymd);
                    }}
                    defaultMonth={
                      (availableDates ?? []).length > 0
                        ? (() => {
                            const first = (availableDates ?? [])[0];
                            return new Date(
                              Number(first.slice(0, 4)),
                              Number(first.slice(5, 7)) - 1,
                              Number(first.slice(8, 10))
                            );
                          })()
                        : new Date()
                    }
                    className="rounded-xl border-0"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {selectedDate && (
              <div className="flex flex-wrap gap-2">
                {(slots?.available ?? []).map((slot) => {
                  const isSelected = slots?.selectedSlotKey === slot.slotKey;
                  return (
                    <Button
                      key={slot.slotKey}
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      className={`rounded-full transition-all duration-150 active:scale-95 ${
                        isSelected ? "bg-button text-stone-50 hover:bg-button-hover ring-2 ring-button ring-offset-2" : ""
                      }`}
                      onClick={async () => {
                        try {
                          if (isSelected) {
                            const holdId = cart.slotHoldId;
                            if (holdId) {
                              await releaseHold({ holdId: holdId as never });
                              setMessage("Time slot released.");
                            }
                          } else {
                            await createHold({ cartId: cart._id, slotKey: slot.slotKey });
                            setMessage(`${formatSlotTime(slot.startTime)}–${formatSlotTime(slot.endTime)} selected.`);
                          }
                        } catch (error) {
                          setMessage(error instanceof Error ? error.message : "Failed");
                        }
                      }}
                    >
                      {formatSlotTime(slot.startTime)}
                    </Button>
                  );
                })}
                {(slots?.available ?? []).length === 0 && (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>No available slots for this date.</p>
                    {(slots?.blocked ?? []).length > 0 && (
                      <div className="space-y-0.5 text-amber-600">
                        {(slots.blocked ?? []).some((b) => b.reason === "FULL") && (
                          <p>Slots are full.</p>
                        )}
                        {(slots.blocked ?? []).some((b) => b.reason === "CLOSED" || b.reason === "BLACKOUT") && (
                          <p>Store closed or blackout.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {selectedDate && slots && needsSchedulingForMode && slots.isSameDay === true &&
              (slots?.available ?? []).length > 0 && (
              <div className="mt-3 rounded-lg border bg-amber-50/50 px-3 py-2 text-xs dark:bg-amber-950/20">
                {typeof slots.minutesUntilCutoff === "number" && slots.minutesUntilCutoff > 0 ? (
                  <SameDayCutoffTimer
                    initialMinutes={slots.minutesUntilCutoff}
                    cutoffTime={slots.cutoffForDebug}
                  />
                ) : slots.cutoffForDebug ? (
                  <p className="tabular-nums text-amber-700 dark:text-amber-300">
                    Same day orders must be received by {formatSlotTime(slots.cutoffForDebug)}
                    {slots.isSameDay === true && typeof slots.minutesUntilCutoff === "number" && slots.minutesUntilCutoff <= 0 ? ". Cutoff has passed — try tomorrow." : "."}
                  </p>
                ) : (
                  <p className="tabular-nums text-amber-700 dark:text-amber-300">
                    Same day orders must be received by store cutoff.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
      )}

      {/* ── 6. Payment ── */}
      <section>
        {paymentSuccess ? (
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="font-display text-2xl text-brand-text">Payment Successful</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {confirmedOrder ? (
                <>
                  <p className="text-sm">
                    Your order <strong>{confirmedOrder.orderNumber}</strong> has been placed.
                    A confirmation email has been sent to{" "}
                    <strong>{cart?.contactEmail ?? contactEmail ?? "your email"}</strong>.
                  </p>
                  <div className="rounded-md border bg-muted/30 p-4 text-sm space-y-2">
                    <p><span className="font-medium">Order:</span> {confirmedOrder.orderNumber}</p>
                    <p><span className="font-medium">Fulfillment:</span> {confirmedOrder.fulfillmentMode}</p>
                    <p><span className="font-medium">Total:</span> {fmt(confirmedOrder.totalCents)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild>
                      <Link href={`/orders/${confirmedOrder.guestToken}`}>Track your order</Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link href="/products">Continue browsing</Link>
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm">
                    Processing your order… You will receive a confirmation at{" "}
                    <strong>{cart?.contactEmail ?? contactEmail ?? "your email"}</strong>.
                  </p>
                  <div className="rounded-md border bg-muted/30 p-4 text-sm space-y-1">
                    <p><span className="font-medium">Fulfillment:</span> {cart?.fulfillmentMode ?? selectedMode}</p>
                    <p><span className="font-medium">Total:</span> {fmt(cart?.pricing?.totalCents ?? 0)}</p>
                  </div>
                  <Button asChild>
                    <Link href="/products">Continue browsing</Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        ) : urlStatus === "cancelled" ? (
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="font-display text-2xl text-brand-text">Payment Cancelled</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Your payment was cancelled. Your cart and slot hold are still active.
                You can try again below.
              </p>
            </CardContent>
          </Card>
        ) : !paymentReady ? (
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="font-display text-2xl text-brand-text">Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Complete the steps above before payment.
              </p>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={scrollToFirstBlocker}
              >
                Take me to the next step
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Coupon - apply before payment */}
            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                setCouponMessage(null);
                if (!couponCode.trim()) {
                  setCouponMessage({ text: "Please enter a coupon code.", error: true });
                  return;
                }
                try {
                  await applyCoupon({ cartId: cart._id, code: couponCode });
                  setCouponMessage({ text: "Coupon applied!", error: false });
                  setCouponCode("");
                } catch (err) {
                  setCouponMessage({
                    text: extractCouponErrorMessage(err),
                    error: true,
                  });
                }
              }}
            >
              <div className="flex-1 space-y-1">
                <Label htmlFor="checkout-coupon" className="text-sm">Coupon code</Label>
                <Input
                  id="checkout-coupon"
                  className="rounded-xl"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  placeholder="Enter code"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  size="sm"
                  className="rounded-full bg-button text-stone-50 hover:bg-button-hover"
                >
                  Apply
                </Button>
                {cart.appliedCouponCode && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={async () => {
                      await removeCoupon({ cartId: cart._id });
                      setCouponMessage({ text: "Coupon removed.", error: false });
                    }}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </form>
            {couponMessage && (
              <p className={`text-sm ${couponMessage.error ? "text-destructive" : "text-green-600"}`}>
                {couponMessage.text}
              </p>
            )}
            {cart.appliedCouponCode && (
              <Badge variant="secondary" className="w-fit rounded-full">
                Applied: {cart.appliedCouponCode}
              </Badge>
            )}

            {pricing && cart.items && (
              <div className="rounded-xl border bg-muted/30 px-4 py-3 space-y-3">
                <p className="text-sm font-medium text-muted-foreground">Order details</p>
                <ul className="space-y-2 text-sm">
                  {cart.items.map((item) => {
                    const lineCents = item.unitPriceSnapshotCents * item.qty;
                    const base =
                      item.variantLabel
                        ? `${productDisplayName(item.productName ?? "")} (${item.variantLabel})`
                        : productDisplayName(item.productName ?? "");
                    const addons = (item as { modifierOptionNames?: string[] }).modifierOptionNames ?? [];
                    const fullLine =
                      addons.length > 0 ? `${base} + ${addons.join(", ")}` : base;
                    return (
                      <li key={item._id} className="flex justify-between gap-2">
                        <span>
                          {fullLine} × {item.qty}
                        </span>
                        <span>{fmt(lineCents)}</span>
                      </li>
                    );
                  })}
                </ul>
                <div className="border-t pt-2 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{fmt(pricing.subtotalCents)}</span>
                  </div>
                  {pricing.discountCents > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Discount</span>
                      <span>-{fmt(pricing.discountCents)}</span>
                    </div>
                  )}
                  {selectedMode === "delivery" && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Delivery fee{eligibility?.delivery.distanceMiles != null ? ` (${eligibility.delivery.distanceMiles} mi)` : ""}
                      </span>
                      <span>{eligibility ? fmt(eligibility.delivery.feeCents) : "—"}</span>
                    </div>
                  )}
                  {selectedMode === "shipping" && (eligibility === undefined || eligibility.shipping.feeCents > 0) && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Shipping{cakeCount > 1 && eligibility ? ` (${cakeCount} cakes × ${fmt(Math.round(eligibility.shipping.feeCents / cakeCount))})` : ""}
                      </span>
                      <span>{eligibility ? fmt(eligibility.shipping.feeCents) : "—"}</span>
                    </div>
                  )}
                  {(cart.tipCents ?? 0) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tip</span>
                      <span>{fmt(cart.tipCents)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold pt-1">
                    <span>Total</span>
                    <span>
                      {fmt(
                        pricing.subtotalCents -
                        pricing.discountCents +
                        (selectedMode === "delivery" ? eligibility?.delivery.feeCents ?? 0 : 0) +
                        (selectedMode === "shipping" ? eligibility?.shipping.feeCents ?? 0 : 0) +
                        (cart.tipCents ?? 0)
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}
            {pricing && (() => {
              const displayTotalCents =
                pricing.subtotalCents -
                pricing.discountCents +
                (selectedMode === "delivery" ? eligibility?.delivery.feeCents ?? 0 : 0) +
                (selectedMode === "shipping" ? eligibility?.shipping.feeCents ?? 0 : 0) +
                (cart.tipCents ?? 0);
              return displayTotalCents === 0;
            })() ? (
              <PlaceFreeOrderButton
                cartId={cart._id}
                onSuccess={() => {
                  justCompletedCartIdRef.current = cart._id;
                  setPaymentSuccess(true);
                  setConfirmedCartId(cart._id);
                }}
                onError={(msg) => setMessage(msg)}
              />
            ) : (
              <div>
                <StripePaymentForm
                  key={`${cart._id}-${cart.updatedAt}`}
                  cartId={cart._id}
                  guestSessionId={guestSessionId}
                  onSuccess={() => {
                    justCompletedCartIdRef.current = cart._id;
                    setPaymentSuccess(true);
                    setConfirmedCartId(cart._id);
                  }}
                  onError={(msg) => setMessage(msg)}
                />
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
