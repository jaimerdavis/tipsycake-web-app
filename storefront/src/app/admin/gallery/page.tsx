"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";

function GalleryThumbnail({
  id,
  storageId,
  filename,
  selected,
  onSelect,
  onDelete,
  deleting,
}: {
  id: Id<"mediaLibrary">;
  storageId: string;
  filename: string;
  selected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const url = useQuery(api.storage.getUrl, { storageId });

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(e as unknown as React.MouseEvent);
        }
      }}
      className={`group relative w-full cursor-pointer overflow-hidden rounded-lg border-2 bg-muted/30 p-0 text-left transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
        selected
          ? "border-rose-500 ring-2 ring-rose-500/30"
          : "border-transparent hover:border-muted-foreground/30"
      }`}
    >
      <div className="aspect-square">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={filename}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
        <p className="truncate text-xs text-white">{filename}</p>
      </div>
      {selected && (
        <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-xs font-bold text-white">
          ✓
        </div>
      )}
      <Button
        size="icon"
        variant="destructive"
        className="absolute right-2 top-2 h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        disabled={deleting}
      >
        {deleting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

export default function AdminGalleryPage() {
  const media = useQuery(api.admin.media.listMedia);
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const bulkRegisterUploads = useMutation(api.admin.media.bulkRegisterUploads);
  const deleteMedia = useMutation(api.admin.media.deleteMedia);
  const deleteMediaBatch = useMutation(api.admin.media.deleteMediaBatch);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastClickedIndexRef = useRef<number | null>(null);
  const shiftKeyRef = useRef(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Shift") shiftKeyRef.current = true;
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "Shift") shiftKeyRef.current = false;
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<Id<"mediaLibrary"> | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<Id<"mediaLibrary">>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  function flash(msg: string) {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }

  async function handleBulkUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const imageFiles = Array.from(files).filter((f) =>
      f.type.startsWith("image/")
    );
    if (imageFiles.length === 0) {
      flash("No image files selected");
      return;
    }

    setUploading(true);
    setUploadProgress(`Uploading ${imageFiles.length} image(s)...`);

    try {
      const uploads: Array<{
        storageId: string;
        filename: string;
        contentType: string;
        size: number;
      }> = [];

      for (const file of imageFiles) {
        const url = await generateUploadUrl();
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Upload failed: ${res.status}`);
        }

        const json = (await res.json()) as { storageId: string };
        uploads.push({
          storageId: json.storageId,
          filename: file.name,
          contentType: file.type,
          size: file.size,
        });
      }

      await bulkRegisterUploads({ uploads });
      flash(`Added ${uploads.length} image(s) to gallery`);
    } catch (err) {
      flash(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleThumbnailClick(index: number, id: Id<"mediaLibrary">, e: React.MouseEvent) {
    const isShift = e.shiftKey || shiftKeyRef.current;
    const isCtrl = e.ctrlKey || e.metaKey;
    const anchor = lastClickedIndexRef.current;
    const orderedIds = media?.map((m) => m._id) ?? [];

    lastClickedIndexRef.current = index;

    setSelectedIds((prev) => {
      const next = new Set(prev);

      if (isShift && anchor !== null) {
        const start = Math.min(anchor, index);
        const end = Math.max(anchor, index);
        for (let i = start; i <= end; i++) {
          const itemId = orderedIds[i];
          if (itemId) next.add(itemId);
        }
        return next;
      }

      if (isCtrl) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }

      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete(id: Id<"mediaLibrary">) {
    setDeletingId(id);
    try {
      await deleteMedia({ id });
      setSelectedIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
      flash("Image removed");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleBatchDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setDeleteConfirmOpen(false);
    setBatchDeleting(true);
    try {
      const count = await deleteMediaBatch({ ids });
      setSelectedIds(new Set());
      flash(`Removed ${count} image(s)`);
    } catch (err) {
      flash(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBatchDeleting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Image Gallery</h1>
        <p className="text-sm text-muted-foreground">
          Bulk upload images and attach them to products from the product edit
          sheet.
        </p>
        {message && (
          <Badge variant="secondary" className="w-fit">
            {message}
          </Badge>
        )}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Upload Images</CardTitle>
          <CardDescription>
            Select multiple images to add them to the gallery. Supported:
            JPEG, PNG, WebP, GIF.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleBulkUpload}
              className="hidden"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {uploadProgress ?? "Uploading..."}
                </>
              ) : (
                <>
                  <ImagePlus className="mr-2 h-4 w-4" />
                  Choose images (bulk)
                </>
              )}
            </Button>
            {uploading && uploadProgress && (
              <span className="text-sm text-muted-foreground">
                {uploadProgress}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Gallery</CardTitle>
              <CardDescription>
                {media ? `${media.length} image(s)` : "Loading..."}
                {media && media.length > 0 && " — Hold Ctrl or Shift to multi-select."}
              </CardDescription>
            </div>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedIds(new Set())}
                  disabled={batchDeleting}
                >
                  Clear selection
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={batchDeleting}
                >
                  {batchDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>Delete selected ({selectedIds.size})</>
                  )}
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {media && media.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No images yet. Upload some above.
            </p>
          ) : (
            <div className="grid select-none grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {media?.map((item, index) => (
                <GalleryThumbnail
                  key={item._id}
                  id={item._id}
                  storageId={item.storageId}
                  filename={item.filename}
                  selected={selectedIds.has(item._id)}
                  onSelect={(e) => handleThumbnailClick(index, item._id, e)}
                  onDelete={() => handleDelete(item._id)}
                  deleting={deletingId === item._id}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected images?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {selectedIds.size} image(s) from the gallery. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleBatchDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
