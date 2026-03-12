"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Resolver } from "react-hook-form";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { productDisplayName } from "@/lib/utils";
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
import { Badge } from "@/components/ui/badge";
import { ProductBadge, type ProductBadgeType } from "@/components/ProductBadge";
import { ImagePicker } from "@/components/ImagePicker";
import { ProductImage } from "@/components/ProductImage";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

// ── Schemas ──

const productSchema = z.object({
  productCode: z.string().optional(),
  name: z.string().min(2),
  slug: z.string().min(2),
  shortDescription: z.string().optional(),
  description: z.string().min(2),
  imagesCsv: z.string().optional(),
  categoriesCsv: z.string().optional(),
  tagsCsv: z.string().optional(),
  basePrice: z.coerce.number().nonnegative(),
  leadTimeHoursOverride: z.coerce.number().int().nonnegative().optional(),
  maxQtyPerOrder: z.coerce.number().int().positive().optional(),
  inStockToday: z.boolean().default(true),
  status: z.enum(["active", "hidden"]),
  pickup: z.boolean().default(true),
  delivery: z.boolean().default(true),
  shipping: z.boolean().default(false),
});

function parseCsv(input?: string) {
  if (!input) return [];
  return input
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

// ── Edit Product Sheet ──

function EditProductSheet({
  productId,
  onClose,
}: {
  productId: Id<"products">;
  onClose: () => void;
}) {
  const product = useQuery(api.catalog.getProduct, { productId });

  const updateProduct = useMutation(api.admin.catalog.updateProduct);
  const createVariant = useMutation(api.admin.catalog.createVariant);
  const updateVariant = useMutation(api.admin.catalog.updateVariant);
  const deleteVariant = useMutation(api.admin.catalog.deleteVariant);
  const createModifierGroup = useMutation(api.admin.catalog.createModifierGroup);
  const updateModifierGroup = useMutation(api.admin.catalog.updateModifierGroup);
  const deleteModifierGroup = useMutation(api.admin.catalog.deleteModifierGroup);
  const createModifierOption = useMutation(api.admin.catalog.createModifierOption);
  const updateModifierOption = useMutation(api.admin.catalog.updateModifierOption);
  const deleteModifierOption = useMutation(api.admin.catalog.deleteModifierOption);
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [galleryPickerOpen, setGalleryPickerOpen] = useState(false);
  const [mainImagePickerSlot, setMainImagePickerSlot] = useState<number | "all" | null>(null);
  const [shapePickerFor, setShapePickerFor] = useState<{
    shape: "mixed" | "even20" | "rose" | "blossom";
    slot?: number;
  } | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Product detail fields
  const [fields, setFields] = useState<Record<string, string | number | boolean> | null>(null);

  // Shape images: 4 shapes × 3 images each
  const [shapeImages, setShapeImages] = useState<{
    mixed: string[];
    even20: string[];
    rose: string[];
    blossom: string[];
  } | null>(null);

  // Variant inline add
  const [newVariantLabel, setNewVariantLabel] = useState("");
  const [newVariantDelta, setNewVariantDelta] = useState("");
  const [newVariantSku, setNewVariantSku] = useState("");

  // Modifier group inline add
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [newGroupRequired, setNewGroupRequired] = useState(false);
  const [newGroupMin, setNewGroupMin] = useState(0);
  const [newGroupMax, setNewGroupMax] = useState(1);

  // Modifier option inline add (keyed by group ID)
  const [addingOptionForGroup, setAddingOptionForGroup] = useState<string | null>(null);
  const [newOptionName, setNewOptionName] = useState("");
  const [newOptionDelta, setNewOptionDelta] = useState("");

  // Badge toggles (synced from product when it loads)
  const [selectedBadges, setSelectedBadges] = useState<ProductBadgeType[]>([]);
  const [editingVariantId, setEditingVariantId] = useState<Id<"productVariants"> | null>(null);
  const [editVariantLabel, setEditVariantLabel] = useState("");
  const [editVariantDelta, setEditVariantDelta] = useState("");

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupDescription, setEditGroupDescription] = useState("");
  const [editGroupRequired, setEditGroupRequired] = useState(false);
  const [editGroupMin, setEditGroupMin] = useState(0);
  const [editGroupMax, setEditGroupMax] = useState(1);

  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [editOptionName, setEditOptionName] = useState("");
  const [editOptionDelta, setEditOptionDelta] = useState("");

  const productBadges = (product as { badges?: ProductBadgeType[] })?.badges ?? [];

  useEffect(() => {
    if (product) setSelectedBadges(productBadges);
  }, [product?._id, JSON.stringify(productBadges)]);

  function toggleBadge(b: ProductBadgeType) {
    setSelectedBadges((prev) =>
      prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]
    );
  }

  // Initialize fields when product loads
  if (product && !fields) {
    setFields({
      productCode: product.productCode ?? "",
      name: product.name,
      slug: product.slug,
      shortDescription: (product as { shortDescription?: string }).shortDescription ?? "",
      description: product.description,
      basePrice: product.basePriceCents / 100,
      status: product.status,
      imagesCsv: product.images.join(", "),
      categoriesCsv: product.categories.join(", "),
      tagsCsv: product.tags.join(", "),
      inStockToday: product.inStockToday,
      pickup: product.fulfillmentFlags.pickup,
      delivery: product.fulfillmentFlags.delivery,
      shipping: product.fulfillmentFlags.shipping,
      leadTimeHoursOverride: product.leadTimeHoursOverride ?? 0,
      maxQtyPerOrder: product.maxQtyPerOrder ?? 10,
    });
  }

  if (product && !shapeImages) {
    const si = product.shapeImages;
    setShapeImages({
      mixed: si?.mixed?.slice(0, 3) ?? [],
      even20: si?.even20?.slice(0, 3) ?? [],
      rose: si?.rose?.slice(0, 3) ?? [],
      blossom: si?.blossom?.slice(0, 3) ?? [],
    });
  }

  function updateField(key: string, value: string | number | boolean) {
    setFields((prev) => (prev ? { ...prev, [key]: value } : null));
  }

  function updateShapeImages(
    shape: "mixed" | "even20" | "rose" | "blossom",
    images: string[]
  ) {
    setShapeImages((prev) =>
      prev ? { ...prev, [shape]: images.slice(0, 3) } : null
    );
  }

  function flash(msg: string) {
    setStatus(msg);
    setTimeout(() => setStatus(null), 3000);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingImage(true);
    try {
      const newIds: string[] = [];
      for (const file of Array.from(files)) {
        const url = await generateUploadUrl();
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const json = (await res.json()) as { storageId: string };
        newIds.push(json.storageId);
      }
      const existing = String(fields?.imagesCsv || "");
      const merged = [existing, ...newIds].filter(Boolean).join(", ");
      updateField("imagesCsv", merged);
      flash(`${newIds.length} image(s) uploaded`);
    } catch {
      flash("Image upload failed");
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

  async function onSaveDetails() {
    if (!fields) return;
    setSaving(true);
    try {
      await updateProduct({
        productId,
        productCode: String(fields.productCode || "").trim() || undefined,
        name: String(fields.name),
        slug: String(fields.slug),
        shortDescription: String(fields.shortDescription || "").trim() || undefined,
        description: String(fields.description),
        images: parseCsv(String(fields.imagesCsv || "")),
        status: fields.status as "active" | "hidden",
        categories: parseCsv(String(fields.categoriesCsv || "")),
        tags: parseCsv(String(fields.tagsCsv || "")),
        basePriceCents: dollarsToCents(Number(fields.basePrice)),
        fulfillmentFlags: {
          pickup: Boolean(fields.pickup),
          delivery: Boolean(fields.delivery),
          shipping: Boolean(fields.shipping),
        },
        leadTimeHoursOverride: Number(fields.leadTimeHoursOverride) || undefined,
        inStockToday: Boolean(fields.inStockToday),
        maxQtyPerOrder: Number(fields.maxQtyPerOrder) || undefined,
        badges: selectedBadges,
        shapeImages:
          shapeImages && Object.values(shapeImages).some((arr) => arr.length > 0)
            ? {
                mixed: shapeImages.mixed.length > 0 ? shapeImages.mixed : undefined,
                even20: shapeImages.even20.length > 0 ? shapeImages.even20 : undefined,
                rose: shapeImages.rose.length > 0 ? shapeImages.rose : undefined,
                blossom: shapeImages.blossom.length > 0 ? shapeImages.blossom : undefined,
              }
            : undefined,
      });
      flash("Product saved");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // ── Variant actions ──

  async function onAddVariant() {
    if (!newVariantLabel.trim()) return;
    try {
      await createVariant({
        productId,
        label: newVariantLabel.trim(),
        priceDeltaCents: dollarsToCents(Number(newVariantDelta) || 0),
        sku: newVariantSku.trim() || undefined,
      });
      setNewVariantLabel("");
      setNewVariantDelta("");
      setNewVariantSku("");
      flash("Variant added");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed");
    }
  }

  async function onSaveVariant(variantId: Id<"productVariants">) {
    try {
      await updateVariant({
        variantId,
        label: editVariantLabel.trim() || undefined,
        priceDeltaCents: dollarsToCents(Number(editVariantDelta) || 0),
      });
      setEditingVariantId(null);
      flash("Variant updated");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed");
    }
  }

  // ── Modifier group actions ──

  async function onAddGroup() {
    if (!newGroupName.trim()) return;
    try {
      await createModifierGroup({
        productId,
        name: newGroupName.trim(),
        description: newGroupDescription.trim() || undefined,
        required: newGroupRequired,
        minSelect: newGroupMin,
        maxSelect: newGroupMax,
        sortOrder: (product?.modifierGroups.length ?? 0),
      });
      setNewGroupName("");
      setNewGroupDescription("");
      setNewGroupRequired(false);
      setNewGroupMin(0);
      setNewGroupMax(1);
      flash("Group added");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed");
    }
  }

  async function onSaveGroup(groupId: Id<"modifierGroups">) {
    try {
      await updateModifierGroup({
        groupId,
        name: editGroupName.trim() || undefined,
        description: editGroupDescription.trim() || undefined,
        required: editGroupRequired,
        minSelect: editGroupMin,
        maxSelect: editGroupMax,
      });
      setEditingGroupId(null);
      flash("Group updated");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed");
    }
  }

  // ── Modifier option actions ──

  async function onAddOption(groupId: Id<"modifierGroups">, sortOrder: number) {
    if (!newOptionName.trim()) return;
    try {
      await createModifierOption({
        groupId,
        name: newOptionName.trim(),
        priceDeltaCents: dollarsToCents(Number(newOptionDelta) || 0),
        sortOrder,
      });
      setNewOptionName("");
      setNewOptionDelta("");
      setAddingOptionForGroup(null);
      flash("Option added");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed");
    }
  }

  async function onSaveOption(optionId: Id<"modifierOptions">) {
    try {
      await updateModifierOption({
        optionId,
        name: editOptionName.trim() || undefined,
        priceDeltaCents: dollarsToCents(Number(editOptionDelta) || 0),
      });
      setEditingOptionId(null);
      flash("Option updated");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed");
    }
  }

  if (!product) {
    return (
      <Sheet open onOpenChange={() => onClose()}>
        <SheetContent side="right" className="sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Loading...</SheetTitle>
          </SheetHeader>
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">Loading product...</p>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open onOpenChange={() => onClose()}>
      <SheetContent side="right" className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit: {productDisplayName(product.name)}</SheetTitle>
          <SheetDescription>
            {product.productCode ? `${product.productCode} · ` : ""}
            ${centsToDollars(product.basePriceCents)}
          </SheetDescription>
          {status && (
            <Badge variant="secondary" className="w-fit">
              {status}
            </Badge>
          )}
        </SheetHeader>

        <div className="px-6 pb-6">
          <Tabs defaultValue="details">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="mainImages">Main Images</TabsTrigger>
              <TabsTrigger value="shapeImages">Shape Images</TabsTrigger>
              <TabsTrigger value="variants">
                Variants ({product.variants.length})
              </TabsTrigger>
              <TabsTrigger value="modifiers">
                Modifiers ({product.modifierGroups.length})
              </TabsTrigger>
            </TabsList>

            {/* ════════ DETAILS TAB ════════ */}
            <TabsContent value="details" className="mt-4 space-y-4">
              {fields && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Product code</Label>
                      <Input
                        value={String(fields.productCode || "")}
                        onChange={(e) => updateField("productCode", e.target.value)}
                        placeholder="e.g. CAKE-001"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Name</Label>
                      <Input
                        value={String(fields.name)}
                        onChange={(e) => updateField("name", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Slug</Label>
                      <Input
                        value={String(fields.slug)}
                        onChange={(e) => updateField("slug", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Base price ($)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={Number(fields.basePrice)}
                        onChange={(e) => updateField("basePrice", Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Status</Label>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={String(fields.status)}
                        onChange={(e) => updateField("status", e.target.value)}
                      >
                        <option value="active">Active</option>
                        <option value="hidden">Hidden</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Lead time override (hours)</Label>
                      <Input
                        type="number"
                        value={Number(fields.leadTimeHoursOverride)}
                        onChange={(e) => updateField("leadTimeHoursOverride", Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Max qty per order</Label>
                      <Input
                        type="number"
                        value={Number(fields.maxQtyPerOrder)}
                        onChange={(e) => updateField("maxQtyPerOrder", Number(e.target.value))}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Short description (listing teaser ~4–8 words)</Label>
                    <Input
                      value={String(fields.shortDescription || "")}
                      onChange={(e) => updateField("shortDescription", e.target.value)}
                      placeholder="e.g. Delicate lychee with gin infusion"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Full description</Label>
                    <Textarea
                      value={String(fields.description)}
                      onChange={(e) => updateField("description", e.target.value)}
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Images</Label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleImageUpload}
                        className="text-sm file:mr-2 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:text-primary-foreground"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setGalleryPickerOpen(true)}
                      >
                        Choose from Gallery
                      </Button>
                      {uploadingImage && (
                        <span className="text-xs text-muted-foreground">Uploading...</span>
                      )}
                    </div>
                    <Input
                      value={String(fields.imagesCsv || "")}
                      onChange={(e) => updateField("imagesCsv", e.target.value)}
                      placeholder="Image URLs or storage IDs, comma-separated"
                    />
                    <ImagePicker
                      open={galleryPickerOpen}
                      onOpenChange={setGalleryPickerOpen}
                      onSelect={(storageIds) => {
                        const existing = parseCsv(String(fields?.imagesCsv || ""));
                        const merged = [...existing, ...storageIds].join(", ");
                        updateField("imagesCsv", merged);
                        flash(`${storageIds.length} image(s) added from gallery`);
                      }}
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Categories (comma-separated)</Label>
                      <Input
                        value={String(fields.categoriesCsv || "")}
                        onChange={(e) => updateField("categoriesCsv", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Tags (comma-separated)</Label>
                      <Input
                        value={String(fields.tagsCsv || "")}
                        onChange={(e) => updateField("tagsCsv", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Fun badges</Label>
                    <div className="flex flex-wrap gap-2">
                      {(["popular", "new_flavor", "best_seller"] as const).map((b) => {
                        const on = selectedBadges.includes(b);
                        return (
                          <button
                            key={b}
                            type="button"
                            onClick={() => toggleBadge(b)}
                            className={`cursor-pointer rounded-lg border-2 px-3 py-1.5 transition ${
                              on ? "border-primary bg-primary/5" : "border-dashed border-muted-foreground/40 opacity-70 hover:opacity-100"
                            }`}
                          >
                            <ProductBadge badge={b} className={on ? "" : "opacity-60"} />
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">Click to toggle. Shows on product cards and detail page.</p>
                  </div>

                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(fields.inStockToday)}
                        onChange={(e) => updateField("inStockToday", e.target.checked)}
                      />
                      In stock today
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(fields.pickup)}
                        onChange={(e) => updateField("pickup", e.target.checked)}
                      />
                      Pickup
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(fields.delivery)}
                        onChange={(e) => updateField("delivery", e.target.checked)}
                      />
                      Delivery
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(fields.shipping)}
                        onChange={(e) => updateField("shipping", e.target.checked)}
                      />
                      Shipping
                    </label>
                  </div>

                  <Button disabled={saving} onClick={onSaveDetails}>
                    {saving ? "Saving..." : "Save details"}
                  </Button>
                </>
              )}
            </TabsContent>

            {/* ════════ MAIN IMAGES TAB ════════ */}
            <TabsContent value="mainImages" className="mt-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Main product photos (up to 4). These show on the menu and product page.
              </p>
              {fields && (
                <div className="flex flex-wrap items-start gap-3">
                  {[0, 1, 2, 3].map((i) => {
                    const arr = parseCsv(String(fields.imagesCsv || ""));
                    const src = arr[i];
                    return (
                      <div key={i} className="w-24 shrink-0 space-y-1">
                        <button
                          type="button"
                          onClick={() => setMainImagePickerSlot(i)}
                          className="relative aspect-square w-full overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/30 transition hover:border-muted-foreground/50 hover:bg-muted/50"
                        >
                          {src ? (
                            <ProductImage
                              images={[src]}
                              name={product?.name ?? ""}
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-2xl text-muted-foreground">
                              +
                            </span>
                          )}
                        </button>
                        <p className="text-center text-xs text-muted-foreground">
                          Photo {i + 1}
                        </p>
                      </div>
                    );
                  })}
                  <div className="flex shrink-0 flex-col items-center gap-1 self-center">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setMainImagePickerSlot("all")}
                    >
                      Set all 4
                    </Button>
                  </div>
                </div>
              )}
              <Button disabled={saving} onClick={onSaveDetails}>
                {saving ? "Saving..." : "Save"}
              </Button>
              <ImagePicker
                open={mainImagePickerSlot !== null}
                onOpenChange={(open) => !open && setMainImagePickerSlot(null)}
                onSelect={(storageIds) => {
                  if (!fields || mainImagePickerSlot === null) return;
                  const existing = parseCsv(String(fields.imagesCsv || ""));
                  let next: string[];
                  if (mainImagePickerSlot === "all") {
                    next = storageIds.slice(0, 4);
                  } else {
                    const padded = [
                      existing[0] ?? "",
                      existing[1] ?? "",
                      existing[2] ?? "",
                      existing[3] ?? "",
                    ];
                    padded[mainImagePickerSlot] = storageIds[0] ?? "";
                    next = padded.filter(Boolean);
                  }
                  updateField("imagesCsv", next.join(", "));
                  setMainImagePickerSlot(null);
                  flash(
                    mainImagePickerSlot === "all"
                      ? `Set ${next.length} image(s)`
                      : "Image updated"
                  );
                }}
                multiSelect={mainImagePickerSlot === "all"}
              />
            </TabsContent>

            {/* ════════ SHAPE IMAGES TAB ════════ */}
            <TabsContent value="shapeImages" className="mt-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Configure 3 images per shape. Customer selects a shape and sees
                those images.
              </p>
              {shapeImages && (
                <div className="space-y-4">
                  {(
                    [
                      { key: "mixed" as const, label: "Mixed" },
                      { key: "even20" as const, label: "Even 20" },
                      { key: "rose" as const, label: "Rose" },
                      { key: "blossom" as const, label: "Blossom" },
                    ] as const
                  ).map(({ key, label }) => (
                    <div key={key} className="rounded-lg border p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="font-medium">{label}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setShapePickerFor({ shape: key })
                          }
                        >
                          Set 3 images
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        {[0, 1, 2].map((i) => {
                          const imgId = shapeImages[key][i];
                          return (
                            <div
                              key={i}
                              className="relative aspect-square overflow-hidden rounded-lg border bg-muted/30"
                            >
                              {imgId ? (
                                <>
                                  <ProductImage
                                    images={[imgId]}
                                    name={`${label} ${i + 1}`}
                                    className="h-full w-full object-contain"
                                  />
                                  <Button
                                    size="icon"
                                    variant="destructive"
                                    className="absolute right-1 top-1 h-6 w-6"
                                    onClick={() => {
                                      const next = [...shapeImages[key]];
                                      next.splice(i, 1);
                                      updateShapeImages(key, next);
                                    }}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  className="flex h-full w-full items-center justify-center text-muted-foreground hover:bg-muted/50"
                                  onClick={() =>
                                    setShapePickerFor({ shape: key, slot: i })
                                  }
                                >
                                  <Plus className="h-6 w-6" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Button disabled={saving} onClick={onSaveDetails}>
                {saving ? "Saving..." : "Save details"}
              </Button>
              <ImagePicker
                open={shapePickerFor !== null}
                onOpenChange={(open) => !open && setShapePickerFor(null)}
                onSelect={(ids) => {
                  if (!shapePickerFor || !shapeImages) return;
                  const { shape, slot } = shapePickerFor;
                  if (slot !== undefined) {
                    const arr = [...shapeImages[shape]];
                    arr[slot] = ids[0] ?? "";
                    updateShapeImages(shape, arr.filter(Boolean));
                  } else {
                    updateShapeImages(shape, ids);
                  }
                  setShapePickerFor(null);
                  flash(
                    slot !== undefined
                      ? "Image set"
                      : `Set ${ids.length} image(s) for ${shape}`
                  );
                }}
                multiSelect={shapePickerFor?.slot === undefined}
              />
            </TabsContent>

            {/* ════════ VARIANTS TAB ════════ */}
            <TabsContent value="variants" className="mt-4 space-y-4">
              {product.variants.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No variants yet. Add sizes, flavors, or other options below.
                </p>
              )}

              {product.variants.map((v) => (
                <div
                  key={v._id}
                  className="flex items-center gap-3 rounded-md border p-3"
                >
                  {editingVariantId === v._id ? (
                    <div className="flex flex-1 flex-wrap items-end gap-2">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs">Label</Label>
                        <Input
                          value={editVariantLabel}
                          onChange={(e) => setEditVariantLabel(e.target.value)}
                        />
                      </div>
                      <div className="w-28 space-y-1">
                        <Label className="text-xs">Delta ($)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={editVariantDelta}
                          onChange={(e) => setEditVariantDelta(e.target.value)}
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => onSaveVariant(v._id)}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingVariantId(null)}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1">
                        <p className="font-medium">{v.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {v.priceDeltaCents >= 0 ? "+" : ""}
                          ${centsToDollars(v.priceDeltaCents)}
                          {v.sku ? ` · SKU: ${v.sku}` : ""}
                        </p>
                      </div>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingVariantId(v._id);
                          setEditVariantLabel(v.label);
                          setEditVariantDelta(String(v.priceDeltaCents / 100));
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteVariant({ variantId: v._id })}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ))}

              <Separator />

              <div className="space-y-3">
                <p className="text-sm font-medium">Add variant</p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Label</Label>
                    <Input
                      placeholder='e.g. 8-inch'
                      value={newVariantLabel}
                      onChange={(e) => setNewVariantLabel(e.target.value)}
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    <Label className="text-xs">Delta ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={newVariantDelta}
                      onChange={(e) => setNewVariantDelta(e.target.value)}
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    <Label className="text-xs">SKU</Label>
                    <Input
                      placeholder="Optional"
                      value={newVariantSku}
                      onChange={(e) => setNewVariantSku(e.target.value)}
                    />
                  </div>
                  <Button size="sm" onClick={onAddVariant}>
                    <Plus className="size-4" /> Add
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* ════════ MODIFIERS TAB ════════ */}
            <TabsContent value="modifiers" className="mt-4 space-y-5">
              <p className="text-sm text-muted-foreground">
                Birthday Extras, Make it Extra Tipsy, and Shape are store-wide.{" "}
                <Link href="/admin/modifiers" className="text-primary underline hover:no-underline">
                  Edit in Store Modifiers
                </Link>
              </p>
              {(() => {
                const productSpecificGroups = product.modifierGroups.filter(
                  (g) => (g as { productId?: Id<"products"> }).productId === productId
                );
                return productSpecificGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No product-specific modifier groups. Add custom modifiers for this product below.
                  </p>
                ) : null;
              })()}

              {product.modifierGroups
                .filter((g) => (g as { productId?: Id<"products"> }).productId === productId)
                .map((group) => {
                const options = (group.options ?? []) as Array<{
                  _id: Id<"modifierOptions">;
                  name: string;
                  priceDeltaCents: number;
                  sortOrder: number;
                }>;

                return (
                  <div key={group._id} className="rounded-lg border">
                    {/* Group header */}
                    <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
                      {editingGroupId === group._id ? (
                        <div className="flex flex-1 flex-wrap items-end gap-2">
                          <div className="flex-1 space-y-1">
                            <Label className="text-xs">Name</Label>
                            <Input
                              value={editGroupName}
                              onChange={(e) => setEditGroupName(e.target.value)}
                            />
                          </div>
                          <div className="w-full flex-1 basis-full space-y-1">
                            <Label className="text-xs">Description (shown as tooltip on product page)</Label>
                            <Input
                              placeholder="e.g. Includes non-standard decoration with a Happy Birthday Cake Sign"
                              value={editGroupDescription}
                              onChange={(e) => setEditGroupDescription(e.target.value)}
                            />
                          </div>
                          <div className="w-16 space-y-1">
                            <Label className="text-xs">Min</Label>
                            <Input
                              type="number"
                              value={editGroupMin}
                              onChange={(e) => setEditGroupMin(Number(e.target.value))}
                            />
                          </div>
                          <div className="w-16 space-y-1">
                            <Label className="text-xs">Max</Label>
                            <Input
                              type="number"
                              value={editGroupMax}
                              onChange={(e) => setEditGroupMax(Number(e.target.value))}
                            />
                          </div>
                          <label className="flex items-center gap-1.5 text-xs">
                            <input
                              type="checkbox"
                              checked={editGroupRequired}
                              onChange={(e) => setEditGroupRequired(e.target.checked)}
                            />
                            Required
                          </label>
                          <Button size="sm" onClick={() => onSaveGroup(group._id)}>
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingGroupId(null)}
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{group.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {group.required ? "Required" : "Optional"} · Select{" "}
                              {group.minSelect}–{group.maxSelect}
                            </p>
                          </div>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingGroupId(group._id);
                              setEditGroupName(group.name);
                              setEditGroupDescription((group as { description?: string }).description ?? "");
                              setEditGroupRequired(group.required);
                              setEditGroupMin(group.minSelect);
                              setEditGroupMax(group.maxSelect);
                            }}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteModifierGroup({ groupId: group._id })}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </>
                      )}
                    </div>

                    {/* Options list */}
                    <div className="divide-y">
                      {options.map((opt) => (
                        <div
                          key={opt._id}
                          className="flex items-center gap-2 px-3 py-2"
                        >
                          {editingOptionId === opt._id ? (
                            <div className="flex flex-1 flex-wrap items-end gap-2">
                              <div className="flex-1 space-y-1">
                                <Label className="text-xs">Name</Label>
                                <Input
                                  value={editOptionName}
                                  onChange={(e) => setEditOptionName(e.target.value)}
                                />
                              </div>
                              <div className="w-28 space-y-1">
                                <Label className="text-xs">Delta ($)</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={editOptionDelta}
                                  onChange={(e) => setEditOptionDelta(e.target.value)}
                                />
                              </div>
                              <Button size="sm" onClick={() => onSaveOption(opt._id)}>
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingOptionId(null)}
                              >
                                <X className="size-4" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <span className="flex-1 text-sm">{opt.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {opt.priceDeltaCents === 0
                                  ? "Free"
                                  : `+$${centsToDollars(opt.priceDeltaCents)}`}
                              </span>
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                onClick={() => {
                                  setEditingOptionId(opt._id);
                                  setEditOptionName(opt.name);
                                  setEditOptionDelta(String(opt.priceDeltaCents / 100));
                                }}
                              >
                                <Pencil className="size-3" />
                              </Button>
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => deleteModifierOption({ optionId: opt._id })}
                              >
                                <Trash2 className="size-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      ))}

                      {/* Add option row */}
                      {addingOptionForGroup === group._id ? (
                        <div className="flex flex-wrap items-end gap-2 px-3 py-2">
                          <div className="flex-1 space-y-1">
                            <Label className="text-xs">Option name</Label>
                            <Input
                              placeholder="e.g. Gold Sprinkles"
                              value={newOptionName}
                              onChange={(e) => setNewOptionName(e.target.value)}
                            />
                          </div>
                          <div className="w-28 space-y-1">
                            <Label className="text-xs">Delta ($)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={newOptionDelta}
                              onChange={(e) => setNewOptionDelta(e.target.value)}
                            />
                          </div>
                          <Button
                            size="sm"
                            onClick={() => onAddOption(group._id, options.length)}
                          >
                            Add
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setAddingOptionForGroup(null)}
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="flex w-full items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/30"
                          onClick={() => {
                            setAddingOptionForGroup(group._id);
                            setNewOptionName("");
                            setNewOptionDelta("");
                          }}
                        >
                          <Plus className="size-3" /> Add option
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              <Separator />

              {/* Add modifier group */}
              <div className="space-y-3">
                <p className="text-sm font-medium">Add modifier group</p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Group name</Label>
                    <Input
                      placeholder="e.g. Birthday Extras"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                    />
                  </div>
                  <div className="w-full flex-1 basis-full space-y-1">
                    <Label className="text-xs">Description (shown as tooltip)</Label>
                    <Input
                      placeholder="e.g. Includes non-standard decoration with a Happy Birthday Cake Sign"
                      value={newGroupDescription}
                      onChange={(e) => setNewGroupDescription(e.target.value)}
                    />
                  </div>
                  <div className="w-16 space-y-1">
                    <Label className="text-xs">Min</Label>
                    <Input
                      type="number"
                      value={newGroupMin}
                      onChange={(e) => setNewGroupMin(Number(e.target.value))}
                    />
                  </div>
                  <div className="w-16 space-y-1">
                    <Label className="text-xs">Max</Label>
                    <Input
                      type="number"
                      value={newGroupMax}
                      onChange={(e) => setNewGroupMax(Number(e.target.value))}
                    />
                  </div>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={newGroupRequired}
                      onChange={(e) => setNewGroupRequired(e.target.checked)}
                    />
                    Required
                  </label>
                  <Button size="sm" onClick={onAddGroup}>
                    <Plus className="size-4" /> Add group
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Main Page ──

export default function AdminProductsPage() {
  const products = useQuery(api.admin.catalog.listProducts);

  const createProduct = useMutation(api.admin.catalog.createProduct);
  const updateProduct = useMutation(api.admin.catalog.updateProduct);
  const deleteProduct = useMutation(api.admin.catalog.deleteProduct);
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);

  const [editingProductId, setEditingProductId] = useState<Id<"products"> | null>(null);
  const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(new Set());
  const [quickEditValues, setQuickEditValues] = useState<Record<string, { price: string; shortDescription: string; description: string }>>({});
  const [quickSavingId, setQuickSavingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [uploadedImageIds, setUploadedImageIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sortedProducts = useMemo(() => {
    if (!products) return [];
    return [...products].sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  type ProductFormData = z.infer<typeof productSchema>;
  const productForm = useForm<ProductFormData>({
    // Zod 4 + @hookform/resolvers infers unknown for coerced fields; output is correct at runtime
    resolver: zodResolver(productSchema) as Resolver<ProductFormData>,
    defaultValues: {
      productCode: "",
      name: "",
      slug: "",
      shortDescription: "",
      description: "",
      imagesCsv: "",
      categoriesCsv: "",
      tagsCsv: "",
      basePrice: 0,
      leadTimeHoursOverride: 0,
      maxQtyPerOrder: 10,
      inStockToday: true,
      status: "active",
      pickup: true,
      delivery: true,
      shipping: false,
    },
  });

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const ids: string[] = [];
      for (const file of Array.from(files)) {
        const url = await generateUploadUrl();
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const json = (await res.json()) as { storageId: string };
        ids.push(json.storageId);
      }
      setUploadedImageIds((prev) => [...prev, ...ids]);
      setStatusMessage(`${ids.length} image(s) uploaded.`);
    } catch {
      setStatusMessage("Image upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onCreateProduct(values: z.infer<typeof productSchema>) {
    try {
      const manualImages = parseCsv(values.imagesCsv);
      await createProduct({
        productCode: values.productCode?.trim() || undefined,
        name: values.name,
        slug: values.slug,
        shortDescription: values.shortDescription?.trim() || undefined,
        description: values.description,
        images: [...uploadedImageIds, ...manualImages],
        status: values.status,
        categories: parseCsv(values.categoriesCsv),
        tags: parseCsv(values.tagsCsv),
        basePriceCents: dollarsToCents(values.basePrice),
        fulfillmentFlags: {
          pickup: values.pickup,
          delivery: values.delivery,
          shipping: values.shipping,
        },
        leadTimeHoursOverride: values.leadTimeHoursOverride || undefined,
        inStockToday: values.inStockToday,
        maxQtyPerOrder: values.maxQtyPerOrder || undefined,
      });
      setStatusMessage("Product created.");
      setUploadedImageIds([]);
      productForm.reset();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Create failed.");
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="space-y-2 pb-1">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Catalog Manager</h1>
        <p className="text-sm text-muted-foreground">
          Manage products, variants, modifier groups, and modifier options.
        </p>
        {statusMessage ? (
          <Badge variant="secondary" className="w-fit">
            {statusMessage}
          </Badge>
        ) : null}
      </header>

      <section className="flex flex-col gap-6">
        {/* ── Products List (top) ── */}
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Products</CardTitle>
                <CardDescription>Expand to quick-edit price & description, or click Edit for full details</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setExpandedProductIds(new Set(sortedProducts.map((p) => p._id)))}>
                  Expand all
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setExpandedProductIds(new Set())}>
                  Collapse all
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/admin/products/images">Bulk edit images</Link>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 p-4 sm:p-6 sm:pt-0">
            {sortedProducts.map((product) => {
              const isExpanded = expandedProductIds.has(product._id);
              const draft = quickEditValues[product._id] ?? {
                price: centsToDollars(product.basePriceCents),
                shortDescription: (product as { shortDescription?: string }).shortDescription ?? "",
                description: product.description,
              };
              return (
                <div key={product._id} className="flex flex-col gap-2 rounded-md border-[0.5px] border-dotted border-muted-foreground/30 p-2 shadow-[0_0.5px_2px_rgba(0,0,0,0.06)]">
                  <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:gap-3">
                    <div className="flex min-w-0 items-center gap-2 sm:flex-1">
                      <button
                        type="button"
                        className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => {
                          setExpandedProductIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(product._id)) next.delete(product._id);
                            else next.add(product._id);
                            return next;
                          });
                        }}
                        aria-label={isExpanded ? "Collapse" : "Expand"}
                      >
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded">
                        <ProductImage
                          images={product.images}
                          name={product.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">
                          {productDisplayName(product.name)}
                          <span className="ml-2 text-xs text-muted-foreground font-normal">
                            ${centsToDollars(product.basePriceCents)}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs sm:shrink-0">
                      <Button
                        size="sm"
                        variant={product.status === "active" ? "default" : "outline"}
                        className="min-w-[4.5rem]"
                        onClick={async () => {
                          await updateProduct({
                            productId: product._id,
                            status: product.status === "active" ? "hidden" : "active",
                          });
                        }}
                      >
                        {product.status === "active" ? "Active" : "Hidden"}
                      </Button>
                      <Button
                        size="sm"
                        variant={product.inStockToday ? "secondary" : "outline"}
                        className="min-w-[5rem]"
                        onClick={async () => {
                          await updateProduct({
                            productId: product._id,
                            inStockToday: !product.inStockToday,
                          });
                        }}
                      >
                        {product.inStockToday ? "Available today" : "Future"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingProductId(product._id)}
                      >
                        <Pencil className="mr-1 size-3.5" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={async () => {
                          await deleteProduct({ productId: product._id });
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="flex flex-col gap-2 border-t border-dotted border-muted-foreground/20 pt-2">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
                        <div className="space-y-1">
                          <Label className="text-[11px]">Price ($)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={draft.price}
                            onChange={(e) =>
                              setQuickEditValues((prev) => ({
                                ...prev,
                                [product._id]: { ...draft, price: e.target.value },
                              }))
                            }
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px]">Short (listing)</Label>
                          <Input
                            value={draft.shortDescription}
                            onChange={(e) =>
                              setQuickEditValues((prev) => ({
                                ...prev,
                                [product._id]: { ...draft, shortDescription: e.target.value },
                              }))
                            }
                            placeholder="~4–8 words"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px]">Full description</Label>
                          <Textarea
                            rows={2}
                            value={draft.description}
                            onChange={(e) =>
                              setQuickEditValues((prev) => ({
                                ...prev,
                                [product._id]: { ...draft, description: e.target.value },
                              }))
                            }
                            className="resize-none text-xs"
                          />
                        </div>
                        <Button
                          size="sm"
                          disabled={quickSavingId === product._id}
                          className="h-8 shrink-0"
                          onClick={async () => {
                            setQuickSavingId(product._id);
                            try {
                              await updateProduct({
                                productId: product._id,
                                basePriceCents: dollarsToCents(Number(draft.price) || 0),
                                shortDescription: draft.shortDescription.trim() || undefined,
                                description: draft.description.trim() || product.description,
                              });
                            setStatusMessage("Saved");
                            setTimeout(() => setStatusMessage(null), 2000);
                          } catch (err) {
                            setStatusMessage(err instanceof Error ? err.message : "Save failed");
                          } finally {
                            setQuickSavingId(null);
                          }
                        }}
                      >
                        {quickSavingId === product._id ? "Saving…" : "Save"}
                      </Button>
                    </div>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* ── Create Product (bottom) ── */}
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle>Create Product</CardTitle>
            <CardDescription>Add a new product to the catalog</CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 sm:pt-0">
            <form className="space-y-4" onSubmit={productForm.handleSubmit(onCreateProduct)}>
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" {...productForm.register("name")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="productCode">Product code (e.g. CAKE-001)</Label>
                <Input id="productCode" placeholder="Optional, must be unique" {...productForm.register("productCode")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <Input id="slug" {...productForm.register("slug")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shortDescription">Short description (listing teaser ~4–8 words)</Label>
                <Input id="shortDescription" placeholder="Optional" {...productForm.register("shortDescription")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Full description</Label>
                <Textarea id="description" {...productForm.register("description")} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="basePrice">Base price ($)</Label>
                  <Input id="basePrice" type="number" step="0.01" {...productForm.register("basePrice")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status (active|hidden)</Label>
                  <Input id="status" {...productForm.register("status")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="leadTimeHoursOverride">Lead time override (hours)</Label>
                  <Input
                    id="leadTimeHoursOverride"
                    type="number"
                    {...productForm.register("leadTimeHoursOverride")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxQtyPerOrder">Max qty per order</Label>
                  <Input
                    id="maxQtyPerOrder"
                    type="number"
                    {...productForm.register("maxQtyPerOrder")}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Product Images</Label>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="text-sm file:mr-2 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:text-primary-foreground"
                  />
                  {uploading && <span className="text-xs text-muted-foreground">Uploading...</span>}
                </div>
                {uploadedImageIds.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {uploadedImageIds.map((id, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {id.slice(0, 12)}...
                        <button
                          type="button"
                          className="ml-1 text-destructive"
                          onClick={() => setUploadedImageIds((prev) => prev.filter((_, j) => j !== i))}
                        >
                          x
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <Label htmlFor="imagesCsv" className="text-xs text-muted-foreground">
                  Or enter image URLs (comma-separated)
                </Label>
                <Input id="imagesCsv" placeholder="https://..." {...productForm.register("imagesCsv")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="categoriesCsv">Categories CSV</Label>
                <Input id="categoriesCsv" placeholder="cakes,wedding" {...productForm.register("categoriesCsv")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tagsCsv">Tags CSV</Label>
                <Input id="tagsCsv" placeholder="chocolate,featured" {...productForm.register("tagsCsv")} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" {...productForm.register("inStockToday")} />
                  In stock today
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" {...productForm.register("pickup")} />
                  Pickup
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" {...productForm.register("delivery")} />
                  Delivery
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" {...productForm.register("shipping")} />
                  Shipping
                </label>
              </div>
              <Button type="submit">Create product</Button>
            </form>
          </CardContent>
        </Card>
      </section>

      {/* ── Edit Product Sheet Modal ── */}
      {editingProductId && (
        <EditProductSheet
          productId={editingProductId}
          onClose={() => setEditingProductId(null)}
        />
      )}
    </main>
  );
}
