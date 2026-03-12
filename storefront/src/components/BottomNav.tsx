"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, UtensilsCrossed, ShoppingCart, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useCartCount } from "@/hooks/useCartCount";
import { useSiteSettings } from "@/hooks/useSiteSettings";

function getNavItems(homeUrl: string) {
  const home = (homeUrl || "").trim() || "/";
  return [
    { href: home, label: "Home", icon: Home },
    { href: "/products", label: "Menu", icon: UtensilsCrossed },
    { href: "/cart", label: "Cart", icon: ShoppingCart },
    { href: "/account", label: "Account", icon: User },
  ] as const;
}

/** Routes where we hide the bottom nav so the page's own sticky bar (price, checkout) has full space. */
const HIDE_BOTTOM_NAV_PATTERNS = [/^\/products\/[^/]+$/, /^\/checkout$/];

export function BottomNav() {
  const pathname = usePathname();
  const cartCount = useCartCount();
  const settings = useSiteSettings();
  const navItems = getNavItems(settings.get("homeUrl") || "/");

  const hide = HIDE_BOTTOM_NAV_PATTERNS.some((p) => p.test(pathname));
  if (hide) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t bg-rose-100/95 px-2 py-2 sm:hidden pb-safe"
      aria-label="Bottom navigation"
    >
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== "/" && pathname.startsWith(href));
        const isCart = href === "/cart";
        return (
          <Link
            key={href}
            href={href}
            className={`relative flex flex-col items-center gap-0.5 rounded-lg px-4 py-2 text-xs font-medium transition-colors ${
              active
                ? "bg-rose-200/80 text-rose-900"
                : "text-stone-600 hover:bg-rose-100 hover:text-rose-800"
            }`}
          >
            <span className="relative inline-block">
              <Icon className="h-5 w-5" />
              {isCart && cartCount > 0 && (
                <Badge
                  variant="default"
                  className="absolute -top-2 -right-3 min-w-[1.25rem] rounded-full px-1.5 py-0 text-[10px] font-bold bg-rose-600 border-0"
                >
                  {cartCount}
                </Badge>
              )}
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
