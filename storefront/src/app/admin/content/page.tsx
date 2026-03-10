"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const CONTENT_FIELDS = [
  // Home page
  {
    group: "Home Page",
    fields: [
      { key: "contentHomeHeroLine1", label: "Hero line 1", placeholder: "Handcrafted cakes,", inputType: "input" as const },
      { key: "contentHomeHeroLine2", label: "Hero line 2", placeholder: "made with a twist", inputType: "input" as const },
      { key: "contentHomeHeroSubtitle", label: "Hero subtitle", placeholder: "Handcrafted bundt cakes baked fresh...", inputType: "textarea" as const },
      { key: "contentHomeCtaText", label: "CTA button text", placeholder: "Start Your Order", inputType: "input" as const },
      { key: "contentHomeFeature2Title", label: "Feature 2 title", placeholder: "Schedule Ahead", inputType: "input" as const },
      { key: "contentHomeFeature2Desc", label: "Feature 2 description", placeholder: "Reserve your preferred pickup or delivery...", inputType: "textarea" as const },
      { key: "contentHomeFeature3Title", label: "Feature 3 title", placeholder: "Flexible Fulfillment", inputType: "input" as const },
      { key: "contentHomeFeature3Desc", label: "Feature 3 description", placeholder: "In-store pickup, local delivery...", inputType: "textarea" as const },
    ],
  },
  // Menu page
  {
    group: "Menu Page",
    fields: [
      { key: "contentMenuTitle", label: "Page title", placeholder: "Order Your Cake", inputType: "input" as const },
      { key: "contentMenuSubtitle", label: "Page subtitle", placeholder: "Browse our handcrafted selection...", inputType: "textarea" as const },
      { key: "contentMenuTextUs", label: "Text us link (bottom of page)", placeholder: "Text us at 954-xxx-xxxx", inputType: "input" as const },
    ],
  },
] as const;

export default function AdminContentSettingsPage() {
  const settings = useQuery(api.admin.settings.getAll);
  const setBatch = useMutation(api.admin.settings.setBatch);

  const [form, setForm] = useState<Record<string, string>>({});
  const [synced, setSynced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (settings && !synced) {
      const keys = CONTENT_FIELDS.flatMap((g) => g.fields.map((f) => f.key));
      const init: Record<string, string> = {};
      for (const key of keys) {
        init[key] = settings[key] ?? "";
      }
      setForm(init);
      setSynced(true);
    }
  }, [settings, synced]);

  function updateField(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const keys = CONTENT_FIELDS.flatMap((g) => g.fields.map((f) => f.key));
      const entries = keys.map((key) => ({
        key,
        value: String(form[key] ?? "").trim(),
      }));
      await setBatch({ entries });
      setMessage("Content saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Content Settings</h1>
        <p className="text-sm text-muted-foreground">
          Edit copy for the homepage and menu page. Leave fields empty to use built-in defaults.
        </p>
        {message && <Badge variant="secondary">{message}</Badge>}
      </header>

      {CONTENT_FIELDS.map(({ group, fields }) => (
        <Card key={group}>
          <CardHeader>
            <CardTitle>{group}</CardTitle>
            <CardDescription>
              Content shown on the storefront. Add more fields in code as needed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.map(({ key, label, placeholder, inputType }) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={key}>{label}</Label>
                {inputType === "textarea" ? (
                  <Textarea
                    id={key}
                    value={form[key] ?? ""}
                    onChange={(e) => updateField(key, e.target.value)}
                    placeholder={placeholder}
                    rows={2}
                    className="resize-none"
                  />
                ) : (
                  <Input
                    id={key}
                    value={form[key] ?? ""}
                    onChange={(e) => updateField(key, e.target.value)}
                    placeholder={placeholder}
                  />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Content"}
        </Button>
      </div>
    </main>
  );
}
