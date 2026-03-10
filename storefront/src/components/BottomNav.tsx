"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, UtensilsCrossed, ShoppingCart, User } from "lucide-react";

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/products", label: "Menu", icon: UtensilsCrossed },
  { href: "/cart", label: "Cart", icon: ShoppingCart },
  { href: "/account", label: "Account", icon: User },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t bg-rose-100/95 px-2 py-2 sm:hidden pb-safe"
      aria-label="Bottom navigation"
    >
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== "/" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center gap-0.5 rounded-lg px-4 py-2 text-xs font-medium transition-colors ${
              active
                ? "bg-rose-200/80 text-rose-900"
                : "text-stone-600 hover:bg-rose-100 hover:text-rose-800"
            }`}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
