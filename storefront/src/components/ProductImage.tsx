"use client";

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
