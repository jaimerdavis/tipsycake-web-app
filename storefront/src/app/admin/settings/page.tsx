"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ServiceStatus = "missing" | "connected" | "invalid" | "error";

interface EnvEntry {
  key: string;
  label: string;
  category: string;
  status: ServiceStatus;
  detail?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  payments: "Payments",
  maps: "Maps & Location",
  email: "Email",
  sms: "SMS",
};

const STORE_FIELDS = [
  { key: "storeName", label: "Store Name", placeholder: "The Tipsy Cake" },
  {
    key: "storePhone",
    label: "Store Phone",
    placeholder: "+15551234567",
    help: "For owner SMS alerts. Use E.164: +1 + 10 digits (e.g. +15551234567).",
  },
  { key: "storeEmail", label: "Store Email", placeholder: "hello@thetipsycake.com" },
  { key: "storeAddress", label: "Store Address", placeholder: "123 Main St, Anytown, ST 12345" },
  { key: "storeTimezone", label: "Timezone", placeholder: "America/New_York" },
  { key: "siteUrl", label: "Site URL", placeholder: "https://order.tipsycake.com" },
  {
    key: "homeUrl",
    label: "Home URL",
    placeholder: "/",
    help: "URL or path for the logo and Home link (e.g. / or /products). Default: /",
  },
] as const;

const PUBLIC_KEY_FIELDS = [
  {
    key: "stripePublishableKey",
    label: "Stripe Publishable Key",
    placeholder: "pk_live_... or pk_test_...",
    help: "Starts with pk_live_ or pk_test_. This is safe to store here — it's already public.",
  },
  {
    key: "googleMapsClientKey",
    label: "Google Maps Client Key",
    placeholder: "AIza...",
    help: "Used for address autocomplete on the storefront. Restrict to your domain in Google Cloud Console.",
  },
  {
    key: "mapboxAccessToken",
    label: "Mapbox Access Token (public)",
    placeholder: "pk....",
    help: "For driver/admin map display. Use public token with URL restrictions in Mapbox dashboard.",
  },
] as const;

export default function AdminSettingsPage() {
  const settings = useQuery(api.admin.settings.getAll);
  const setBatch = useMutation(api.admin.settings.setBatch);
  const checkEnv = useAction(api.admin.settings.checkEnvStatus);

  const [envStatus, setEnvStatus] = useState<EnvEntry[] | null>(null);
  const [envLoading, setEnvLoading] = useState(false);
  const [envError, setEnvError] = useState<string | null>(null);

  const generateUploadUrl = useMutation(api.admin.settings.generateUploadUrl);
  const saveUploadedFile = useMutation(api.admin.settings.saveUploadedFile);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const heroInputRef = useRef<HTMLInputElement>(null);
  const shapeIconRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [uploadingHero, setUploadingHero] = useState(false);
  const [uploadingShapeIcon, setUploadingShapeIcon] = useState<string | null>(null);

  const [form, setForm] = useState<Record<string, string>>({});
  const [synced, setSynced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (settings && !synced) {
      setForm({
        ...settings,
        notifyOwnerOnOrder: settings.notifyOwnerOnOrder ?? "true",
      });
      setSynced(true);
    }
  }, [settings, synced]);

  const loadEnvStatus = useCallback(async () => {
    setEnvLoading(true);
    setEnvError(null);
    try {
      const result = await checkEnv({
        formOverrides: {
          mapboxAccessToken: (form.mapboxAccessToken ?? "").trim() || undefined,
        },
      });
      setEnvStatus(result);
    } catch (err) {
      setEnvError(err instanceof Error ? err.message : "Failed to check env status");
    } finally {
      setEnvLoading(false);
    }
  }, [checkEnv, form.mapboxAccessToken]);

  useEffect(() => {
    loadEnvStatus();
  }, [loadEnvStatus]);

  function updateField(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const entries = Object.entries(form)
        .filter(([, value]) => value != null && String(value).trim() !== "")
        .map(([key, value]) => ({ key, value: String(value).trim() }));
      await setBatch({ entries });
      setMessage("Settings saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleFileUpload(
    file: File,
    settingKey: string,
    setUploading: (v: boolean) => void
  ) {
    setUploading(true);
    setMessage(null);
    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await result.json();
      const url = await saveUploadedFile({ storageId, settingKey });
      setForm((prev) => ({ ...prev, [settingKey]: url }));
      const labels: Record<string, string> = {
        logoUrl: "Logo",
        faviconUrl: "Favicon",
        heroImageUrl: "Hero image",
        shapeIconMixed: "Mixed shape icon",
        shapeIconEven20: "Even 20 shape icon",
        shapeIconRose: "Rose shape icon",
        shapeIconBlossom: "Blossom shape icon",
      };
      setMessage(`${labels[settingKey] ?? "File"} uploaded successfully.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const grouped = envStatus
    ? Object.entries(
        envStatus.reduce<Record<string, EnvEntry[]>>((acc, entry) => {
          (acc[entry.category] ??= []).push(entry);
          return acc;
        }, {})
      )
    : [];

  const allConnected = envStatus?.every((e) => e.status === "connected" || e.status === "missing") ?? false;
  const connectedCount = envStatus?.filter((e) => e.status === "connected").length ?? 0;
  const configuredCount = envStatus?.filter((e) => e.status !== "missing").length ?? 0;
  const totalCount = envStatus?.length ?? 0;

  function statusBadge(entry: EnvEntry) {
    switch (entry.status) {
      case "connected":
        return (
          <Badge className="bg-green-600 hover:bg-green-600 text-white">
            Connected
          </Badge>
        );
      case "invalid":
        return (
          <Badge variant="destructive">
            Invalid
          </Badge>
        );
      case "error":
        return (
          <Badge className="border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-50">
            Error
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
            Missing
          </Badge>
        );
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage store configuration, public keys, and view API integration status.
        </p>
        {message && <Badge variant="secondary">{message}</Badge>}
      </header>

      {/* ── Branding ── */}
      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>
            Upload your store logo and favicon. These will appear in the storefront header and browser tab.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Hero Image */}
          <div className="mb-6 space-y-3">
            <Label>Homepage Hero Image</Label>
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/30">
                {form.heroImageUrl ? (
                  <img
                    src={form.heroImageUrl}
                    alt="Hero"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">No image</span>
                )}
              </div>
              <div className="space-y-2">
                <input
                  ref={heroInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, "heroImageUrl", setUploadingHero);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={uploadingHero}
                  onClick={() => heroInputRef.current?.click()}
                >
                  {uploadingHero ? "Uploading…" : form.heroImageUrl ? "Change image" : "Upload image"}
                </Button>
                <p className="text-xs text-muted-foreground">Displayed above the headline on the homepage. Recommended: wide landscape image, at least 800px wide.</p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {/* Logo */}
            <div className="space-y-3">
              <Label>Logo</Label>
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/30">
                  {form.logoUrl ? (
                    <img
                      src={form.logoUrl}
                      alt="Store logo"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">No logo</span>
                  )}
                </div>
                <div className="space-y-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file, "logoUrl", setUploadingLogo);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={uploadingLogo}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {uploadingLogo ? "Uploading…" : form.logoUrl ? "Change logo" : "Upload logo"}
                  </Button>
                  <p className="text-xs text-muted-foreground">Recommended: square PNG, at least 200x200px</p>
                </div>
              </div>
            </div>

            {/* Favicon */}
            <div className="space-y-3">
              <Label>Favicon</Label>
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/30">
                  {form.faviconUrl ? (
                    <img
                      src={form.faviconUrl}
                      alt="Favicon"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">No icon</span>
                  )}
                </div>
                <div className="space-y-2">
                  <input
                    ref={faviconInputRef}
                    type="file"
                    accept="image/png,image/x-icon,image/svg+xml"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file, "faviconUrl", setUploadingFavicon);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={uploadingFavicon}
                    onClick={() => faviconInputRef.current?.click()}
                  >
                    {uploadingFavicon ? "Uploading…" : form.faviconUrl ? "Change favicon" : "Upload favicon"}
                  </Button>
                  <p className="text-xs text-muted-foreground">Recommended: 32x32 or 64x64 PNG/ICO</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Shape Icons ── */}
      <Card>
        <CardHeader>
          <CardTitle>Shape Icons</CardTitle>
          <CardDescription>
            Icons shown for each shape option on product pages. Used when customers choose Mixed, Even 20, Rose, or Blossom. Falls back to /shapes/Icon-X-small.png if not set.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { key: "shapeIconMixed", label: "Mixed" },
              { key: "shapeIconEven20", label: "Even 20" },
              { key: "shapeIconRose", label: "Rose" },
              { key: "shapeIconBlossom", label: "Blossom" },
            ].map(({ key, label }) => (
              <div key={key} className="space-y-2">
                <Label>{label}</Label>
                <div className="flex flex-col gap-2">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/30">
                    {form[key] ? (
                      <img src={form[key]} alt={label} className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-xs text-muted-foreground">No icon</span>
                    )}
                  </div>
                  <input
                    ref={(el) => { shapeIconRefs.current[key] = el; }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleFileUpload(file, key, (v) => setUploadingShapeIcon(v ? key : null));
                      }
                      e.target.value = "";
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={uploadingShapeIcon === key}
                    onClick={() => shapeIconRefs.current[key]?.click()}
                  >
                    {uploadingShapeIcon === key ? "Uploading…" : form[key] ? "Change" : "Upload"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── API Integration Status ── */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>API Integration Status</CardTitle>
              <CardDescription>
                Server-side secrets configured in the Convex Dashboard environment variables.
                Each key is verified against its service — values are never exposed.
              </CardDescription>
            </div>
            {envStatus && (
              <div className="flex items-center gap-2">
                <Badge variant={connectedCount === totalCount ? "default" : "secondary"} className={connectedCount === totalCount ? "bg-green-600" : ""}>
                  {connectedCount} connected
                </Badge>
                {configuredCount > connectedCount && (
                  <Badge variant="destructive">
                    {configuredCount - connectedCount} invalid
                  </Badge>
                )}
                {totalCount - configuredCount > 0 && (
                  <Badge variant="outline" className="text-muted-foreground">
                    {totalCount - configuredCount} missing
                  </Badge>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {envLoading && <p className="text-sm text-muted-foreground">Verifying connections…</p>}
          {envError && <p className="text-sm text-red-600">{envError}</p>}

          {grouped.map(([category, entries]) => (
            <div key={category} className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                {CATEGORY_LABELS[category] ?? category}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {entries.map((entry) => (
                  <div
                    key={entry.key}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <span className="text-sm">{entry.label}</span>
                      {entry.detail && (
                        <p className="truncate text-xs text-muted-foreground">{entry.detail}</p>
                      )}
                    </div>
                    {statusBadge(entry)}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {envStatus && configuredCount < totalCount && (
            <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <p className="font-medium">How to configure missing keys:</p>
              <ol className="mt-1 list-inside list-decimal space-y-0.5 text-xs">
                <li>
                  Open the{" "}
                  <a
                    href="https://dashboard.convex.dev"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    Convex Dashboard
                  </a>
                </li>
                <li>Select your deployment &rarr; Settings &rarr; Environment Variables</li>
                <li>Add each missing key with its value</li>
                <li>Come back here and click Verify to check</li>
              </ol>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            disabled={envLoading}
            onClick={loadEnvStatus}
          >
            {envLoading ? "Verifying…" : "Verify connections"}
          </Button>
        </CardContent>
      </Card>

      {/* ── Public Keys ── */}
      <Card>
        <CardHeader>
          <CardTitle>Public Keys</CardTitle>
          <CardDescription>
            Client-side keys that are safe to store here. These are already visible to browsers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {PUBLIC_KEY_FIELDS.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={field.key}>{field.label}</Label>
              <Input
                id={field.key}
                placeholder={field.placeholder}
                value={form[field.key] ?? ""}
                onChange={(e) => updateField(field.key, e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{field.help}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── Store Configuration ── */}
      <Card>
        <CardHeader>
          <CardTitle>Store Configuration</CardTitle>
          <CardDescription>
            General store information used across the site.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {STORE_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={field.key}>{field.label}</Label>
                <Input
                  id={field.key}
                  placeholder={field.placeholder}
                  value={form[field.key] ?? ""}
                  onChange={(e) => updateField(field.key, e.target.value)}
                />
                {"help" in field && field.help && (
                  <p className="text-xs text-muted-foreground">{field.help}</p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Save ── */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save all settings"}
        </Button>
        {message && <span className="text-sm text-muted-foreground">{message}</span>}
      </div>
    </main>
  );
}
