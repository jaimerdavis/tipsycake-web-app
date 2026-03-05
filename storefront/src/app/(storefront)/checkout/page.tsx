"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";

import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StripePaymentForm } from "@/components/StripePaymentForm";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";

function getGuestSessionId() {
  if (typeof window === "undefined") return "";
  const key = "tipsycake_guest_session_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = `guest_${crypto.randomUUID()}`;
  window.localStorage.setItem(key, created);
  return created;
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

  const cart = useQuery(api.cart.getActive, guestSessionId ? { guestSessionId } : "skip");
  const addresses = useQuery(
    api.addresses.listAddresses,
    guestSessionId ? { ownerId: guestSessionId } : "skip"
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
  const [paymentSuccess, setPaymentSuccess] = useState(urlStatus === "success");

  const [contactEmail, setContactEmail] = useState(cart?.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(cart?.contactPhone ?? "");

  const createAddress = useMutation(api.addresses.createAddress);
  const setFulfillment = useMutation(api.checkout.setFulfillment);
  const setContact = useMutation(api.cart.setContact);
  const createHold = useMutation(api.scheduling.createHold);
  const releaseHold = useMutation(api.scheduling.releaseHold);
  const eligibility = useQuery(
    api.checkout.getEligibility,
    selectedAddressId ? { addressId: selectedAddressId as never } : {}
  );
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
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
        <p className="text-sm text-muted-foreground">No active cart yet.</p>
        <Button asChild className="w-fit">
          <Link href="/products">Browse products</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
        <p className="text-sm text-muted-foreground">
          Set fulfillment mode and address eligibility before scheduling/payment.
        </p>
        {message ? <Badge variant="secondary">{message}</Badge> : null}
      </header>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
            <CardDescription>Required for order confirmation and abandoned cart recovery</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contactEmail">Email *</Label>
                <Input
                  id="contactEmail"
                  type="email"
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
                  placeholder="(555) 555-5555"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                />
              </div>
            </div>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await setContact({
                    cartId: cart._id,
                    email: contactEmail,
                    phone: contactPhone || undefined,
                  });
                  setMessage("Contact info saved.");
                } catch (err) {
                  setMessage(err instanceof Error ? err.message : "Save failed");
                }
              }}
            >
              Save contact info
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Fulfillment Mode</CardTitle>
            <CardDescription>FUL-001 + checkout.setFulfillment</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedMode === "pickup" ? "default" : "outline"}
                onClick={() => setSelectedMode("pickup")}
              >
                Pickup
              </Button>
              <Button
                variant={selectedMode === "delivery" ? "default" : "outline"}
                onClick={() => setSelectedMode("delivery")}
              >
                Delivery
              </Button>
              <Button
                variant={selectedMode === "shipping" ? "default" : "outline"}
                onClick={() => setSelectedMode("shipping")}
              >
                Shipping
              </Button>
            </div>
            <Button
              onClick={async () => {
                try {
                  await setFulfillment({
                    cartId: cart._id,
                    mode: selectedMode,
                    addressId:
                      selectedMode === "pickup"
                        ? undefined
                        : ((selectedAddressId as never) || undefined),
                  });
                  setMessage("Fulfillment updated.");
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : "Update failed");
                }
              }}
            >
              Save fulfillment
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Eligibility</CardTitle>
            <CardDescription>FUL-003, FUL-004, FUL-005</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Delivery:{" "}
              <span className="font-medium">
                {eligibility?.delivery.eligible ? "Eligible" : "Not eligible"}
              </span>{" "}
              ({eligibility?.delivery.feeCents ?? 0} cents)
            </p>
            <p>
              Shipping:{" "}
              <span className="font-medium">
                {eligibility?.shipping.eligible ? "Eligible" : "Not eligible"}
              </span>{" "}
              ({eligibility?.shipping.feeCents ?? 0} cents)
            </p>
            {eligibility?.delivery.reason ? (
              <p className="text-xs text-muted-foreground">{eligibility.delivery.reason}</p>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Saved Addresses</CardTitle>
            <CardDescription>FUL-002</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(addresses ?? []).map((address) => (
              <label key={address._id} className="flex items-center gap-2 rounded border p-2 text-sm">
                <input
                  type="radio"
                  name="selectedAddress"
                  checked={selectedAddressId === address._id}
                  onChange={() => setSelectedAddressId(address._id as string)}
                />
                <span>{address.formatted}</span>
              </label>
            ))}
            {(addresses ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No saved addresses yet.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add Address</CardTitle>
            <CardDescription>
              Search for your address or enter manually below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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
                  setMessage("Address saved from autocomplete.");
                } catch (err) {
                  setMessage(err instanceof Error ? err.message : "Address save failed");
                }
              }}
            />
            <div className="space-y-2">
              <Label htmlFor="formatted">Or enter manually</Label>
              <Input
                id="formatted"
                placeholder="Full address"
                value={newAddress.formatted}
                onChange={(event) =>
                  setNewAddress((prev) => ({ ...prev, formatted: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="line1">Line 1</Label>
              <Input
                id="line1"
                value={newAddress.line1}
                onChange={(event) =>
                  setNewAddress((prev) => ({ ...prev, line1: event.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={newAddress.city}
                  onChange={(event) =>
                    setNewAddress((prev) => ({ ...prev, city: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={newAddress.state}
                  onChange={(event) =>
                    setNewAddress((prev) => ({ ...prev, state: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zip">Zip</Label>
                <Input
                  id="zip"
                  value={newAddress.zip}
                  onChange={(event) =>
                    setNewAddress((prev) => ({ ...prev, zip: event.target.value }))
                  }
                />
              </div>
            </div>
            <Button
              onClick={async () => {
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
                  setMessage("Address created.");
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : "Address create failed");
                }
              }}
            >
              Save address
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Scheduling</CardTitle>
            <CardDescription>SCH-008, SCH-009</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="date">Available date</Label>
              <select
                id="date"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
              >
                <option value="">Select date</option>
                {(availableDates ?? []).map((date) => (
                  <option key={date} value={date}>
                    {date}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              {(slots?.available ?? []).map((slot) => (
                <Button
                  key={slot.slotKey}
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await createHold({ cartId: cart._id, slotKey: slot.slotKey });
                      setMessage(`Hold created for ${slot.startTime}-${slot.endTime}`);
                    } catch (error) {
                      setMessage(error instanceof Error ? error.message : "Hold failed");
                    }
                  }}
                >
                  {slot.startTime}
                </Button>
              ))}
              {(slots?.available ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No available slots for selected date.</p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Blocked Slot Reasons</CardTitle>
            <CardDescription>Reason codes from scheduling engine</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(slots?.blocked ?? []).map((slot, index) => (
              <div key={`${slot.slotStart}-${index}`} className="flex items-center justify-between rounded border p-2">
                <span>{slot.slotStart}</span>
                <Badge variant="outline">{slot.reason}</Badge>
              </div>
            ))}
            {cart.slotHoldId ? (
              <Button
                variant="outline"
                onClick={async () => {
                  await releaseHold({ holdId: cart.slotHoldId as never });
                  setMessage("Slot hold released.");
                }}
              >
                Release current hold
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section>
        {paymentSuccess ? (
          <Card>
            <CardHeader>
              <CardTitle>Payment Successful</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                Your order has been placed successfully. You will receive a confirmation
                at <strong>{cart.contactEmail || contactEmail || "your email"}</strong>.
              </p>
              <div className="rounded-md border bg-muted/30 p-4 text-sm space-y-1">
                <p><span className="font-medium">Fulfillment:</span> {cart.fulfillmentMode ?? selectedMode}</p>
                <p><span className="font-medium">Total:</span> ${((cart.pricing?.totalCents ?? 0) / 100).toFixed(2)}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/products">Continue browsing</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : urlStatus === "cancelled" ? (
          <Card>
            <CardHeader>
              <CardTitle>Payment Cancelled</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Your payment was cancelled. Your cart and slot hold are still active.
                You can try again below.
              </p>
            </CardContent>
          </Card>
        ) : !cart.contactEmail && !contactEmail.includes("@") ? (
          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Please save your contact information above before proceeding to payment.
              </p>
            </CardContent>
          </Card>
        ) : cart.slotHoldId ? (
          <StripePaymentForm
            cartId={cart._id}
            guestSessionId={guestSessionId}
            onSuccess={() => setPaymentSuccess(true)}
            onError={(msg) => setMessage(msg)}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Select a time slot before proceeding to payment.
              </p>
            </CardContent>
          </Card>
        )}
      </section>
    </main>
  );
}
