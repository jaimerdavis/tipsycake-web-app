"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ImagePlus, Loader2 } from "lucide-react";

interface ImagePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (storageIds: string[]) => void;
  multiSelect?: boolean;
}

function PickerThumbnail({
  storageId,
  filename,
  selected,
  onSelect,
}: {
  storageId: string;
  filename: string;
  selected: boolean;
  onSelect: (e: React.MouseEvent) => void;
}) {
  const url = useQuery(api.storage.getUrl, { storageId });

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative overflow-hidden rounded-lg border-2 transition-all ${
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
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      {selected && (
        <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-xs font-bold text-white">
          ✓
        </div>
      )}
    </button>
  );
}

export function ImagePicker({
  open,
  onOpenChange,
  onSelect,
  multiSelect = true,
}: ImagePickerProps) {
  const media = useQuery(api.admin.media.listMedia);
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const bulkRegisterUploads = useMutation(api.admin.media.bulkRegisterUploads);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const lastClickedIndexRef = useRef<number | null>(null);
  const shiftKeyRef = useRef(false);

  useEffect(() => {
    function onKeyDown(ev: KeyboardEvent) {
      if (ev.key === "Shift") shiftKeyRef.current = true;
    }
    function onKeyUp(ev: KeyboardEvent) {
      if (ev.key === "Shift") shiftKeyRef.current = false;
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setSelectedIds(new Set());
      lastClickedIndexRef.current = null;
    } else {
      shiftKeyRef.current = false;
    }
  }, [open]);

  function handleThumbnailClick(index: number, storageId: string, e: React.MouseEvent) {
    const isShift = e.shiftKey || shiftKeyRef.current;
    const isCtrl = e.ctrlKey || e.metaKey;
    const anchor = lastClickedIndexRef.current;
    const orderedIds = media?.map((m) => m.storageId) ?? [];

    lastClickedIndexRef.current = index;

    setSelectedIds((prev) => {
      const next = new Set(prev);

      if (isShift && anchor !== null) {
        const start = Math.min(anchor, index);
        const end = Math.max(anchor, index);
        for (let i = start; i <= end; i++) {
          const id = orderedIds[i];
          if (id) next.add(id);
        }
        return next;
      }

      if (isCtrl) {
        if (next.has(storageId)) next.delete(storageId);
        else next.add(storageId);
        return next;
      }

      if (!multiSelect) return new Set([storageId]);
      if (next.has(storageId)) next.delete(storageId);
      else next.add(storageId);
      return next;
    });
  }

  function handleConfirm() {
    onSelect(Array.from(selectedIds));
    setSelectedIds(new Set());
    onOpenChange(false);
  }

  function handleCancel() {
    setSelectedIds(new Set());
    onOpenChange(false);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const imageFiles = Array.from(files).filter((f) =>
      f.type.startsWith("image/")
    );
    if (imageFiles.length === 0) return;

    setUploading(true);
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

        if (!res.ok) throw new Error("Upload failed");

        const json = (await res.json()) as { storageId: string };
        uploads.push({
          storageId: json.storageId,
          filename: file.name,
          contentType: file.type,
          size: file.size,
        });
      }

      await bulkRegisterUploads({ uploads });
      if (uploads.length === 1) setSelectedIds(new Set([uploads[0].storageId]));
      else if (multiSelect && uploads.length > 0) {
        setSelectedIds(new Set(uploads.map((u) => u.storageId)));
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col sm:max-w-2xl"
        onPointerDownOutside={(e) => {
          if (selectedIds.size > 0) e.preventDefault();
        }}
      >
        <SheetHeader>
          <SheetTitle>Choose from Gallery</SheetTitle>
          <SheetDescription>
            Click to select. Hold <kbd className="rounded border px-1.5 py-0.5 text-xs font-mono">Ctrl</kbd> or{" "}
            <kbd className="rounded border px-1.5 py-0.5 text-xs font-mono">Shift</kbd> to multi-select.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="mb-4 flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <ImagePlus className="mr-2 h-4 w-4" />
                  Upload new
                </>
              )}
            </Button>
          </div>

          {media && media.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Gallery is empty. Upload images from the Gallery page or above.
            </p>
          ) : (
            <div className="grid select-none grid-cols-3 gap-3 sm:grid-cols-4">
              {media?.map((item, index) => (
                <PickerThumbnail
                  key={item._id}
                  storageId={item.storageId}
                  filename={item.filename}
                  selected={selectedIds.has(item.storageId)}
                  onSelect={(e) => handleThumbnailClick(index, item.storageId, e)}
                />
              ))}
            </div>
          )}
        </div>

        <SheetFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedIds.size === 0}
          >
            Add {selectedIds.size > 0 ? `(${selectedIds.size})` : ""} to product
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
