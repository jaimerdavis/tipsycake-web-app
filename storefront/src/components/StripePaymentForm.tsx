"use client";

import { useState, useCallback } from "react";
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

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""
);

interface PaymentFormInnerProps {
  onSuccess: () => void;
  onError: (message: string) => void;
  amount: number;
}

function PaymentFormInner({ onSuccess, onError, amount }: PaymentFormInnerProps) {
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
          return_url: `${window.location.origin}/checkout?status=success`,
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
    [stripe, elements, onSuccess, onError]
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
            onSuccess={onSuccess}
            onError={onError}
            amount={amount}
          />
        </Elements>
      </CardContent>
    </Card>
  );
}
