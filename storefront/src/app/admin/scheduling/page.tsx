"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminSchedulingPage() {
  const tiers = useQuery(api.checkout.listDeliveryTiers);
  const upsertTier = useMutation(api.checkout.upsertDeliveryTier);
  const upsertRules = useMutation(api.scheduling.adminUpsertAvailabilityRules);

  const [message, setMessage] = useState<string | null>(null);
  const [tierForm, setTierForm] = useState({
    minMiles: "0",
    maxMiles: "5",
    feeCents: "500",
    enabled: true,
  });
  const [rulesForm, setRulesForm] = useState({
    timezone: "America/New_York",
    globalLeadTimeHours: "24",
    holdMinutes: "10",
    pickupDuration: "30",
    deliveryDuration: "30",
    shippingDuration: "60",
  });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Scheduling & Delivery</h1>
        <p className="text-sm text-muted-foreground">
          Manage delivery tiers and default scheduling rules.
        </p>
        {message ? <Badge variant="secondary">{message}</Badge> : null}
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Delivery Tier</CardTitle>
            <CardDescription>FUL-004 distance tier setup</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label htmlFor="minMiles">Min miles</Label>
                <Input
                  id="minMiles"
                  type="number"
                  value={tierForm.minMiles}
                  onChange={(event) =>
                    setTierForm((prev) => ({ ...prev, minMiles: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxMiles">Max miles</Label>
                <Input
                  id="maxMiles"
                  type="number"
                  value={tierForm.maxMiles}
                  onChange={(event) =>
                    setTierForm((prev) => ({ ...prev, maxMiles: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="feeCents">Fee cents</Label>
                <Input
                  id="feeCents"
                  type="number"
                  value={tierForm.feeCents}
                  onChange={(event) =>
                    setTierForm((prev) => ({ ...prev, feeCents: event.target.value }))
                  }
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={tierForm.enabled}
                onChange={(event) =>
                  setTierForm((prev) => ({ ...prev, enabled: event.target.checked }))
                }
              />
              Enabled
            </label>
            <Button
              onClick={async () => {
                try {
                  await upsertTier({
                    minMiles: Number(tierForm.minMiles),
                    maxMiles: Number(tierForm.maxMiles),
                    feeCents: Number(tierForm.feeCents),
                    enabled: tierForm.enabled,
                  });
                  setMessage("Delivery tier saved.");
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : "Tier save failed");
                }
              }}
            >
              Save tier
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scheduling Rules</CardTitle>
            <CardDescription>SCH-001..SCH-006 baseline config</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                value={rulesForm.timezone}
                onChange={(event) =>
                  setRulesForm((prev) => ({ ...prev, timezone: event.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="globalLead">Global lead hours</Label>
                <Input
                  id="globalLead"
                  type="number"
                  value={rulesForm.globalLeadTimeHours}
                  onChange={(event) =>
                    setRulesForm((prev) => ({ ...prev, globalLeadTimeHours: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="holdMinutes">Hold minutes</Label>
                <Input
                  id="holdMinutes"
                  type="number"
                  value={rulesForm.holdMinutes}
                  onChange={(event) =>
                    setRulesForm((prev) => ({ ...prev, holdMinutes: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label htmlFor="pickupDuration">Pickup slot min</Label>
                <Input
                  id="pickupDuration"
                  type="number"
                  value={rulesForm.pickupDuration}
                  onChange={(event) =>
                    setRulesForm((prev) => ({ ...prev, pickupDuration: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deliveryDuration">Delivery slot min</Label>
                <Input
                  id="deliveryDuration"
                  type="number"
                  value={rulesForm.deliveryDuration}
                  onChange={(event) =>
                    setRulesForm((prev) => ({ ...prev, deliveryDuration: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shippingDuration">Shipping slot min</Label>
                <Input
                  id="shippingDuration"
                  type="number"
                  value={rulesForm.shippingDuration}
                  onChange={(event) =>
                    setRulesForm((prev) => ({ ...prev, shippingDuration: event.target.value }))
                  }
                />
              </div>
            </div>
            <Button
              onClick={async () => {
                try {
                  await upsertRules({
                    version: Date.now(),
                    timezone: rulesForm.timezone,
                    storeHours: {
                      monday: [{ start: "09:00", end: "17:00" }],
                      tuesday: [{ start: "09:00", end: "17:00" }],
                      wednesday: [{ start: "09:00", end: "17:00" }],
                      thursday: [{ start: "09:00", end: "17:00" }],
                      friday: [{ start: "09:00", end: "17:00" }],
                      saturday: [{ start: "09:00", end: "14:00" }],
                      sunday: [],
                    },
                    cutoffTimes: {
                      monday: { pickup: "15:00", delivery: "14:00", shipping: "12:00" },
                      tuesday: { pickup: "15:00", delivery: "14:00", shipping: "12:00" },
                      wednesday: { pickup: "15:00", delivery: "14:00", shipping: "12:00" },
                      thursday: { pickup: "15:00", delivery: "14:00", shipping: "12:00" },
                      friday: { pickup: "15:00", delivery: "14:00", shipping: "12:00" },
                      saturday: { pickup: "12:00", delivery: "11:00", shipping: "10:00" },
                      sunday: {},
                    },
                    globalLeadTimeHours: Number(rulesForm.globalLeadTimeHours),
                    slotDurationMinutesByMode: {
                      pickup: Number(rulesForm.pickupDuration),
                      delivery: Number(rulesForm.deliveryDuration),
                      shipping: Number(rulesForm.shippingDuration),
                    },
                    holdMinutes: Number(rulesForm.holdMinutes),
                    effectiveFrom: new Date().toISOString().slice(0, 10),
                  });
                  setMessage("Scheduling rules saved and enabled.");
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : "Rules save failed");
                }
              }}
            >
              Save scheduling rules
            </Button>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Delivery Tiers</CardTitle>
          <CardDescription>Current tiers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(tiers ?? []).map((tier) => (
            <div key={tier._id} className="flex items-center justify-between rounded border p-3 text-sm">
              <span>
                {tier.minMiles} - {tier.maxMiles} miles • {tier.feeCents} cents
              </span>
              <Badge variant={tier.enabled ? "default" : "outline"}>
                {tier.enabled ? "enabled" : "disabled"}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
