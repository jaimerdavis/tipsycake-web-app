"use client";

import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function fmt(cents: number) {
  return cents === 0 ? "Free" : `$${(cents / 100).toFixed(2)}`;
}

export default function AdminSchedulingPage() {
  const tiers = useQuery(api.checkout.listDeliveryTiers);
  const rules = useQuery(api.scheduling.adminGetEnabledRules);
  const settings = useQuery(api.admin.settings.getAll);
  const upsertTier = useMutation(api.checkout.upsertDeliveryTier);
  const deleteTier = useMutation(api.checkout.deleteDeliveryTier);
  const testAddress = useAction(api.maps.testAddressForDelivery);
  const upsertRules = useMutation(api.scheduling.adminUpsertAvailabilityRules);
  const setBatch = useMutation(api.admin.settings.setBatch);

  const [message, setMessage] = useState<string | null>(null);
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [tierForm, setTierForm] = useState({
    minMiles: "0",
    maxMiles: "5",
    fee: "0",
    enabled: true,
  });
  const [rulesForm, setRulesForm] = useState({
    timezone: "America/New_York",
    globalLeadTimeHours: "5",
    holdMinutes: "10",
    pickupDuration: "60",
    deliveryDuration: "60",
    shippingDuration: "60",
    slotTimes: "09:00\n10:00\n11:00\n12:00\n13:00\n14:00\n15:00\n16:00\n17:00",
    defaultMaxOrdersPerSlot: "3",
  });
  const [deliveryConfigForm, setDeliveryConfigForm] = useState({
    deliveryMaxMiles: "20",
    shippingFeePerCakeCents: "1900",
  });

  useEffect(() => {
    if (settings) {
      setDeliveryConfigForm((prev) => ({
        deliveryMaxMiles: settings.deliveryMaxMiles ?? prev.deliveryMaxMiles,
        shippingFeePerCakeCents: settings.shippingFeePerCakeCents ?? prev.shippingFeePerCakeCents,
      }));
    }
  }, [settings]);

  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => {
    if (rules) {
      setRulesForm((prev) => ({
        ...prev,
        timezone: rules.timezone ?? prev.timezone,
        globalLeadTimeHours: String(rules.globalLeadTimeHours ?? prev.globalLeadTimeHours),
        holdMinutes: String(rules.holdMinutes ?? prev.holdMinutes),
        pickupDuration: String(rules.slotDurationMinutesByMode.pickup ?? prev.pickupDuration),
        deliveryDuration: String(rules.slotDurationMinutesByMode.delivery ?? prev.deliveryDuration),
        shippingDuration: String(rules.slotDurationMinutesByMode.shipping ?? prev.shippingDuration),
        slotTimes: Array.isArray(rules.slotTimes) && rules.slotTimes.length > 0
          ? rules.slotTimes.join("\n")
          : prev.slotTimes,
        defaultMaxOrdersPerSlot: typeof rules.defaultMaxOrdersPerSlot === "number"
          ? String(rules.defaultMaxOrdersPerSlot)
          : prev.defaultMaxOrdersPerSlot,
      }));
    }
  }, [rules]);

  useEffect(() => {
    if (settings) {
      setDeliveryConfigForm((prev) => ({
        deliveryMaxMiles: settings.deliveryMaxMiles ?? prev.deliveryMaxMiles,
        shippingFeePerCakeCents: settings.shippingFeePerCakeCents ?? prev.shippingFeePerCakeCents,
      }));
    }
  }, [settings]);

  const [savingTier, setSavingTier] = useState(false);
  const [testAddressStr, setTestAddressStr] = useState("");
  const [testResult, setTestResult] = useState<{
    formattedAddress?: string;
    distanceMiles?: number;
    eligibleDelivery?: boolean;
    tierFeeCents?: number | null;
    tierLabel?: string | null;
    error?: string;
  } | null>(null);
  const [testingAddress, setTestingAddress] = useState(false);

  function loadTierForEdit(tier: {
    _id: string;
    minMiles: number;
    maxMiles: number;
    feeCents: number;
    enabled: boolean;
  }) {
    setEditingTierId(tier._id);
    setTierForm({
      minMiles: String(tier.minMiles),
      maxMiles: String(tier.maxMiles),
      fee: (tier.feeCents / 100).toFixed(2),
      enabled: tier.enabled,
    });
  }

  function resetTierForm() {
    setEditingTierId(null);
    setTierForm({ minMiles: "0", maxMiles: "5", fee: "0", enabled: true });
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Scheduling & Delivery</h1>
        <p className="text-sm text-muted-foreground">
          Manage delivery zones, pricing, and scheduling rules.
        </p>
        {message && <Badge variant="secondary">{message}</Badge>}
      </header>

      {/* ── Delivery & Shipping Config ── */}
      <Card>
        <CardHeader>
          <CardTitle>Delivery & Shipping Config</CardTitle>
          <CardDescription>
            Max delivery radius and shipping fee per cake. Beyond max miles, customers use shipping only.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-4">
          <div className="space-y-2">
            <Label htmlFor="deliveryMaxMiles">Max delivery radius (miles)</Label>
            <Input
              id="deliveryMaxMiles"
              type="number"
              min={1}
              max={100}
              value={deliveryConfigForm.deliveryMaxMiles}
              onChange={(e) =>
                setDeliveryConfigForm((prev) => ({ ...prev, deliveryMaxMiles: e.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">Beyond this distance, delivery is not available; customer must use shipping.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="shippingFeePerCakeCents">Shipping fee per cake (cents)</Label>
            <Input
              id="shippingFeePerCakeCents"
              type="number"
              min={0}
              value={deliveryConfigForm.shippingFeePerCakeCents}
              onChange={(e) =>
                setDeliveryConfigForm((prev) => ({ ...prev, shippingFeePerCakeCents: e.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">e.g. 1900 = $19 per cake. USA-wide.</p>
          </div>
          <Button
            onClick={async () => {
              try {
                await setBatch({
                  entries: [
                    { key: "deliveryMaxMiles", value: String(Math.max(1, Number(deliveryConfigForm.deliveryMaxMiles) || 20)) },
                    { key: "shippingFeePerCakeCents", value: String(Math.max(0, Number(deliveryConfigForm.shippingFeePerCakeCents) || 1900)) },
                  ],
                });
                setMessage("Delivery & shipping config saved.");
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Save failed");
              }
            }}
          >
            Save config
          </Button>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        {/* ── Delivery Pricing Form ── */}
        <Card>
          <CardHeader>
            <CardTitle>
              {editingTierId ? "Edit Delivery Zone" : "Add Delivery Zone"}
            </CardTitle>
            <CardDescription>Set delivery fee by distance range</CardDescription>
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
                <Label htmlFor="fee">Fee ($)</Label>
                <Input
                  id="fee"
                  type="number"
                  step="0.01"
                  min="0"
                  value={tierForm.fee}
                  onChange={(event) =>
                    setTierForm((prev) => ({ ...prev, fee: event.target.value }))
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
            <div className="flex items-center gap-2">
              <Button
                disabled={savingTier}
                onClick={async () => {
                  setSavingTier(true);
                  try {
                    await upsertTier({
                      tierId: editingTierId ? (editingTierId as never) : undefined,
                      minMiles: Number(tierForm.minMiles),
                      maxMiles: Number(tierForm.maxMiles),
                      feeCents: Math.round(Number(tierForm.fee) * 100),
                      enabled: tierForm.enabled,
                    });
                    setMessage(editingTierId ? "Zone updated." : "Zone created.");
                    resetTierForm();
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : "Save failed");
                  } finally {
                    setSavingTier(false);
                  }
                }}
              >
                {savingTier ? "Saving…" : editingTierId ? "Update zone" : "Add zone"}
              </Button>
              {editingTierId && (
                <Button variant="outline" onClick={resetTierForm}>
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Scheduling Rules ── */}
        <Card>
          <CardHeader>
            <CardTitle>Scheduling Rules</CardTitle>
            <CardDescription>Lead times, hold duration, and slot length</CardDescription>
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
            <div className="space-y-2">
              <Label htmlFor="slotTimes">Static slot times (one per line, HH:mm, EST)</Label>
              <textarea
                id="slotTimes"
                rows={6}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono"
                placeholder={"09:00\n10:00\n11:00"}
                value={rulesForm.slotTimes}
                onChange={(event) =>
                  setRulesForm((prev) => ({ ...prev, slotTimes: event.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                When set, these times override store hours. One slot per time. Leave empty to use store hours.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultMaxOrders">Default max orders per slot</Label>
              <Input
                id="defaultMaxOrders"
                type="number"
                min={1}
                value={rulesForm.defaultMaxOrdersPerSlot}
                onChange={(event) =>
                  setRulesForm((prev) => ({ ...prev, defaultMaxOrdersPerSlot: event.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label htmlFor="pickupDuration">Pickup slot (min)</Label>
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
                <Label htmlFor="deliveryDuration">Delivery slot (min)</Label>
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
                <Label htmlFor="shippingDuration">Shipping slot (min)</Label>
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
                  const slotTimesParsed = rulesForm.slotTimes
                    .split("\n")
                    .map((s) => s.trim())
                    .filter((s) => /^\d{1,2}:\d{2}$/.test(s));
                  await upsertRules({
                    version: Date.now(),
                    timezone: rulesForm.timezone,
                    slotTimes: slotTimesParsed.length > 0 ? slotTimesParsed : undefined,
                    defaultMaxOrdersPerSlot:
                      rulesForm.defaultMaxOrdersPerSlot !== ""
                        ? Math.max(1, Number(rulesForm.defaultMaxOrdersPerSlot) || 1)
                        : undefined,
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
                      // Same-day order cutoff: 12:15 PM EST. After this, no same-day pickup/delivery.
                      monday: { pickup: "12:15", delivery: "12:15", shipping: "12:00" },
                      tuesday: { pickup: "12:15", delivery: "12:15", shipping: "12:00" },
                      wednesday: { pickup: "12:15", delivery: "12:15", shipping: "12:00" },
                      thursday: { pickup: "12:15", delivery: "12:15", shipping: "12:00" },
                      friday: { pickup: "12:15", delivery: "12:15", shipping: "12:00" },
                      saturday: { pickup: "12:15", delivery: "12:15", shipping: "10:00" },
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

      {/* ── Test address ── */}
      <Card>
        <CardHeader>
          <CardTitle>Test address for delivery</CardTitle>
          <CardDescription>
            Paste an address to see distance from the shop, matching tier, and fee.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="e.g. 123 Main St, Fort Lauderdale, FL 33301"
              value={testAddressStr}
              onChange={(e) => setTestAddressStr(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), document.getElementById("test-addr-btn")?.click())}
            />
            <Button
              id="test-addr-btn"
              disabled={!testAddressStr.trim() || testingAddress}
              onClick={async () => {
                setTestingAddress(true);
                setTestResult(null);
                try {
                  const res = await testAddress({ addressStr: testAddressStr.trim() });
                  setTestResult(res);
                  if (res.error) setMessage(res.error);
                } catch (err) {
                  setTestResult({
                    error: err instanceof Error ? err.message : "Test failed",
                  });
                } finally {
                  setTestingAddress(false);
                }
              }}
            >
              {testingAddress ? "Testing…" : "Test"}
            </Button>
          </div>
          {testResult && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              {testResult.error ? (
                <p className="text-destructive">{testResult.error}</p>
              ) : (
                <div className="space-y-1">
                  {testResult.formattedAddress && (
                    <p className="font-medium">{testResult.formattedAddress}</p>
                  )}
                  <p>
                    Distance: <strong>{testResult.distanceMiles} mi</strong> from shop
                  </p>
                  <p>
                    Eligible for delivery:{" "}
                    <strong>{testResult.eligibleDelivery ? "Yes" : "No"}</strong>
                  </p>
                  {testResult.tierLabel && (
                    <p>
                      Tier: {testResult.tierLabel} → {fmt(testResult.tierFeeCents ?? 0)}
                    </p>
                  )}
                  {testResult.eligibleDelivery && !testResult.tierLabel && (
                    <p className="text-amber-600">No matching tier for this distance.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Existing Zones ── */}
      <Card>
        <CardHeader>
          <CardTitle>Delivery Pricing Zones</CardTitle>
          <CardDescription>Click a zone to edit it</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(tiers ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No delivery zones configured yet.</p>
          )}
          {(tiers ?? []).map((tier) => (
            <div
              key={tier._id}
              className={`flex cursor-pointer items-center justify-between rounded border p-3 text-sm transition-colors hover:bg-muted/50 ${
                editingTierId === tier._id ? "border-primary bg-primary/5" : ""
              }`}
              onClick={() => loadTierForEdit(tier)}
            >
              <span>
                {tier.minMiles}–{tier.maxMiles} miles &bull; {fmt(tier.feeCents)}
              </span>
              <div className="flex items-center gap-2">
                <Badge variant={tier.enabled ? "default" : "outline"}>
                  {tier.enabled ? "Enabled" : "Disabled"}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    loadTierForEdit(tier);
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirm(`Delete ${tier.minMiles}–${tier.maxMiles} mi zone?`)) return;
                    try {
                      await deleteTier({ tierId: tier._id });
                      setMessage("Zone deleted.");
                      if (editingTierId === tier._id) resetTierForm();
                    } catch (err) {
                      setMessage(err instanceof Error ? err.message : "Delete failed");
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
