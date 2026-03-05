"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";

import { api } from "../../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProductImage } from "@/components/ProductImage";

const customizationSchema = z.object({
  variantId: z.string().optional(),
  qty: z.coerce.number().int().positive(),
  note: z.string().max(200).optional(),
});

type GroupErrorMap = Record<string, string>;
type SelectedOptionsByGroup = Record<string, string[]>;

function getOrCreateGuestSessionId() {
  if (typeof window === "undefined") return "";
  const key = "tipsycake_guest_session_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = `guest_${crypto.randomUUID()}`;
  window.localStorage.setItem(key, created);
  return created;
}

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

export default function ProductDetailPage() {
  const params = useParams<{ productId: string }>();
  const router = useRouter();
  const productId = params.productId;

  const guestSessionId = useMemo(() => getOrCreateGuestSessionId(), []);
  const product = useQuery(api.catalog.getProduct, {
    productId: productId as never,
  });
  const addItem = useMutation(api.cart.addItem);

  const [selectedOptionsByGroup, setSelectedOptionsByGroup] = useState<SelectedOptionsByGroup>(
    {}
  );
  const [groupErrors, setGroupErrors] = useState<GroupErrorMap>({});
  const [addError, setAddError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof customizationSchema>>({
    resolver: zodResolver(customizationSchema),
    defaultValues: {
      variantId: "",
      qty: 1,
      note: "",
    },
  });

  const maxQty = useMemo(() => {
    if (!product) return 99;
    return product.maxQtyPerOrder ?? 99;
  }, [product]);

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
    setAddError(null);
    if (Object.keys(modifierValidation).length > 0) return;

    const modifiersPayload = Object.entries(selectedOptionsByGroup).flatMap(
      ([groupId, optionIds]) =>
        optionIds.map((optionId) => ({ groupId: groupId as never, optionId: optionId as never }))
    );

    try {
      await addItem({
        guestSessionId: guestSessionId || undefined,
        productId: product._id,
        variantId: values.variantId ? (values.variantId as never) : undefined,
        qty: values.qty,
        itemNote: values.note || undefined,
        modifiers: modifiersPayload,
      });
      router.push("/cart");
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add to cart");
    }
  }

  if (!product) {
    return (
      <main className="mx-auto w-full max-w-4xl p-6">
        <p className="text-sm text-muted-foreground">Loading product...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <header className="space-y-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/products">&larr; Back to menu</Link>
        </Button>
        <div className="overflow-hidden rounded-lg">
          <ProductImage
            images={product.images}
            name={product.name}
            className="h-64 w-full object-cover sm:h-80"
          />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
          <p className="text-muted-foreground">{product.description}</p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-2xl font-bold">${(product.basePriceCents / 100).toFixed(2)}</span>
            {product.inStockToday ? (
              <Badge className="bg-emerald-600 text-white">In stock today</Badge>
            ) : (
              <Badge variant="outline">Made to order</Badge>
            )}
          </div>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Customize</CardTitle>
          <CardDescription>
            Select variant/modifiers. Validation enforces required and min/max rules.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="space-y-2">
              <Label htmlFor="variantId">Variant</Label>
              <select
                id="variantId"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                {...form.register("variantId")}
              >
                <option value="">No variant</option>
                {product.variants.map((variant) => (
                  <option key={variant._id} value={variant._id}>
                    {variant.label} ({variant.priceDeltaCents >= 0 ? "+" : ""}
                    {variant.priceDeltaCents} cents)
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="qty">Quantity</Label>
              <Input id="qty" type="number" min={1} max={maxQty} {...form.register("qty")} />
              {form.formState.errors.qty ? (
                <p className="text-xs text-red-600">{form.formState.errors.qty.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Maximum allowed: {maxQty}</p>
              )}
            </div>

            {product.modifierGroups.map((group) => {
              const selected = selectedOptionsByGroup[group._id as string] ?? [];
              const singleSelect = group.maxSelect === 1;

              return (
                <div key={group._id} className="space-y-2 rounded-md border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{group.name}</p>
                    <Badge variant="outline">
                      {group.required ? "Required" : "Optional"} • {group.minSelect}-{group.maxSelect}
                    </Badge>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.options.map((option) => {
                      const isChecked = selected.includes(option._id as string);
                      return (
                        <label key={option._id} className="flex items-center gap-2 rounded border p-2 text-sm">
                          <input
                            type={singleSelect ? "radio" : "checkbox"}
                            checked={isChecked}
                            name={singleSelect ? `group-${group._id}` : undefined}
                            onChange={() =>
                              toggleOption(
                                group._id as string,
                                option._id as string,
                                group.maxSelect,
                                singleSelect
                              )
                            }
                          />
                          <span className="flex-1">{option.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {option.priceDeltaCents >= 0 ? "+" : ""}
                            {option.priceDeltaCents}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {groupErrors[group._id as string] ? (
                    <p className="text-xs text-red-600">{groupErrors[group._id as string]}</p>
                  ) : null}
                </div>
              );
            })}

            <div className="space-y-2">
              <Label htmlFor="note">Item note</Label>
              <Textarea
                id="note"
                placeholder="Optional message for this item..."
                {...form.register("note")}
              />
            </div>

            {addError ? (
              <p className="text-sm text-red-600">{addError}</p>
            ) : null}
            <Button type="submit">Add to Cart</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
