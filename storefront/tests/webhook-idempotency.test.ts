import { describe, it, expect } from "vitest";

/**
 * Tests for webhook idempotency invariants (AI-DEV-004).
 * Simulates the dedup logic used in finalizeFromPaymentEvent.
 */

type EventStatus = "received" | "processed" | "ignored" | "failed";

interface WebhookEvent {
  provider: "stripe" | "paypal";
  eventId: string;
  status: EventStatus;
}

class WebhookDedup {
  private events = new Map<string, WebhookEvent>();

  private key(provider: string, eventId: string) {
    return `${provider}:${eventId}`;
  }

  shouldProcess(provider: "stripe" | "paypal", eventId: string): boolean {
    const existing = this.events.get(this.key(provider, eventId));
    if (existing?.status === "processed") return false;
    return true;
  }

  markReceived(provider: "stripe" | "paypal", eventId: string) {
    const k = this.key(provider, eventId);
    if (!this.events.has(k)) {
      this.events.set(k, { provider, eventId, status: "received" });
    }
  }

  markProcessed(provider: "stripe" | "paypal", eventId: string) {
    this.events.set(this.key(provider, eventId), {
      provider,
      eventId,
      status: "processed",
    });
  }

  markFailed(provider: "stripe" | "paypal", eventId: string) {
    this.events.set(this.key(provider, eventId), {
      provider,
      eventId,
      status: "failed",
    });
  }
}

describe("webhook idempotency (AI-DEV-004)", () => {
  it("first event processes normally", () => {
    const dedup = new WebhookDedup();
    expect(dedup.shouldProcess("stripe", "evt_001")).toBe(true);
    dedup.markReceived("stripe", "evt_001");
    dedup.markProcessed("stripe", "evt_001");
  });

  it("duplicate event is rejected after processing", () => {
    const dedup = new WebhookDedup();
    dedup.markReceived("stripe", "evt_001");
    dedup.markProcessed("stripe", "evt_001");

    expect(dedup.shouldProcess("stripe", "evt_001")).toBe(false);
  });

  it("failed event can be retried", () => {
    const dedup = new WebhookDedup();
    dedup.markReceived("stripe", "evt_002");
    dedup.markFailed("stripe", "evt_002");

    expect(dedup.shouldProcess("stripe", "evt_002")).toBe(true);
  });

  it("different event IDs are independent", () => {
    const dedup = new WebhookDedup();
    dedup.markReceived("stripe", "evt_001");
    dedup.markProcessed("stripe", "evt_001");

    expect(dedup.shouldProcess("stripe", "evt_002")).toBe(true);
  });

  it("same event ID across different providers are independent", () => {
    const dedup = new WebhookDedup();
    dedup.markReceived("stripe", "evt_001");
    dedup.markProcessed("stripe", "evt_001");

    expect(dedup.shouldProcess("paypal", "evt_001")).toBe(true);
  });

  it("received but not yet processed event can still be processed", () => {
    const dedup = new WebhookDedup();
    dedup.markReceived("stripe", "evt_003");
    expect(dedup.shouldProcess("stripe", "evt_003")).toBe(true);
  });
});

describe("payment_intent.succeeded dedup", () => {
  it("checkout.session.completed and payment_intent.succeeded for same cart", () => {
    const dedup = new WebhookDedup();

    dedup.markReceived("stripe", "evt_cs_001");
    dedup.markProcessed("stripe", "evt_cs_001");

    expect(dedup.shouldProcess("stripe", "evt_pi_001")).toBe(true);
  });
});
