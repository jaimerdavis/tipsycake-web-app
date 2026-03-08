"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StripePaymentForm } from "@/components/StripePaymentForm";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { useSiteSettings } from "@/hooks/useSiteSettings";

import { getOrCreateGuestSessionId as getGuestSessionId } from "@/lib/guestSession";

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

const FULFILLMENT_LABELS: Record<"pickup" | "delivery" | "shipping", string> = {
  pickup: "Pickup",
  delivery: "Local Delivery",
  shipping: "Shipping",
};

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

function CheckoutContent() {
  const guestSessionId = useMemo(() => getGuestSessionId(), []);
  const settings = useSiteSettings();
  const pickupAddress = settings.get("storeAddress");

  const cart = useQuery(api.cart.getActive, guestSessionId ? { guestSessionId } : "skip");
  const { user } = useUser();
  const clerkEmail = user?.primaryEmailAddress?.emailAddress ?? "";
  const clerkPhone = user?.primaryPhoneNumber?.phoneNumber ?? "";
  const addresses = useQuery(
    api.addresses.listAddresses,
    guestSessionId ? { guestSessionId } : "skip"
  );

  const [selectedMode, setSelectedMode] = useState<"pickup" | "delivery" | "shipping">("pickup");
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
  const [contactSynced, setContactSynced] = useState(false);

  const [savingContact, setSavingContact] = useState(false);
  const [savingFulfillment, setSavingFulfillment] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponMessage, setCouponMessage] = useState<{ text: string; error: boolean } | null>(null);

  const applyCoupon = useMutation(api.cart.applyCoupon);
  const removeCoupon = useMutation(api.cart.removeCoupon);

  useEffect(() => {
    if (paymentSuccess && cart?._id && !confirmedCartId) {
      setConfirmedCartId(cart._id);
    }
  }, [paymentSuccess, cart?._id, confirmedCartId]);

  const confirmedOrder = useQuery(
    api.orders.getByCartId,
    confirmedCartId ? { cartId: confirmedCartId as Id<"carts"> } : "skip"
  );

  useEffect(() => {
    if (!cart) return;
    const email = cart.contactEmail ?? clerkEmail ?? "";
    const phone = cart.contactPhone ?? clerkPhone ?? "";
    setContactEmail(email);
    setContactPhone(phone);
    if (cart.fulfillmentMode) setSelectedMode(cart.fulfillmentMode as typeof selectedMode);
    if (cart.addressId) setSelectedAddressId(cart.addressId);
    setContactSynced(true);
  }, [cart, contactSynced, clerkEmail, clerkPhone]);

  const setContact = useMutation(api.cart.setContact);
  const autoSavedRef = useRef(false);
  useEffect(() => {
    if (!cart || !clerkEmail || cart.contactEmail || autoSavedRef.current) return;
    autoSavedRef.current = true;
    setContact({
      cartId: cart._id,
      email: clerkEmail,
      phone: clerkPhone || undefined,
    }).catch(() => {
      autoSavedRef.current = false;
    });
  }, [cart?._id, cart?.contactEmail, clerkEmail, clerkPhone, setContact]);

  const needsAddress = selectedMode === "delivery" || selectedMode === "shipping";
  const eligibility = useQuery(
    api.checkout.getEligibility,
    needsAddress && selectedAddressId ? { addressId: selectedAddressId as never } : "skip"
  );

  useEffect(() => {
    if (
      selectedMode === "delivery" &&
      eligibility &&
      !eligibility.delivery.eligible &&
      eligibility.delivery.reason?.includes("over 10 miles")
    ) {
      setSelectedMode("shipping");
    }
  }, [selectedMode, eligibility]);

  const setFulfillment = useMutation(api.checkout.setFulfillment);
  useEffect(() => {
    if (!cart || selectedMode === "pickup") return;
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
      .then(() => setMessage("Fulfillment updated."))
      .catch((err) => setMessage(err instanceof Error ? err.message : "Update failed"))
      .finally(() => setSavingFulfillment(false));
  }, [selectedMode, selectedAddressId, cart?.fulfillmentMode, cart?.addressId, cart?._id, setFulfillment]);

  const createAddress = useMutation(api.addresses.createAddress);
  const deleteAddress = useMutation(api.addresses.deleteAddress);
  const createHold = useMutation(api.scheduling.createHold);
  const releaseHold = useMutation(api.scheduling.releaseHold);
  const availableDates = useQuery(
    api.scheduling.getAvailableDates,
    cart
      ? {
          mode: selectedMode,
          cartId: cart._id,
          addressId: selectedAddressId ? (selectedAddressId as never) : undefined,
        }
      : "skip"
  );
  const [selectedDate, setSelectedDate] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const currentHold = useQuery(
    api.scheduling.getHold,
    cart?.slotHoldId ? { holdId: cart.slotHoldId as never } : "skip"
  );
  const slots = useQuery(
    api.scheduling.getSlots,
    cart && selectedDate
      ? {
          mode: selectedMode,
          date: selectedDate,
          cartId: cart._id,
          addressId: selectedAddressId ? (selectedAddressId as never) : undefined,
        }
      : "skip"
  );

  if (!cart) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 sm:px-6">
        <h1 className="font-display text-4xl text-brand-text">Checkout</h1>
        <p className="text-sm text-muted-foreground">No active cart yet.</p>
        <Button asChild className="w-fit rounded-full bg-button text-stone-50 hover:bg-button-hover">
          <Link href="/products">Browse products</Link>
        </Button>
      </main>
    );
  }

  const pricing = cart.pricing;
  const contactReady = !!(cart.contactEmail || cart.contactPhone);
  const fulfillmentReady = !!cart.fulfillmentMode;
  const needsScheduling = selectedMode !== "shipping";
  const schedulingReady = !needsScheduling || !!cart.slotHoldId;
  const paymentReady = contactReady && fulfillmentReady && schedulingReady;

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

      {/* ── 1. Contact & Address ── */}
      <section>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="font-display text-2xl text-brand-text">
              {needsAddress ? "Contact & delivery info" : "Contact information"}
            </CardTitle>
            <CardDescription>
              {clerkEmail && (cart?.contactEmail || contactEmail)
                ? "Using your account email. Update if needed."
                : "At least one of email or phone required for order confirmation"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contactEmail">Email</Label>
                <Input
                  id="contactEmail"
                  type="email"
                  className="rounded-xl"
                  placeholder="you@example.com"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactPhone">Phone</Label>
                <Input
                  id="contactPhone"
                  type="tel"
                  className="rounded-xl"
                  placeholder="(555) 555-5555"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                />
              </div>
            </div>
            <Button
              variant="outline"
              disabled={savingContact}
              onClick={async () => {
                setSavingContact(true);
                try {
                  await setContact({
                    cartId: cart._id,
                    email: contactEmail.trim() || undefined,
                    phone: contactPhone.trim() || undefined,
                  });
                  setMessage("Contact info saved.");
                } catch (err) {
                  setMessage(err instanceof Error ? err.message : "Save failed");
                } finally {
                  setSavingContact(false);
                }
              }}
            >
              {savingContact ? "Saving…" : cart.contactEmail ? "Update contact" : "Save contact"}
            </Button>

            {needsAddress && (
              <>
                <div className="border-t pt-4" />
                {(addresses ?? []).length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-base">Saved addresses</Label>
                    <div className="space-y-2">
                      {(addresses ?? []).map((address) => (
                        <div
                          key={address._id}
                          className="flex items-center justify-between gap-2 rounded border p-2 text-sm transition-colors hover:bg-muted/50"
                        >
                          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                            <input
                              type="radio"
                              name="selectedAddress"
                              checked={selectedAddressId === address._id}
                              onChange={() => setSelectedAddressId(address._id as string)}
                            />
                            <span className="truncate">{address.formatted}</span>
                          </label>
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
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label className="text-base">{(addresses ?? []).length > 0 ? "Add another address" : "Delivery address"}</Label>
                  <AddressAutocomplete
                    onSelect={async (addr) => {
                      try {
                        const addressId = await createAddress({
                          ownerId: guestSessionId,
                          formatted: addr.formatted,
                          line1: addr.line1,
                          city: addr.city,
                          state: addr.state,
                          zip: addr.zip,
                          lat: addr.lat,
                          lng: addr.lng,
                          placeId: addr.placeId,
                        });
                        setSelectedAddressId(addressId);
                        setMessage("Address saved.");
                      } catch (err) {
                        setMessage(err instanceof Error ? err.message : "Address save failed");
                      }
                    }}
                  />
                  <div className="space-y-2">
                    <Label htmlFor="formatted" className="text-muted-foreground">Or enter manually</Label>
                    <Input
                      id="formatted"
                      placeholder="Full address"
                      value={newAddress.formatted}
                      onChange={(event) =>
                        setNewAddress((prev) => ({ ...prev, formatted: event.target.value }))
                      }
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      placeholder="City"
                      value={newAddress.city}
                      onChange={(event) =>
                        setNewAddress((prev) => ({ ...prev, city: event.target.value }))
                      }
                    />
                    <Input
                      placeholder="State"
                      value={newAddress.state}
                      onChange={(event) =>
                        setNewAddress((prev) => ({ ...prev, state: event.target.value }))
                      }
                    />
                    <Input
                      placeholder="Zip"
                      value={newAddress.zip}
                      onChange={(event) =>
                        setNewAddress((prev) => ({ ...prev, zip: event.target.value }))
                      }
                    />
                  </div>
                  <Button
                    disabled={savingAddress}
                    onClick={async () => {
                      setSavingAddress(true);
                      try {
                        const addressId = await createAddress({
                          ownerId: guestSessionId,
                          formatted: newAddress.formatted,
                          line1: newAddress.line1,
                          city: newAddress.city,
                          state: newAddress.state,
                          zip: newAddress.zip,
                          lat: Number(newAddress.lat),
                          lng: Number(newAddress.lng),
                        });
                        setSelectedAddressId(addressId);
                        setMessage("Address saved.");
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
              </>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── 3. Fulfillment Mode ── */}
      <section>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="font-display text-2xl text-brand-text">Fulfillment</CardTitle>
            <CardDescription>How would you like to receive your order?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(["pickup", "delivery", "shipping"] as const).map((mode) => {
                const deliveryDisabled = Boolean(
                  mode === "delivery" &&
                    needsAddress &&
                    selectedAddressId &&
                    eligibility &&
                    !eligibility.delivery.eligible
                );
                const canApply =
                  mode === "pickup" || (needsAddress && selectedAddressId);
                return (
                  <Button
                    key={mode}
                    variant={selectedMode === mode && cart.fulfillmentMode === mode ? "default" : "outline"}
                    disabled={deliveryDisabled || savingFulfillment}
                    title={
                      deliveryDisabled
                        ? eligibility?.delivery.reason ?? "Address over 10 miles — use shipping"
                        : undefined
                    }
                    className={`rounded-full transition-all duration-150 active:scale-95 ${selectedMode === mode ? "bg-button text-stone-50 hover:bg-button-hover" : ""}`}
                    onClick={async () => {
                      setSelectedMode(mode);
                      if (!canApply) return;
                      if (cart.fulfillmentMode === mode) return;
                      setSavingFulfillment(true);
                      try {
                        await setFulfillment({
                          cartId: cart._id,
                          mode,
                          addressId:
                            mode === "pickup"
                              ? undefined
                              : ((selectedAddressId as never) || undefined),
                        });
                        setMessage("Fulfillment updated.");
                      } catch (err) {
                        setMessage(err instanceof Error ? err.message : "Update failed");
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
                Add a delivery address above to schedule your Local Delivery
              </p>
            ) : selectedMode === "shipping" ? (
              <p className="text-xs text-muted-foreground">
                Ships within 1 business day. Typically delivered in 2-3 business days.
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

      {/* ── 4. Scheduling (pickup & delivery only; shipping ships within 24–48 hrs) ── */}
      {needsScheduling && (
      <section>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="font-display text-2xl text-brand-text">Scheduling</CardTitle>
            <CardDescription>Choose a date and time — required before payment</CardDescription>
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
                  <p className="text-xs text-muted-foreground">No available slots for this date.</p>
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
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {!contactReady
                  ? "Save your contact info above to continue."
                  : !fulfillmentReady
                    ? "Choose a fulfillment mode above to continue."
                    : "Select a date and time slot above to continue. Scheduling is required."}
              </p>
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
                    text: err instanceof Error ? err.message : "Invalid coupon code.",
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

            {pricing && (
              <div className="rounded-xl border bg-muted/30 px-4 py-3">
                <p className="text-sm font-semibold">
                  Total: {fmt(pricing.totalCents)}
                  {cart.items && (
                    <span className="ml-2 font-normal text-muted-foreground">
                      ({cart.items.length} item{cart.items.length === 1 ? "" : "s"})
                    </span>
                  )}
                </p>
              </div>
            )}
            {pricing?.totalCents === 0 ? (
              <PlaceFreeOrderButton
                cartId={cart._id}
                onSuccess={() => {
                  setPaymentSuccess(true);
                  setConfirmedCartId(cart._id);
                }}
                onError={(msg) => setMessage(msg)}
              />
            ) : (
              <div>
                <StripePaymentForm
                  cartId={cart._id}
                  guestSessionId={guestSessionId}
                  onSuccess={() => {
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
