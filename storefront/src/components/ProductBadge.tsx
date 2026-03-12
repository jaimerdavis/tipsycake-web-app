"use client";

import { cn } from "@/lib/utils";

export type ProductBadgeType = "popular" | "new_flavor" | "best_seller";

const BADGE_CONFIG: Record<
  ProductBadgeType,
  { label: string; className: string; style?: React.CSSProperties }
> = {
  popular: {
    label: "Popular",
    className:
      "badge-popular overflow-hidden border-0 backdrop-blur-sm [--badge-glow:rgba(34,197,94,0.35)] animate-badge-glow",
    style: {
      background: "linear-gradient(135deg, rgba(167,243,208,0.95) 0%, rgba(110,231,183,0.9) 50%, rgba(52,211,153,0.85) 100%)",
      color: "#065f46",
      textShadow: "0 0.5px 1px rgba(255,255,255,0.6)",
      WebkitBackdropFilter: "blur(8px)",
    },
  },
  new_flavor: {
    label: "New Flavor",
    className:
      "badge-new-flavor overflow-hidden border-0 backdrop-blur-sm [--badge-glow:rgba(245,158,11,0.4)] animate-badge-glow",
    style: {
      background: "linear-gradient(135deg, rgba(254,243,199,0.95) 0%, rgba(253,230,138,0.9) 50%, rgba(252,211,77,0.85) 100%)",
      color: "#78350f",
      textShadow: "0 0.5px 1px rgba(255,255,255,0.7)",
      WebkitBackdropFilter: "blur(8px)",
    },
  },
  best_seller: {
    label: "Best Seller",
    className:
      "badge-best-seller overflow-hidden border-0 backdrop-blur-sm [--badge-glow:rgba(239,68,68,0.35)] animate-badge-glow",
    style: {
      background: "linear-gradient(135deg, rgba(254,226,226,0.95) 0%, rgba(254,202,202,0.9) 50%, rgba(252,165,165,0.85) 100%)",
      color: "#991b1b",
      textShadow: "0 0.5px 1px rgba(255,255,255,0.5)",
      WebkitBackdropFilter: "blur(8px)",
    },
  },
};

export function ProductBadge({
  badge,
  className,
}: {
  badge: ProductBadgeType;
  className?: string;
}) {
  const config = BADGE_CONFIG[badge];
  if (!config) return null;

  return (
    <span
      className={cn(
        "relative inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider",
        "after:pointer-events-none after:absolute after:inset-0 after:rounded-full after:bg-gradient-to-r after:from-transparent after:via-white/25 after:to-transparent after:bg-[length:200%_100%] after:animate-badge-shimmer",
        config.className,
        className
      )}
      style={config.style}
    >
      <span className="relative z-[1]">{config.label}</span>
    </span>
  );
}

const VALID_BADGES: ProductBadgeType[] = ["popular", "new_flavor", "best_seller"];

export function ProductBadges({
  badges,
  className,
}: {
  badges?: string[];
  className?: string;
}) {
  const valid = badges?.filter((b): b is ProductBadgeType =>
    VALID_BADGES.includes(b as ProductBadgeType)
  );
  if (!valid || valid.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {valid.map((b) => (
        <ProductBadge key={b} badge={b} />
      ))}
    </div>
  );
}
