"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Id } from "../../convex/_generated/dataModel";
import { useSiteSettings } from "@/hooks/useSiteSettings";

interface PaymentFormInnerProps {
  cartId: Id<"carts">;
  onSuccess: () => void;
  onError: (message: string) => void;
  amount: number;
}

function PaymentFormInner({ cartId, onSuccess, onError, amount }: PaymentFormInnerProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!stripe || !elements) return;

      setProcessing(true);
      setErrorMessage(null);

      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/checkout?status=success&cartId=${cartId}`,
        },
        redirect: "if_required",
      });

      if (error) {
        const msg =
          error.type === "card_error" || error.type === "validation_error"
            ? error.message ?? "Payment failed"
            : "An unexpected error occurred";
        setErrorMessage(msg);
        onError(msg);
        setProcessing(false);
      } else {
        onSuccess();
      }
    },
    [stripe, elements, cartId, onSuccess, onError]
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement
        options={{
          layout: "tabs",
        }}
      />
      {errorMessage ? (
        <p className="text-sm text-red-600">{errorMessage}</p>
      ) : null}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">
          Total: ${(amount / 100).toFixed(2)}
        </p>
        <Button type="submit" disabled={!stripe || processing}>
          {processing ? "Processing..." : "Pay now"}
        </Button>
      </div>
    </form>
  );
}

interface StripePaymentFormProps {
  cartId: Id<"carts">;
  guestSessionId: string;
  onSuccess: () => void;
  onError: (message: string) => void;
}

export function StripePaymentForm({
  cartId,
  guestSessionId,
  onSuccess,
  onError,
}: StripePaymentFormProps) {
  const { get } = useSiteSettings();
  const stripeKey = get("stripePublishableKey");

  const stripePromise = useMemo(
    () => (stripeKey ? loadStripe(stripeKey) : null),
    [stripeKey]
  );

  const createPaymentIntent = useAction(api.payments.createPaymentIntent);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [amount, setAmount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const initPayment = useCallback(async () => {
    setLoading(true);
    setInitError(null);
    try {
      const result = await createPaymentIntent({ cartId, guestSessionId });
      setClientSecret(result.clientSecret);
      setAmount(result.amount);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to initialize payment";
      setInitError(msg);
      onError(msg);
    } finally {
      setLoading(false);
    }
  }, [cartId, guestSessionId, createPaymentIntent, onError]);

  // Auto-initialize payment when component mounts so form appears without extra click
  useEffect(() => {
    if (stripeKey && !clientSecret && !loading && !initError) {
      initPayment();
    }
  }, [stripeKey, clientSecret, loading, initError, initPayment]);

  if (!stripeKey) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Payment</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Stripe is not configured yet. Add the publishable key in Admin &rarr; Settings.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!clientSecret) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Payment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {initError ? (
            <p className="text-sm text-red-600">{initError}</p>
          ) : null}
          <Button onClick={initPayment} disabled={loading}>
            {loading ? "Preparing payment..." : "Enter payment details"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment</CardTitle>
      </CardHeader>
      <CardContent>
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: {
              theme: "stripe",
              variables: {
                borderRadius: "6px",
              },
            },
          }}
        >
          <PaymentFormInner
            cartId={cartId}
            onSuccess={onSuccess}
            onError={onError}
            amount={amount}
          />
        </Elements>
      </CardContent>
    </Card>
  );
}
