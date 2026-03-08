"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { productDisplayName } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ImagePicker } from "@/components/ImagePicker";
import { ProductImage } from "@/components/ProductImage";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  ImagePlus,
  Loader2,
  Plus,
} from "lucide-react";

const SHAPES = [
  { key: "mixed" as const, label: "Mixed" },
  { key: "even20" as const, label: "Even 20" },
  { key: "rose" as const, label: "Rose" },
  { key: "blossom" as const, label: "Blossom" },
];

type ShapeKey = "mixed" | "even20" | "rose" | "blossom";

type PickerTarget =
  | { type: "main"; productId: Id<"products">; slot?: number }
  | { type: "shape"; productId: Id<"products">; shape: ShapeKey; slot?: number };

// ── Sortable filled image slot ────────────────────────────────────────────────

function SortableImageItem({
  id,
  src,
  alt,
  onChoose,
  compact,
}: {
  id: string;
  src: string;
  alt: string;
  onChoose: () => void;
  compact?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative shrink-0 touch-none select-none ${compact ? "w-16" : "w-24"} ${isDragging ? "z-50 opacity-40" : ""}`}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="flex cursor-grab items-center justify-center rounded-t-md border-x border-t border-border/60 bg-muted/30 py-0.5 active:cursor-grabbing"
        title="Drag to reorder"
      >
        <GripVertical className="h-3 w-3 text-muted-foreground/60" />
      </div>

      {/* Image */}
      <div className="relative aspect-square overflow-hidden rounded-b-md border-x border-b border-border/60 bg-muted/30">
        <ProductImage
          images={[src]}
          name={alt}
          className="h-full w-full object-contain"
        />
        <Button
          size="icon"
          variant="secondary"
          className="absolute right-1 top-1 h-5 w-5 opacity-0 transition-opacity group-hover:opacity-90"
          onClick={(e) => {
            e.stopPropagation();
            onChoose();
          }}
          title="Replace image"
        >
          <ImagePlus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ── Empty add slot ────────────────────────────────────────────────────────────

function AddSlot({
  onChoose,
  loading,
  compact,
}: {
  onChoose: () => void;
  loading?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`shrink-0 ${compact ? "w-16" : "w-24"}`}>
      <div className="aspect-square overflow-hidden rounded-lg border border-dashed border-border/50 bg-muted/20">
        <button
          type="button"
          className="flex h-full w-full items-center justify-center text-muted-foreground hover:bg-muted/40"
          onClick={onChoose}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Plus className="h-5 w-5" />
          )}
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BulkProductImagesPage() {
  const products = useQuery(api.admin.catalog.listProducts);
  const updateProduct = useMutation(api.admin.catalog.updateProduct);

  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [savingId, setSavingId] = useState<Id<"products"> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<Id<"products"> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function flash(msg: string) {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }

  async function saveImages(productId: Id<"products">, images: string[]) {
    setSavingId(productId);
    try {
      await updateProduct({ productId, images });
    } finally {
      setSavingId(null);
    }
  }

  async function saveShapeImages(
    productId: Id<"products">,
    existingShapeImages: Record<string, string[] | undefined> | undefined,
    shape: ShapeKey,
    images: string[]
  ) {
    setSavingId(productId);
    try {
      await updateProduct({
        productId,
        shapeImages: {
          ...(existingShapeImages ?? {}),
          [shape]: images.length > 0 ? images : undefined,
        },
      });
    } finally {
      setSavingId(null);
    }
  }

  async function handlePickerSelect(storageIds: string[]) {
    if (!pickerTarget || !products) return;
    const product = products.find((p) => p._id === pickerTarget.productId);
    if (!product) return;

    setSavingId(pickerTarget.productId);
    try {
      if (pickerTarget.type === "main") {
        const existing = product.images ?? [];
        let images: string[];
        if (pickerTarget.slot !== undefined) {
          const next = [
            existing[0] ?? "",
            existing[1] ?? "",
            existing[2] ?? "",
            existing[3] ?? "",
          ];
          next[pickerTarget.slot] = storageIds[0] ?? "";
          images = next.filter((s) => s.length > 0);
        } else {
          images = storageIds.slice(0, 4);
        }
        await updateProduct({ productId: pickerTarget.productId, images });
        flash(`Main images updated for ${product.name}`);
      } else {
        const shape = pickerTarget.shape;
        const existing = product.shapeImages?.[shape] ?? [];
        let next: string[];
        if (pickerTarget.slot !== undefined) {
          next = [...existing];
          next[pickerTarget.slot] = storageIds[0] ?? "";
          next = next.filter(Boolean);
        } else {
          next = storageIds.slice(0, 3);
        }
        await updateProduct({
          productId: pickerTarget.productId,
          shapeImages: {
            ...(product.shapeImages ?? {}),
            [shape]: next.length > 0 ? next : undefined,
          },
        });
        flash(`Shape images updated for ${product.name}`);
      }
    } catch (err) {
      flash(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingId(null);
      setPickerTarget(null);
    }
  }

  function handleMainDragEnd(event: DragEndEvent, productId: Id<"products">, images: string[]) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = images.indexOf(active.id as string);
    const newIdx = images.indexOf(over.id as string);
    if (oldIdx === -1 || newIdx === -1) return;
    void saveImages(productId, arrayMove(images, oldIdx, newIdx));
    flash("Order saved");
  }

  function handleShapeDragEnd(
    event: DragEndEvent,
    productId: Id<"products">,
    existingShapeImages: Record<string, string[] | undefined> | undefined,
    shape: ShapeKey,
    images: string[]
  ) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = images.indexOf(active.id as string);
    const newIdx = images.indexOf(over.id as string);
    if (oldIdx === -1 || newIdx === -1) return;
    void saveShapeImages(productId, existingShapeImages, shape, arrayMove(images, oldIdx, newIdx));
    flash("Order saved");
  }

  const productCount = products?.length ?? 0;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <Link href="/admin/products" className="text-muted-foreground hover:text-foreground">
            ← Products
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Bulk Image Editor</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Click a slot to assign from the gallery. Drag the{" "}
          <GripVertical className="inline h-3 w-3" /> handle to reorder.
        </p>
        {message && (
          <Badge variant="secondary" className="w-fit">{message}</Badge>
        )}
      </header>

      {!products ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading products…</p>
      ) : productCount === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No products found.</p>
      ) : (
        <div className="space-y-4">
          {products.map((product) => {
            const isExpanded = expandedId === product._id || productCount <= 5;
            const saving = savingId === product._id;
            const mainImages = (product.images ?? []).filter(Boolean);
            const shapeImages = product.shapeImages ?? {};

            return (
              <Card key={product._id} className="overflow-hidden">
                <CardHeader
                  className="cursor-pointer py-4"
                  onClick={() =>
                    setExpandedId((prev) =>
                      prev === product._id ? null : product._id
                    )
                  }
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {productCount > 5 ? (
                        isExpanded ? (
                          <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                        )
                      ) : null}
                      <CardTitle className="truncate text-lg">{productDisplayName(product.name)}</CardTitle>
                      {saving && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                    </div>
                    {/* Mini preview strip */}
                    <div className="flex shrink-0 gap-2">
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="h-10 w-10 overflow-hidden rounded border bg-muted/30"
                        >
                          {mainImages[i] ? (
                            <ProductImage
                              images={[mainImages[i]!]}
                              name={product.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                              <Plus className="h-4 w-4" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="space-y-6 border-t pt-4">
                    {/* ── Main images ── */}
                    <div>
                      <p className="mb-2 text-sm font-medium text-muted-foreground">
                        Main images — drag to reorder
                      </p>
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(e) =>
                          handleMainDragEnd(e, product._id, mainImages)
                        }
                      >
                        <SortableContext
                          items={mainImages}
                          strategy={horizontalListSortingStrategy}
                        >
                          <div className="flex flex-wrap gap-2">
                            {mainImages.map((src, i) => (
                              <SortableImageItem
                                key={src}
                                id={src}
                                src={src}
                                alt={`${product.name} main ${i + 1}`}
                                onChoose={() =>
                                  setPickerTarget({
                                    type: "main",
                                    productId: product._id,
                                    slot: mainImages.indexOf(src),
                                  })
                                }
                              />
                            ))}
                            {mainImages.length < 4 && (
                              <AddSlot
                                onChoose={() =>
                                  setPickerTarget({
                                    type: "main",
                                    productId: product._id,
                                    slot: mainImages.length,
                                  })
                                }
                                loading={saving}
                              />
                            )}
                            {mainImages.length === 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="self-center"
                                onClick={() =>
                                  setPickerTarget({
                                    type: "main",
                                    productId: product._id,
                                  })
                                }
                                disabled={saving}
                              >
                                Set all 4
                              </Button>
                            )}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </div>

                    {/* ── Shape images ── */}
                    <div>
                      <p className="mb-2 text-sm font-medium text-muted-foreground">
                        Shape images — drag to reorder within each shape
                      </p>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {SHAPES.map(({ key, label }) => {
                          const imgs = (shapeImages[key] ?? []).filter(Boolean);
                          return (
                            <div key={key} className="rounded-lg border p-3">
                              <p className="mb-2 text-xs font-semibold">{label}</p>
                              <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={(e) =>
                                  handleShapeDragEnd(
                                    e,
                                    product._id,
                                    product.shapeImages,
                                    key,
                                    imgs
                                  )
                                }
                              >
                                <SortableContext
                                  items={imgs}
                                  strategy={horizontalListSortingStrategy}
                                >
                                  <div className="flex flex-wrap gap-1.5">
                                    {imgs.map((src, i) => (
                                      <SortableImageItem
                                        key={src}
                                        id={src}
                                        src={src}
                                        alt={`${product.name} ${label} ${i + 1}`}
                                        onChoose={() =>
                                          setPickerTarget({
                                            type: "shape",
                                            productId: product._id,
                                            shape: key,
                                            slot: imgs.indexOf(src),
                                          })
                                        }
                                        compact
                                      />
                                    ))}
                                    {imgs.length < 3 && (
                                      <AddSlot
                                        onChoose={() =>
                                          setPickerTarget({
                                            type: "shape",
                                            productId: product._id,
                                            shape: key,
                                            slot: imgs.length,
                                          })
                                        }
                                        loading={saving}
                                        compact
                                      />
                                    )}
                                  </div>
                                </SortableContext>
                              </DndContext>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="mt-2 h-7 w-full text-xs"
                                onClick={() =>
                                  setPickerTarget({
                                    type: "shape",
                                    productId: product._id,
                                    shape: key,
                                  })
                                }
                                disabled={saving}
                              >
                                Set 3 images
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <ImagePicker
        open={pickerTarget !== null}
        onOpenChange={(open) => !open && setPickerTarget(null)}
        onSelect={handlePickerSelect}
        multiSelect={
          !pickerTarget ||
          (pickerTarget.type === "main" && pickerTarget.slot === undefined) ||
          (pickerTarget.type === "shape" && pickerTarget.slot === undefined)
        }
      />
    </main>
  );
}
