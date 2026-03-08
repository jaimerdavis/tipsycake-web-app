"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Info } from "lucide-react";
import { getOrCreateGuestSessionId } from "@/lib/guestSession";
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

  const guestSessionId = useMemo(() => getOrCreateGuestSessionId(), []);
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

  useEffect(() => {
    if (!product || isEditMode) return;
    const shapeGroup = product.modifierGroups.find((g) => g.name === "Shape");
    if (!shapeGroup?.required || shapeGroup.options.length === 0) return;
    const current = selectedOptionsByGroup[shapeGroup._id as string] ?? [];
    if (current.length > 0) return;
    const firstOpt = shapeGroup.options[0];
    if (!firstOpt) return;
    setSelectedOptionsByGroup((prev) => ({
      ...prev,
      [shapeGroup._id as string]: [firstOpt._id as string],
    }));
  }, [product, isEditMode]);

  const maxQty = useMemo(() => {
    if (!product) return 10;
    return product.maxQtyPerOrder ?? 10;
  }, [product]);

  const shapeGroup = useMemo(
    () => product?.modifierGroups.find((g) => g.name === "Shape"),
    [product]
  );

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
    if (Object.keys(modifierValidation).length > 0) return;

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
        await addItem({
          guestSessionId: guestSessionId || undefined,
          productId: product._id,
          variantId: values.variantId ? (values.variantId as never) : undefined,
          qty: values.qty,
          itemNote: values.note || undefined,
          modifiers: modifiersPayload,
        });
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
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 pb-24 sm:gap-6 sm:px-6">
      <header className="animate-fade-in-up space-y-4">
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link href={isEditMode ? "/cart" : "/products"}>
            &larr; {isEditMode ? "Back to cart" : "Back to menu"}
          </Link>
        </Button>
        <div className="space-y-3">
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
          {shapeSelectorBlock}
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-5xl text-brand-text">{productDisplayName(product.name)}</h1>
            {isEditMode && <Badge variant="secondary" className="rounded-full">Editing</Badge>}
          </div>
          <p className="text-muted-foreground">{product.description}</p>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`text-2xl font-bold text-brand-text transition-all duration-300 ${
                priceAnimating ? "scale-110" : "scale-100"
              }`}
            >
              ${(liveTotal / 100).toFixed(2)}
            </span>
            {liveTotal !== product.basePriceCents && (
              <span className="text-sm text-muted-foreground line-through animate-fade-in">
                ${(product.basePriceCents / 100).toFixed(2)}
              </span>
            )}
          </div>
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
          <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
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

            <div className="space-y-2">
              <Label htmlFor="qty" className="font-display text-xl text-brand-text">How many?</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 rounded-xl bg-button text-stone-50 hover:bg-button-hover transition-all active:scale-95"
                  onClick={() => {
                    const cur = form.getValues("qty");
                    if (cur > 1) form.setValue("qty", cur - 1);
                  }}
                >-</Button>
                <Input
                  id="qty"
                  type="number"
                  min={1}
                  max={maxQty}
                  className="w-16 rounded-xl text-center"
                  {...form.register("qty")}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 rounded-xl bg-button text-stone-50 hover:bg-button-hover transition-all active:scale-95"
                  onClick={() => {
                    const cur = form.getValues("qty");
                    if (cur < maxQty) form.setValue("qty", cur + 1);
                  }}
                >+</Button>
              </div>
              {form.formState.errors.qty ? (
                <p className="text-xs text-red-600">{form.formState.errors.qty.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Maximum allowed: {maxQty}</p>
              )}
            </div>

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
                  <div key={group._id} className="space-y-2 rounded-xl border p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <p className="font-display text-xl text-brand-text">{group.name}</p>
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
                    <div className="space-y-2 rounded-xl border p-4">
                      <p className="font-display text-xl text-brand-text">Extras</p>
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

            <div className="flex items-center gap-3">
              <Button type="submit" className="rounded-full bg-button text-stone-50 hover:bg-button-hover transition-all duration-200 active:scale-[0.97]">
                {isEditMode ? "Update Cake Purchase" : "Purchase Cake"}
              </Button>
              {isEditMode && (
                <Button type="button" variant="outline" className="rounded-full" asChild>
                  <Link href="/cart">Cancel</Link>
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
