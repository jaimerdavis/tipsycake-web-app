"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { api } from "../../../../convex/_generated/api";
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
import { ProductImage } from "@/components/ProductImage";

const productSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
  description: z.string().min(2),
  imagesCsv: z.string().optional(),
  categoriesCsv: z.string().optional(),
  tagsCsv: z.string().optional(),
  basePriceCents: z.coerce.number().int().nonnegative(),
  leadTimeHoursOverride: z.coerce.number().int().nonnegative().optional(),
  maxQtyPerOrder: z.coerce.number().int().positive().optional(),
  inStockToday: z.boolean().default(true),
  status: z.enum(["active", "hidden"]),
  pickup: z.boolean().default(true),
  delivery: z.boolean().default(true),
  shipping: z.boolean().default(false),
});

const variantSchema = z.object({
  productId: z.string().min(1),
  label: z.string().min(1),
  priceDeltaCents: z.coerce.number().int(),
  sku: z.string().optional(),
});

const modifierGroupSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1),
  required: z.boolean().default(false),
  minSelect: z.coerce.number().int().nonnegative(),
  maxSelect: z.coerce.number().int().positive(),
  sortOrder: z.coerce.number().int().nonnegative(),
});

const modifierOptionSchema = z.object({
  groupId: z.string().min(1),
  name: z.string().min(1),
  priceDeltaCents: z.coerce.number().int(),
  sortOrder: z.coerce.number().int().nonnegative(),
});

function parseCsv(input?: string) {
  if (!input) return [];
  return input
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export default function AdminProductsPage() {
  const products = useQuery(api.admin.catalog.listProducts);

  const createProduct = useMutation(api.admin.catalog.createProduct);
  const updateProduct = useMutation(api.admin.catalog.updateProduct);
  const deleteProduct = useMutation(api.admin.catalog.deleteProduct);
  const createVariant = useMutation(api.admin.catalog.createVariant);
  const createModifierGroup = useMutation(api.admin.catalog.createModifierGroup);
  const createModifierOption = useMutation(api.admin.catalog.createModifierOption);

  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [uploadedImageIds, setUploadedImageIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const sortedProducts = useMemo(() => {
    if (!products) return [];
    return [...products].sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  const productForm = useForm<z.infer<typeof productSchema>>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      imagesCsv: "",
      categoriesCsv: "",
      tagsCsv: "",
      basePriceCents: 0,
      leadTimeHoursOverride: 0,
      maxQtyPerOrder: 1,
      inStockToday: true,
      status: "active",
      pickup: true,
      delivery: true,
      shipping: false,
    },
  });

  const variantForm = useForm<z.infer<typeof variantSchema>>({
    resolver: zodResolver(variantSchema),
    defaultValues: {
      productId: "",
      label: "",
      priceDeltaCents: 0,
      sku: "",
    },
  });

  const groupForm = useForm<z.infer<typeof modifierGroupSchema>>({
    resolver: zodResolver(modifierGroupSchema),
    defaultValues: {
      productId: "",
      name: "",
      required: false,
      minSelect: 0,
      maxSelect: 1,
      sortOrder: 0,
    },
  });

  const optionForm = useForm<z.infer<typeof modifierOptionSchema>>({
    resolver: zodResolver(modifierOptionSchema),
    defaultValues: {
      groupId: "",
      name: "",
      priceDeltaCents: 0,
      sortOrder: 0,
    },
  });

  async function onCreateProduct(values: z.infer<typeof productSchema>) {
    try {
      const manualImages = parseCsv(values.imagesCsv);
      await createProduct({
        name: values.name,
        slug: values.slug,
        description: values.description,
        images: [...uploadedImageIds, ...manualImages],
        status: values.status,
        categories: parseCsv(values.categoriesCsv),
        tags: parseCsv(values.tagsCsv),
        basePriceCents: values.basePriceCents,
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

  async function onCreateVariant(values: z.infer<typeof variantSchema>) {
    try {
      await createVariant({
        productId: values.productId as never,
        label: values.label,
        priceDeltaCents: values.priceDeltaCents,
        sku: values.sku || undefined,
      });
      setStatusMessage("Variant created.");
      variantForm.reset({ ...values, label: "", priceDeltaCents: 0, sku: "" });
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Variant create failed.");
    }
  }

  async function onCreateGroup(values: z.infer<typeof modifierGroupSchema>) {
    if (values.maxSelect < values.minSelect) {
      setStatusMessage("maxSelect must be >= minSelect.");
      return;
    }
    try {
      const groupId = await createModifierGroup({
        productId: values.productId as never,
        name: values.name,
        required: values.required,
        minSelect: values.minSelect,
        maxSelect: values.maxSelect,
        sortOrder: values.sortOrder,
      });
      setSelectedGroupId(groupId);
      setStatusMessage("Modifier group created.");
      groupForm.reset({ ...values, name: "", minSelect: 0, maxSelect: 1, sortOrder: 0 });
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Group create failed.");
    }
  }

  async function onCreateOption(values: z.infer<typeof modifierOptionSchema>) {
    try {
      await createModifierOption({
        groupId: values.groupId as never,
        name: values.name,
        priceDeltaCents: values.priceDeltaCents,
        sortOrder: values.sortOrder,
      });
      setStatusMessage("Modifier option created.");
      optionForm.reset({ ...values, name: "", priceDeltaCents: 0, sortOrder: 0 });
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Option create failed.");
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6">
      <header className="space-y-2">
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

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create Product</CardTitle>
            <CardDescription>CAT-001, CAT-004, CAT-005, CAT-006</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={productForm.handleSubmit(onCreateProduct)}>
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" {...productForm.register("name")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <Input id="slug" {...productForm.register("slug")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" {...productForm.register("description")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="basePriceCents">Base price (cents)</Label>
                  <Input id="basePriceCents" type="number" {...productForm.register("basePriceCents")} />
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
                  {uploading && <span className="text-xs text-muted-foreground">Uploading…</span>}
                </div>
                {uploadedImageIds.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {uploadedImageIds.map((id, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {id.slice(0, 12)}…
                        <button
                          type="button"
                          className="ml-1 text-destructive"
                          onClick={() => setUploadedImageIds((prev) => prev.filter((_, j) => j !== i))}
                        >
                          ×
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
              <div className="grid grid-cols-2 gap-3">
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

        <Card>
          <CardHeader>
            <CardTitle>Products</CardTitle>
            <CardDescription>Quick status controls</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sortedProducts.map((product) => (
              <div key={product._id} className="flex items-center gap-3 rounded-md border p-3">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded">
                  <ProductImage
                    images={product.images}
                    name={product.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate font-medium">{product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {product.slug} • ${(product.basePriceCents / 100).toFixed(2)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={product.status === "active" ? "default" : "outline"}>
                    {product.status}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await updateProduct({
                        productId: product._id,
                        status: product.status === "active" ? "hidden" : "active",
                      });
                    }}
                  >
                    Toggle
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
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Create Variant</CardTitle>
            <CardDescription>CAT-002</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={variantForm.handleSubmit(onCreateVariant)}>
              <div className="space-y-2">
                <Label htmlFor="variantProductId">Product ID</Label>
                <Input
                  id="variantProductId"
                  value={selectedProductId}
                  onChange={(event) => {
                    setSelectedProductId(event.target.value);
                    variantForm.setValue("productId", event.target.value);
                    groupForm.setValue("productId", event.target.value);
                  }}
                  placeholder="Copy from product list"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="variantLabel">Label</Label>
                <Input id="variantLabel" {...variantForm.register("label")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="variantDelta">Price delta (cents)</Label>
                <Input id="variantDelta" type="number" {...variantForm.register("priceDeltaCents")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="variantSku">SKU</Label>
                <Input id="variantSku" {...variantForm.register("sku")} />
              </div>
              <Button type="submit">Create variant</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create Modifier Group</CardTitle>
            <CardDescription>CAT-003</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={groupForm.handleSubmit(onCreateGroup)}>
              <div className="space-y-2">
                <Label htmlFor="groupProductId">Product ID</Label>
                <Input
                  id="groupProductId"
                  value={selectedProductId}
                  onChange={(event) => {
                    setSelectedProductId(event.target.value);
                    groupForm.setValue("productId", event.target.value);
                    variantForm.setValue("productId", event.target.value);
                  }}
                  placeholder="Copy from product list"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="groupName">Group name</Label>
                <Input id="groupName" {...groupForm.register("name")} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="minSelect">Min</Label>
                  <Input id="minSelect" type="number" {...groupForm.register("minSelect")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxSelect">Max</Label>
                  <Input id="maxSelect" type="number" {...groupForm.register("maxSelect")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sortOrder">Sort</Label>
                  <Input id="sortOrder" type="number" {...groupForm.register("sortOrder")} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...groupForm.register("required")} />
                Required
              </label>
              <Button type="submit">Create group</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create Modifier Option</CardTitle>
            <CardDescription>CAT-003</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={optionForm.handleSubmit(onCreateOption)}>
              <div className="space-y-2">
                <Label htmlFor="groupId">Group ID</Label>
                <Input
                  id="groupId"
                  value={selectedGroupId}
                  onChange={(event) => {
                    setSelectedGroupId(event.target.value);
                    optionForm.setValue("groupId", event.target.value);
                  }}
                  placeholder="Created group id appears in response"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="optionName">Option name</Label>
                <Input id="optionName" {...optionForm.register("name")} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="optionDelta">Price delta</Label>
                  <Input id="optionDelta" type="number" {...optionForm.register("priceDeltaCents")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="optionSortOrder">Sort order</Label>
                  <Input id="optionSortOrder" type="number" {...optionForm.register("sortOrder")} />
                </div>
              </div>
              <Button type="submit">Create option</Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
