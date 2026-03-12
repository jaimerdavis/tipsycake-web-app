"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Resolver } from "react-hook-form";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { api } from "../../../../../convex/_generated/api";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProductImageGallery } from "@/components/ProductImage";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Info } from "lucide-react";
import { getOrCreateGuestSessionId } from "@/lib/guestSession";
import { clearPreferredFulfillment, getPreferredFulfillment } from "@/lib/fulfillmentPreference";
import { ProductBadges } from "@/components/ProductBadge";
import { productDisplayName } from "@/lib/utils";

const customizationSchema = z.object({
  variantId: z.string().optional(),
  qty: z.coerce.number().int().positive(),
  note: z.string().max(200).optional(),
});

type GroupErrorMap = Record<string, string>;
type SelectedOptionsByGroup = Record<string, string[]>;

const SHAPE_OPTION_TO_KEY: Record<string, "mixed" | "even20" | "rose" | "blossom"> = {
  Mixed: "mixed",
  "Even 20": "even20",
  Rose: "rose",
  Blossom: "blossom",
};

const SHAPE_OPTION_TO_FALLBACK_ICON: Record<string, string> = {
  Mixed: "/shapes/Icon-1-small.png",
  "Even 20": "/shapes/Icon-2-small.png",
  Rose: "/shapes/Icon-3-small.png",
  Blossom: "/shapes/Icon-4-small.png",
};

const SHAPE_OPTION_TO_SETTING_KEY: Record<string, string> = {
  Mixed: "shapeIconMixed",
  "Even 20": "shapeIconEven20",
  Rose: "shapeIconRose",
  Blossom: "shapeIconBlossom",
};

function validateModifierSelections(
  groups: Array<{
    _id: string;
    name: string;
    required: boolean;
    minSelect: number;
    maxSelect: number;
  }>,
  selections: SelectedOptionsByGroup
) {
  const errors: GroupErrorMap = {};

  for (const group of groups) {
    const selected = selections[group._id] ?? [];
    if (group.required && selected.length === 0) {
      errors[group._id] = `${group.name} is required.`;
      continue;
    }
    if (selected.length < group.minSelect) {
      errors[group._id] = `${group.name}: select at least ${group.minSelect}.`;
      continue;
    }
    if (selected.length > group.maxSelect) {
      errors[group._id] = `${group.name}: select at most ${group.maxSelect}.`;
    }
  }

  return errors;
}

function ModifierGroupInfoIcon({ description }: { description: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex shrink-0 rounded-full p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="What's included?"
        >
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="max-w-xs text-sm" align="start">
        <p>{description}</p>
      </PopoverContent>
    </Popover>
  );
}

export default function ProductDetailPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading...</div>}>
      <ProductDetailContent />
    </Suspense>
  );
}

function ProductDetailContent() {
  const params = useParams<{ productId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const productId = params.productId;
  const editingCartItemId = searchParams.get("cartItemId");
  const isEditMode = !!editingCartItemId;

  const [guestSessionId, setGuestSessionId] = useState("");
  useEffect(() => {
    setGuestSessionId(getOrCreateGuestSessionId());
  }, []);
  const settings = useSiteSettings();
  const product = useQuery(api.catalog.getProduct, {
    productId: productId as never,
  });
  const existingItem = useQuery(
    api.cart.getCartItem,
    editingCartItemId ? { cartItemId: editingCartItemId as never } : "skip"
  );

  const addItem = useMutation(api.cart.addItem);
  const updateItemFull = useMutation(api.cart.updateItemFull);

  const [selectedOptionsByGroup, setSelectedOptionsByGroup] = useState<SelectedOptionsByGroup>({});
  const [groupErrors, setGroupErrors] = useState<GroupErrorMap>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);
  const [showShapeModal, setShowShapeModal] = useState(false);
  const [showExtrasPromptModal, setShowExtrasPromptModal] = useState(false);
  const shapeSectionRef = useRef<HTMLDivElement>(null);
  const extrasSectionRef = useRef<HTMLDivElement>(null);

  type FormData = z.infer<typeof customizationSchema>;
  const form = useForm<FormData>({
    // Zod 4 + @hookform/resolvers infers unknown for coerced fields; output is correct at runtime
    resolver: zodResolver(customizationSchema) as Resolver<FormData>,
    defaultValues: {
      variantId: "",
      qty: 1,
      note: "",
    },
  });

  useEffect(() => {
    if (!isEditMode || !existingItem || prefilled) return;

    form.reset({
      variantId: (existingItem.variantId as string) ?? "",
      qty: existingItem.qty,
      note: existingItem.itemNote ?? "",
    });

    const modsByGroup: SelectedOptionsByGroup = {};
    for (const mod of existingItem.modifiers) {
      const gid = mod.groupId as string;
      (modsByGroup[gid] ??= []).push(mod.optionId as string);
    }
    setSelectedOptionsByGroup(modsByGroup);
    setPrefilled(true);
  }, [isEditMode, existingItem, prefilled, form]);

  const shapeGroup = useMemo(
    () => product?.modifierGroups.find((g) => g.name === "Shape"),
    [product]
  );

  const maxQty = useMemo(() => {
    if (!product) return 10;
    return product.maxQtyPerOrder ?? 10;
  }, [product]);

  // Default shape to "Even 20" when not editing and no shape selected yet
  useEffect(() => {
    if (isEditMode || !product || prefilled) return;
    const shape = product.modifierGroups.find((g) => g.name === "Shape");
    if (!shape) return;
    const gid = shape._id as string;
    const current = selectedOptionsByGroup[gid] ?? [];
    if (current.length > 0) return;
    const even20Opt = shape.options.find((o) => o.name === "Even 20");
    if (even20Opt) {
      setSelectedOptionsByGroup((prev) => ({ ...prev, [gid]: [even20Opt._id as string] }));
    }
  }, [isEditMode, product, prefilled, selectedOptionsByGroup]);

  const selectedShapeKey = useMemo(() => {
    if (!shapeGroup) return "";
    const selectedOptIds = selectedOptionsByGroup[shapeGroup._id as string] ?? [];
    const selectedOptId = selectedOptIds[0];
    const opt = selectedOptId
      ? shapeGroup.options.find((o) => (o._id as string) === selectedOptId)
      : undefined;
    return opt ? SHAPE_OPTION_TO_KEY[opt.name] ?? "" : "";
  }, [shapeGroup, selectedOptionsByGroup]);

  const activeImages = useMemo(() => {
    if (!product) return [];
    if (!shapeGroup || !product.shapeImages) return product.images;
    const selectedOptIds = selectedOptionsByGroup[shapeGroup._id as string] ?? [];
    const selectedOptId = selectedOptIds[0];
    const selectedOpt = selectedOptId
      ? shapeGroup.options.find((o) => (o._id as string) === selectedOptId)
      : undefined;
    if (!selectedOpt) return product.images;
    const shapeKey = SHAPE_OPTION_TO_KEY[selectedOpt.name];
    if (!shapeKey) return product.images;
    const shapeImgArr = product.shapeImages[shapeKey];
    if (!shapeImgArr || shapeImgArr.length === 0) return product.images;
    return shapeImgArr;
  }, [product, shapeGroup, selectedOptionsByGroup]);

  const watchedQty = form.watch("qty");
  const watchedVariantId = form.watch("variantId");

  const liveTotal = useMemo(() => {
    if (!product) return 0;

    let unitCents = product.basePriceCents;

    if (watchedVariantId) {
      const variant = product.variants.find((v) => v._id === watchedVariantId);
      if (variant) unitCents += variant.priceDeltaCents;
    }

    for (const [groupId, optionIds] of Object.entries(selectedOptionsByGroup)) {
      const group = product.modifierGroups.find((g) => (g._id as string) === groupId);
      if (!group) continue;
      for (const optId of optionIds) {
        const opt = group.options.find((o) => (o._id as string) === optId);
        if (opt) unitCents += opt.priceDeltaCents;
      }
    }

    const qty = Math.max(1, Number(watchedQty) || 1);
    return unitCents * qty;
  }, [product, watchedVariantId, watchedQty, selectedOptionsByGroup]);

  const prevTotalRef = useRef(liveTotal);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const [priceAnimating, setPriceAnimating] = useState(false);

  useEffect(() => {
    if (prevTotalRef.current !== liveTotal) {
      prevTotalRef.current = liveTotal;
      setPriceAnimating(true);
      const timer = setTimeout(() => setPriceAnimating(false), 400);
      return () => clearTimeout(timer);
    }
  }, [liveTotal]);

  function toggleOption(
    groupId: string,
    optionId: string,
    maxSelect: number,
    singleSelect: boolean
  ) {
    setSelectedOptionsByGroup((prev) => {
      const current = prev[groupId] ?? [];
      const alreadySelected = current.includes(optionId);

      let next: string[];
      if (singleSelect) {
        next = alreadySelected ? [] : [optionId];
      } else if (alreadySelected) {
        next = current.filter((id) => id !== optionId);
      } else if (current.length >= maxSelect) {
        next = current;
      } else {
        next = [...current, optionId];
      }

      return { ...prev, [groupId]: next };
    });
  }

  async function onSubmit(values: z.infer<typeof customizationSchema>) {
    if (!product) return;

    if (values.qty > maxQty) {
      form.setError("qty", {
        message: `Max quantity for this product is ${maxQty}.`,
      });
      return;
    }

    const modifierValidation = validateModifierSelections(
      product.modifierGroups.map((group) => ({
        _id: group._id as string,
        name: group.name,
        required: group.required,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
      })),
      selectedOptionsByGroup
    );

    setGroupErrors(modifierValidation);
    setSubmitError(null);
    if (Object.keys(modifierValidation).length > 0) {
      if (shapeGroup && modifierValidation[shapeGroup._id as string]) {
        setShowShapeModal(true);
      }
      return;
    }

    if (!isEditMode && shapeGroup) {
      const birthdayGroup = product.modifierGroups.find((g) => g.name === "Birthday Extras");
      const extraTipsyGroup = product.modifierGroups.find((g) => g.name.toLowerCase() === "make it extra tipsy");
      const birthdaySelected = birthdayGroup && (selectedOptionsByGroup[birthdayGroup._id as string] ?? []).length > 0;
      const extraTipsySelected = extraTipsyGroup && (selectedOptionsByGroup[extraTipsyGroup._id as string] ?? []).length > 0;
      const birthdayUnselected = birthdayGroup && !birthdayGroup.required && (selectedOptionsByGroup[birthdayGroup._id as string] ?? []).length === 0;
      const extraTipsyUnselected = extraTipsyGroup && !extraTipsyGroup.required && (selectedOptionsByGroup[extraTipsyGroup._id as string] ?? []).length === 0;
      // Only prompt when at least one is optional/unselected AND neither has been selected
      const hasOptionalExtras =
        (birthdayUnselected || extraTipsyUnselected) && !birthdaySelected && !extraTipsySelected;
      if (hasOptionalExtras) {
        setShowExtrasPromptModal(true);
        return;
      }
    }

    await doActualSubmit(values);
  }

  async function doActualSubmit(values: z.infer<typeof customizationSchema>) {
    if (!product) return;

    const modifiersPayload = Object.entries(selectedOptionsByGroup).flatMap(
      ([groupId, optionIds]) =>
        optionIds.map((optionId) => ({ groupId: groupId as never, optionId: optionId as never }))
    );

    try {
      if (isEditMode && editingCartItemId) {
        await updateItemFull({
          cartItemId: editingCartItemId as never,
          variantId: values.variantId ? (values.variantId as never) : undefined,
          qty: values.qty,
          itemNote: values.note || undefined,
          modifiers: modifiersPayload,
        });
      } else {
        const preferredMode = getPreferredFulfillment();
        await addItem({
          guestSessionId: guestSessionId || undefined,
          productId: product._id,
          variantId: values.variantId ? (values.variantId as never) : undefined,
          qty: values.qty,
          itemNote: values.note || undefined,
          modifiers: modifiersPayload,
          preferredFulfillmentMode:
            preferredMode === "pickup" ? "pickup" : undefined,
        });
        if (preferredMode === "pickup") {
          clearPreferredFulfillment();
        }
      }
      router.push("/cart");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  if (!product) {
    return (
      <main className="mx-auto w-full max-w-4xl p-6">
        <p className="text-sm text-muted-foreground">Loading product...</p>
      </main>
    );
  }

  const shapeSelectorBlock =
    shapeGroup && (
      <div className="space-y-2 rounded-xl border border-amber-200/60 bg-amber-50/30 p-2 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-display text-lg text-brand-text sm:text-xl">{shapeGroup.name}</p>
          <Badge variant="outline" className="rounded-full text-xs">
            {shapeGroup.required ? "Required" : "Optional"}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-3">
          {shapeGroup.options.map((option) => {
            const isChecked = (selectedOptionsByGroup[shapeGroup._id as string] ?? []).includes(option._id as string);
            const iconSrc =
              settings.get(SHAPE_OPTION_TO_SETTING_KEY[option.name]) ||
              SHAPE_OPTION_TO_FALLBACK_ICON[option.name];
            return (
              <button
                type="button"
                key={option._id}
                className={`flex flex-col cursor-pointer items-center justify-center gap-1 rounded-xl border p-2 text-sm transition-all duration-200 active:scale-[0.97] sm:gap-2 sm:p-3 ${
                  isChecked
                    ? "border-rose-500 bg-rose-50 shadow-sm ring-1 ring-rose-500/20"
                    : "hover:bg-muted/50 hover:shadow-sm"
                }`}
                onClick={() => {
                  toggleOption(shapeGroup._id as string, option._id as string, shapeGroup.maxSelect, true);
                  imageContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                {iconSrc ? (
                  <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-white/80 p-1 sm:h-12 sm:w-12">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={iconSrc} alt={option.name} className="h-full w-full object-contain" />
                  </div>
                ) : null}
                <span className="text-center leading-tight font-medium">{option.name}</span>
              </button>
            );
          })}
        </div>
        {groupErrors[shapeGroup._id as string] && (
          <p className="text-xs text-red-600">{groupErrors[shapeGroup._id as string]}</p>
        )}
      </div>
    );

  return (
    <>
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 pb-28 sm:gap-6 sm:px-6 sm:pb-24">
      <header className="animate-fade-in-up space-y-4">
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link href={isEditMode ? "/cart" : "/products"}>
            &larr; {isEditMode ? "Back to cart" : "Back to menu"}
          </Link>
        </Button>
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-5xl text-brand-text">{productDisplayName(product.name)}</h1>
            {isEditMode && <Badge variant="secondary" className="rounded-full">Editing</Badge>}
          </div>
          {(() => {
            const short = (product as { shortDescription?: string }).shortDescription?.trim();
            const full = product.description;
            return (
              <div className="space-y-0.5">
                {short && (
                  <p className="text-xs text-muted-foreground">{short}</p>
                )}
                <p className={short ? "text-[11px] text-muted-foreground/90 leading-relaxed" : "text-sm text-muted-foreground"}>{full}</p>
              </div>
            );
          })()}
        </div>
        <div className="space-y-3">
          <div className="relative">
            <ProductBadges badges={(product as { badges?: string[] }).badges} size="sm" className="absolute left-2 top-2 z-10" />
          <div
            ref={imageContainerRef}
            key={selectedShapeKey || "default"}
            className="animate-scale-in"
          >
            <ProductImageGallery
              images={activeImages}
              name={product.name}
              maxImages={4}
            />
          </div>
          </div>
          <p className="text-xs text-muted-foreground/80">Each cake is made with care, so final appearance may vary slightly from the photo.</p>
          <div ref={shapeSectionRef}>{shapeSelectorBlock}</div>
        </div>
      </header>

      <Card className="animate-fade-in-up stagger-2 rounded-2xl">
        {isEditMode && (
          <CardHeader>
            <CardTitle className="font-display text-2xl text-brand-text">Update Your Selection</CardTitle>
            <CardDescription>Change your options below and hit Update to save changes.</CardDescription>
          </CardHeader>
        )}
        <CardContent className={!isEditMode ? "pt-6" : ""}>
          <form id="product-form" className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
            {product.variants.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="variantId" className="font-display text-xl text-brand-text">Variant</Label>
                <select
                  id="variantId"
                  className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                  {...form.register("variantId")}
                >
                  <option value="">No variant</option>
                  {product.variants.map((variant) => (
                    <option key={variant._id} value={variant._id}>
                      {variant.label} ({variant.priceDeltaCents >= 0 ? "+" : ""}
                      ${(variant.priceDeltaCents / 100).toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(() => {
              const toggleGroups = product.modifierGroups.filter(
                (g) => g.options.length === 1 && g.options[0].name === g.name
              );
              const multiGroups = product.modifierGroups.filter(
                (g) => !(g.options.length === 1 && g.options[0].name === g.name)
              );
              const shapeGroup = multiGroups.find((g) => g.name === "Shape");
              const otherMultiGroups = multiGroups.filter((g) => g.name !== "Shape");

              const renderMultiGroup = (group: (typeof multiGroups)[number]) => {
                const selected = selectedOptionsByGroup[group._id as string] ?? [];
                const singleSelect = group.maxSelect === 1;
                return (
                  <div key={group._id} className="space-y-4 rounded-2xl border-2 border-amber-300/80 bg-gradient-to-b from-amber-50/90 to-amber-100/50 p-6 shadow-sm sm:p-7">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <p className="font-display text-2xl font-bold text-brand-text sm:text-3xl">{group.name}</p>
                        {(group as { description?: string }).description && (
                          <ModifierGroupInfoIcon description={(group as { description?: string }).description!} />
                        )}
                      </div>
                      <Badge variant="outline" className="rounded-full">
                        {group.required ? "Required" : "Optional"} • {group.minSelect}-{group.maxSelect}
                      </Badge>
                    </div>
                    <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
                      {group.options.map((option) => {
                        const isChecked = selected.includes(option._id as string);
                        return (
                          <button
                            type="button"
                            key={option._id}
                            className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border p-3 text-sm transition-all duration-150 active:scale-[0.97] ${
                              isChecked ? "border-rose-500 bg-rose-50 shadow-sm" : "hover:bg-muted/50 hover:shadow-sm"
                            }`}
                            onClick={() =>
                              toggleOption(group._id as string, option._id as string, group.maxSelect, singleSelect)
                            }
                          >
                            <span className="text-center leading-tight">{option.name}</span>
                            {option.priceDeltaCents !== 0 && (
                              <span className="text-xs text-muted-foreground">
                                {option.priceDeltaCents >= 0 ? "+" : ""}
                                ${(option.priceDeltaCents / 100).toFixed(2)}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {groupErrors[group._id as string] && (
                      <p className="text-xs text-red-600">{groupErrors[group._id as string]}</p>
                    )}
                  </div>
                );
              };

              return (
                <>
                  {toggleGroups.length > 0 && (
                    <div ref={extrasSectionRef} className="space-y-4 rounded-2xl border-2 border-amber-300/80 bg-gradient-to-b from-amber-50/90 to-amber-100/50 p-6 shadow-sm sm:p-7">
                      <p className="font-display text-2xl font-bold text-brand-text sm:text-3xl">Extras</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {toggleGroups.map((group) => {
                          const option = group.options[0];
                          const desc = (group as { description?: string }).description;
                          const isChecked = (selectedOptionsByGroup[group._id as string] ?? []).includes(option._id as string);
                          return (
                            <div key={group._id} className="flex items-center gap-1">
                              <button
                                type="button"
                                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-all duration-150 active:scale-[0.97] ${
                                  isChecked ? "border-rose-500 bg-rose-50 shadow-sm" : "hover:bg-muted/50 hover:shadow-sm"
                                }`}
                                onClick={() =>
                                  toggleOption(group._id as string, option._id as string, group.maxSelect, true)
                                }
                              >
                                <span className="leading-tight">{group.name}</span>
                                {option.priceDeltaCents !== 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    +${(option.priceDeltaCents / 100).toFixed(2)}
                                  </span>
                                )}
                              </button>
                              {desc && <ModifierGroupInfoIcon description={desc} />}
                            </div>
                          );
                        })}
                      </div>
                      {toggleGroups.map((group) =>
                        groupErrors[group._id as string] ? (
                          <p key={group._id} className="text-xs text-red-600">{groupErrors[group._id as string]}</p>
                        ) : null
                      )}
                    </div>
                  )}
                  {otherMultiGroups.map((group) => renderMultiGroup(group))}
                </>
              );
            })()}

            <div className="space-y-2">
              <Label htmlFor="note">Cake order comment</Label>
              <Textarea
                id="note"
                placeholder="Optional message for this item..."
                {...form.register("note")}
              />
            </div>

            {submitError && (
              <p className="text-sm text-red-600">{submitError}</p>
            )}

            {isEditMode && (
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" className="rounded-full" asChild>
                  <Link href="/cart">Cancel</Link>
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </main>
    {typeof document !== "undefined" &&
      createPortal(
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 pt-3 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] supports-[backdrop-filter]:bg-background/90 sm:pt-4">
          <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex flex-col gap-0.5">
              {form.formState.errors.qty && (
                <p className="text-xs text-red-600">{form.formState.errors.qty.message}</p>
              )}
              <span
                className={`text-xl font-bold text-brand-text transition-transform duration-300 sm:text-2xl ${
                  priceAnimating ? "scale-110" : "scale-100"
                }`}
              >
                ${(liveTotal / 100).toFixed(2)}
              </span>
              {liveTotal !== product.basePriceCents && (
                <span className="text-sm text-muted-foreground line-through">
                  ${(product.basePriceCents / 100).toFixed(2)} base
                </span>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3 sm:flex-initial sm:flex-nowrap">
              <div className="flex gap-1 rounded-lg border border-input bg-muted/30 px-1 py-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => {
                    const cur = form.getValues("qty");
                    if (cur > 1) form.setValue("qty", cur - 1);
                  }}
                >
                  −
                </Button>
                <Input
                  id="qty"
                  type="number"
                  min={1}
                  max={maxQty}
                  form="product-form"
                  className="h-7 w-10 border-0 bg-transparent p-0 text-center text-sm focus-visible:ring-0"
                  {...form.register("qty")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => {
                    const cur = form.getValues("qty");
                    if (cur < maxQty) form.setValue("qty", cur + 1);
                  }}
                >
                  +
                </Button>
              </div>
              <Button
                type="submit"
                form="product-form"
                className="min-h-12 w-full shrink-0 rounded-full bg-button px-6 text-stone-50 hover:bg-button-hover active:scale-[0.98] sm:w-auto sm:px-8 whitespace-nowrap"
              >
                {isEditMode ? "Update Cake Purchase" : "Purchase Cake"}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

    <AlertDialog open={showShapeModal} onOpenChange={setShowShapeModal}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Choose a cake shape</AlertDialogTitle>
          <AlertDialogDescription>
            Please select a shape for your cake before adding it to the cart. We&apos;ll take you there now.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setShowShapeModal(false);
              shapeSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          >
            Show me
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={showExtrasPromptModal} onOpenChange={setShowExtrasPromptModal}>
      <AlertDialogContent
        className="rounded-2xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Add extras to your cake?</AlertDialogTitle>
          <AlertDialogDescription>
            Would you like to add Birthday Extras or Make it Extra Tipsy? Or continue without.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <AlertDialogAction
            className="rounded-full"
            onClick={() => {
              setShowExtrasPromptModal(false);
              const values = form.getValues();
              void doActualSubmit(values);
            }}
          >
            No thanks, continue
          </AlertDialogAction>
          {product && (
            <>
              {product.modifierGroups
                .filter((g) => {
                  if (g.required) return false;
                  const isBirthday = g.name === "Birthday Extras";
                  const isExtraTipsy = g.name.toLowerCase() === "make it extra tipsy";
                  if (!isBirthday && !isExtraTipsy) return false;
                  const groupId = g._id as string;
                  const selected = (selectedOptionsByGroup[groupId] ?? []).length > 0;
                  return !selected;
                })
                .map((group) => {
                  const opt = group.options[0];
                  const price = opt ? `+$${(opt.priceDeltaCents / 100).toFixed(2)}` : "";
                  const handleSelect = () => {
                    if (opt) {
                      toggleOption(group._id as string, opt._id as string, group.maxSelect, true);
                    }
                    setShowExtrasPromptModal(false);
                    setTimeout(() => {
                      extrasSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }, 150);
                  };
                  return (
                    <button
                      key={group._id}
                      type="button"
                      className="inline-flex h-9 min-h-[2.75rem] touch-manipulation items-center justify-center gap-2 rounded-full border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground active:scale-[0.98]"
                      onClick={handleSelect}
                    >
                      {group.name} {price}
                    </button>
                  );
                })}
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  );
}
