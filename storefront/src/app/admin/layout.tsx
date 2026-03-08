"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/admin/products", label: "Products" },
  { href: "/admin/modifiers", label: "Store Modifiers" },
  { href: "/admin/gallery", label: "Gallery" },
  { href: "/admin/content", label: "Content Settings" },
  { href: "/admin/coupons", label: "Coupons" },
  { href: "/admin/loyalty", label: "Loyalty" },
  { href: "/admin/scheduling", label: "Scheduling" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/drivers", label: "Drivers" },
  { href: "/admin/tracking", label: "Tracking" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/audit-logs", label: "Audit Logs" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-60 shrink-0 flex-col border-r bg-background p-4 transition-transform duration-200 md:sticky md:top-0 md:z-auto md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            TipsyCake Admin
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 md:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </Button>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t pt-4">
          <Link
            href="/products"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Back to Storefront
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b bg-background px-4 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => setSidebarOpen(true)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
          </Button>
          <span className="text-sm font-semibold">TipsyCake Admin</span>
        </div>
        <main key={pathname} className="relative flex-1">
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" aria-hidden>
            <div className="animate-logo-transition">
              <Logo className="h-12 w-12 text-brand-text opacity-80" />
            </div>
          </div>
          <div className="relative z-0 animate-accordion-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
