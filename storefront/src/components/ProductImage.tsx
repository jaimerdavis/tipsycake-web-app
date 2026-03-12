"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

function PlaceholderSvg({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-rose-100 to-amber-50 text-rose-400">
      <svg viewBox="0 0 80 80" className="h-16 w-16" fill="none">
        <circle cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="2" opacity="0.3" />
        <text
          x="40"
          y="46"
          textAnchor="middle"
          fill="currentColor"
          fontSize="22"
          fontWeight="600"
          fontFamily="sans-serif"
        >
          {initials}
        </text>
      </svg>
    </div>
  );
}

function StorageImage({
  storageId,
  alt,
  className,
}: {
  storageId: string;
  alt: string;
  className?: string;
}) {
  const url = useQuery(api.storage.getUrl, { storageId });

  if (!url) {
    return (
      <div className={className}>
        <PlaceholderSvg name={alt} />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className={className} />
  );
}

export function ProductImage({
  images,
  name,
  className = "h-48 w-full object-cover",
}: {
  images: string[];
  name: string;
  className?: string;
}) {
  const firstImage = images[0];

  if (!firstImage) {
    return (
      <div className={className}>
        <PlaceholderSvg name={name} />
      </div>
    );
  }

  if (firstImage.startsWith("http")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={firstImage} alt={name} className={className} />;
  }

  return <StorageImage storageId={firstImage} alt={name} className={className} />;
}

function GalleryImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  if (src.startsWith("http")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} className={className} />
    );
  }
  return <StorageImage storageId={src} alt={alt} className={className} />;
}

const SWIPE_THRESHOLD_PX = 50;

function LightboxOverlay({
  images,
  name,
  index,
  onIndexChange,
  onClose,
}: {
  images: string[];
  name: string;
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const touchStartX = useRef<number | null>(null);
  const hasMultiple = images.length > 1;
  const onPrev = () => onIndexChange(index > 0 ? index - 1 : images.length - 1);
  const onNext = () => onIndexChange(index < images.length - 1 ? index + 1 : 0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = touchStartX.current;
      touchStartX.current = null;
      if (!hasMultiple || start == null) return;
      const end = e.changedTouches[0]?.clientX ?? start;
      const diff = start - end;
      if (Math.abs(diff) >= SWIPE_THRESHOLD_PX) {
        if (diff > 0) onNext();
        else onPrev();
      }
    },
    [hasMultiple, onNext, onPrev]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-full p-2 text-white/90 transition hover:bg-white/20 hover:text-white"
        aria-label="Close"
      >
        <X className="h-6 w-6" />
      </button>

      {hasMultiple && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPrev();
            }}
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white p-2.5 text-rose-700 shadow-md transition hover:bg-rose-50 sm:left-4"
            aria-label="Previous photo"
          >
            <ChevronLeft className="h-7 w-7 sm:h-8 sm:w-8" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white p-2.5 text-rose-700 shadow-md transition hover:bg-rose-50 sm:right-4"
            aria-label="Next photo"
          >
            <ChevronRight className="h-7 w-7 sm:h-8 sm:w-8" />
          </button>
        </>
      )}

      <div
        className="relative flex max-h-[85vh] max-w-[90vw] flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex max-h-[80vh] max-w-full items-center justify-center overflow-hidden rounded-xl bg-white p-4 shadow-xl">
          <GalleryImage
            src={images[index]}
            alt={`${name} – photo ${index + 1}`}
            className="max-h-[75vh] w-auto max-w-full object-contain"
          />
        </div>

        {hasMultiple && (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              {images.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onIndexChange(i);
                  }}
                  aria-label={`Photo ${i + 1}`}
                  className={`rounded-full transition-all duration-200 ${
                    index === i
                      ? "h-2.5 w-6 bg-rose-400"
                      : "h-2 w-2 bg-white/60 hover:bg-white/80"
                  }`}
                />
              ))}
            </div>
            <p className="text-xs text-white/70">Swipe or tap arrows to browse</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function ProductImageGallery({
  images,
  name,
  maxImages = 4,
  className,
}: {
  images: string[];
  name: string;
  maxImages?: number;
  className?: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const displayImages = images.slice(0, maxImages);

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  }, []);

  const closeLightbox = useCallback(() => setLightboxOpen(false), []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
    };
    if (lightboxOpen) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxOpen, closeLightbox]);

  // Reset to first slide whenever the images set changes (e.g. shape switch)
  useEffect(() => {
    requestAnimationFrame(() => {
      setActiveIndex(0);
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ left: 0, behavior: "instant" as ScrollBehavior });
      }
    });
  }, [images]);

  function scrollToIndex(index: number) {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({
      left: index * scrollRef.current.offsetWidth,
      behavior: "smooth",
    });
    setActiveIndex(index);
  }

  function handleScroll() {
    if (!scrollRef.current) return;
    const idx = Math.round(
      scrollRef.current.scrollLeft / scrollRef.current.offsetWidth
    );
    setActiveIndex(idx);
  }

  if (displayImages.length === 0) {
    return (
      <div className={className ?? "flex aspect-[3/2] w-full items-center justify-center rounded-2xl bg-amber-50/40"}>
        <PlaceholderSvg name={name} />
      </div>
    );
  }

  if (displayImages.length === 1) {
    return (
      <div className={className ?? ""}>
        <button
          type="button"
          onClick={() => openLightbox(0)}
          className="aspect-[3/2] w-full overflow-hidden rounded-2xl bg-amber-50/40 p-4 text-left transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="View photo full size"
        >
          <GalleryImage
            src={displayImages[0]}
            alt={name}
            className="h-full w-full object-contain"
          />
        </button>
        {lightboxOpen && (
          <LightboxOverlay
            images={displayImages}
            name={name}
            index={lightboxIndex}
            onIndexChange={setLightboxIndex}
            onClose={closeLightbox}
          />
        )}
      </div>
    );
  }

  return (
    <div className={className ?? ""}>
      {/* ── Mobile carousel — visible only below sm ── */}
      <div className="space-y-2 sm:hidden">
        <div className="relative overflow-hidden rounded-2xl bg-amber-50/40">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {displayImages.map((img, i) => (
              <button
                key={i}
                type="button"
                onClick={() => openLightbox(i)}
                className="aspect-[3/2] w-full flex-shrink-0 snap-start p-3 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
                aria-label={`View photo ${i + 1} full size`}
              >
                <GalleryImage
                  src={img}
                  alt={`${name} – photo ${i + 1}`}
                  className="h-full w-full object-contain"
                />
              </button>
            ))}
          </div>

          {activeIndex > 0 && (
            <button
              type="button"
              onClick={() => scrollToIndex(activeIndex - 1)}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1.5 shadow backdrop-blur-sm transition hover:bg-white"
            >
              <ChevronLeft className="h-4 w-4 text-rose-700" />
            </button>
          )}
          {activeIndex < displayImages.length - 1 && (
            <button
              type="button"
              onClick={() => scrollToIndex(activeIndex + 1)}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1.5 shadow backdrop-blur-sm transition hover:bg-white"
            >
              <ChevronRight className="h-4 w-4 text-rose-700" />
            </button>
          )}

          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
            {displayImages.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => scrollToIndex(i)}
                aria-label={`Photo ${i + 1}`}
                className={`rounded-full transition-all duration-200 ${
                  activeIndex === i
                    ? "h-1.5 w-4 bg-rose-500"
                    : "h-1.5 w-1.5 bg-white/70 hover:bg-white"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Thumbnail strip: 1st tap shows in main view, 2nd tap (when already active) opens lightbox */}
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {displayImages.map((img, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                if (activeIndex === i) {
                  openLightbox(i);
                } else {
                  scrollToIndex(i);
                }
              }}
              aria-label={activeIndex === i ? `View photo ${i + 1} full size` : `Show photo ${i + 1}`}
              className={`h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl border-2 bg-amber-50/40 transition-all ${
                activeIndex === i
                  ? "border-rose-400 opacity-100 ring-1 ring-rose-300"
                  : "border-amber-100 opacity-50 hover:opacity-80"
              }`}
            >
              <GalleryImage
                src={img}
                alt={`${name} thumbnail ${i + 1}`}
                className="h-full w-full object-contain"
              />
            </button>
          ))}
        </div>
      </div>

      {/* ── Desktop grid — 2x2 on tablet, 4 across on large screens ── */}
      <div className="hidden sm:grid sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
        {displayImages.map((img, i) => (
          <button
            key={i}
            type="button"
            onClick={() => openLightbox(i)}
            className="aspect-square overflow-hidden rounded-xl bg-amber-50/40 p-2 text-left transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label={`View photo ${i + 1} full size`}
          >
            <GalleryImage
              src={img}
              alt={`${name} – photo ${i + 1}`}
              className="h-full w-full object-contain"
            />
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <LightboxOverlay
          images={displayImages}
          name={name}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={closeLightbox}
        />
      )}
    </div>
  );
}
