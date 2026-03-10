"use client";

import { Component, type ReactNode } from "react";
import { TriviaCard } from "@/components/TriviaCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = Record<string, never>;

type State = {
  hasError: boolean;
};

/**
 * Error boundary wrapper for TriviaCard.
 * Prevents trivia failures (e.g., missing Convex module) from crashing the account page.
 */
export class TriviaCardWithBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(): void {
    // Error is logged by React; we just hide the trivia card
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <Card className="border-muted">
          <CardHeader>
            <CardTitle className="font-display text-xl text-brand-text">
              Cake Trivia — Earn Points
            </CardTitle>
            <CardDescription>Trivia temporarily unavailable. Check back soon.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              We&apos;re having trouble loading trivia. Your order history and other features are
              working normally.
            </p>
          </CardContent>
        </Card>
      );
    }
    return <TriviaCard />;
  }
}
