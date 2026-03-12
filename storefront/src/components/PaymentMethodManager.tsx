"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { getStripePromise } from "@/lib/stripe";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { CreditCard, Plus, Trash2 } from "lucide-react";

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

function cardLabel(brand: string, last4: string, expMonth: number, expYear: number) {
  const brandCap = brand.charAt(0).toUpperCase() + brand.slice(1);
  const exp = `${String(expMonth).padStart(2, "0")}/${expYear % 100}`;
  return `${brandCap} •••• ${last4} (exp ${exp})`;
}

function AddCardFormInner({
  onSuccess,
  onError,
}: {
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!stripe || !elements) return;
      setProcessing(true);
      try {
        const { error } = await stripe.confirmSetup({
          elements,
          confirmParams: { payment_method_data: {} },
          redirect: "if_required",
        });
        if (error) {
          onError(error.message ?? "Failed to add card");
        } else {
          onSuccess();
        }
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to add card");
      } finally {
        setProcessing(false);
      }
    },
    [stripe, elements, onSuccess, onError]
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      <DialogFooter>
        <Button type="submit" disabled={!stripe || processing}>
          {processing ? "Saving…" : "Save card"}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface PaymentMethodManagerProps {
  /** For admin: customer email. Omit for current user. */
  customerEmail?: string;
  /** For admin: show read-only without add/remove */
  adminView?: boolean;
}

export function PaymentMethodManager({ customerEmail, adminView = false }: PaymentMethodManagerProps) {
  const { get } = useSiteSettings();
  const stripeKey = get("stripePublishableKey");
  const stripePromise = useMemo(() => getStripePromise(stripeKey), [stripeKey]);

  const listMyMethods = useAction(api.payments.listPaymentMethods);
  const listCustomerMethods = useAction(api.payments.listPaymentMethodsForCustomer);
  const createSetupIntent = useAction(api.payments.createSetupIntent);
  const detachMine = useAction(api.payments.detachPaymentMethod);
  const detachForCustomer = useAction(api.payments.detachPaymentMethodForCustomer);
  const retryStripeLink = useAction(api.payments.retryStripeLinkForCustomer);

  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);
  const [retryingLink, setRetryingLink] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addClientSecret, setAddClientSecret] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const isAdmin = !!customerEmail;

  const fetchMethods = useCallback(async () => {
    if (!stripeKey) return;
    setLoading(true);
    setError(null);
    try {
      const list = isAdmin
        ? await listCustomerMethods({ email: customerEmail! })
        : await listMyMethods({});
      setMethods(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payment methods");
      setMethods([]);
    } finally {
      setLoading(false);
    }
  }, [stripeKey, isAdmin, customerEmail, listMyMethods, listCustomerMethods]);

  useEffect(() => {
    fetchMethods();
  }, [fetchMethods]);

  const handleOpenAdd = useCallback(async () => {
    if (adminView || isAdmin) return;
    setAddError(null);
    setAddOpen(true);
    try {
      const { clientSecret } = await createSetupIntent({});
      setAddClientSecret(clientSecret);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to start");
      setAddOpen(false);
    }
  }, [adminView, isAdmin, createSetupIntent]);

  const handleAddSuccess = useCallback(() => {
    setAddOpen(false);
    setAddClientSecret(null);
    setAddError(null);
    fetchMethods();
  }, [fetchMethods]);

  const handleRemove = useCallback(
    async (id: string) => {
      setRemovingId(id);
      try {
        if (isAdmin) {
          await detachForCustomer({ email: customerEmail!, paymentMethodId: id });
        } else {
          await detachMine({ paymentMethodId: id });
        }
        await fetchMethods();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove");
      } finally {
        setRemovingId(null);
      }
    },
    [isAdmin, customerEmail, detachMine, detachForCustomer, fetchMethods]
  );

  const handleRetryStripeLink = useCallback(async () => {
    if (!isAdmin || !customerEmail) return;
    setRetryingLink(true);
    setError(null);
    try {
      const result = await retryStripeLink({ email: customerEmail });
      if (result.linked) {
        await fetchMethods();
      } else if (result.reason) {
        setError(result.reason);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link Stripe");
    } finally {
      setRetryingLink(false);
    }
  }, [isAdmin, customerEmail, retryStripeLink, fetchMethods]);

  if (!stripeKey) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl text-brand-text">Payment methods</CardTitle>
          <CardDescription>Stripe is not configured.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-xl text-brand-text">Payment methods</CardTitle>
        <CardDescription>
          {adminView || isAdmin
            ? `Saved cards for ${customerEmail}`
            : "View, add, or remove saved payment methods for faster checkout."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : methods && methods.length > 0 ? (
          <ul className="space-y-2">
            {methods.map((pm) => (
              <li
                key={pm.id}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  {cardLabel(pm.brand, pm.last4, pm.expMonth, pm.expYear)}
                </span>
                {!adminView && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={removingId === pm.id}
                    onClick={() => void handleRemove(pm.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {adminView || isAdmin ? "No saved payment methods." : "No saved payment methods yet."}
            </p>
            {isAdmin && customerEmail && (
              <Button
                variant="outline"
                size="sm"
                disabled={retryingLink}
                onClick={() => void handleRetryStripeLink()}
              >
                {retryingLink ? "Linking…" : "Retry Stripe link"}
              </Button>
            )}
          </div>
        )}

        {!adminView && !isAdmin && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => void handleOpenAdd()}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add payment method
          </Button>
        )}

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add payment method</DialogTitle>
              <DialogDescription>Enter card details. Your card will be saved for future orders.</DialogDescription>
            </DialogHeader>
            {addError && <p className="text-sm text-destructive">{addError}</p>}
            {addClientSecret && stripePromise && (
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret: addClientSecret,
                  appearance: { theme: "stripe", variables: { borderRadius: "6px" } },
                }}
              >
                <AddCardFormInner onSuccess={handleAddSuccess} onError={setAddError} />
              </Elements>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
