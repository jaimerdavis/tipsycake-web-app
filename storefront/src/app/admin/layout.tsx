"use client";

import "./admin.css";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { AdminGuard } from "@/components/AdminGuard";
import { Button } from "@/components/ui/button";
import { useSiteSettings } from "@/hooks/useSiteSettings";

const navItems = [
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/modifiers", label: "Store Modifiers" },
  { href: "/admin/gallery", label: "Gallery" },
  { href: "/admin/content", label: "Content Settings" },
  { href: "/admin/coupons", label: "Coupons" },
  { href: "/admin/loyalty", label: "Loyalty" },
  { href: "/admin/scheduling", label: "Scheduling" },
  { href: "/admin/chat", label: "Chat" },
  { href: "/admin/drivers", label: "Drivers" },
  { href: "/admin/tracking", label: "Tracking" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/audit-logs", label: "Audit Logs" },
  { href: "/admin/settings/email", label: "Email Settings" },
  { href: "/admin/settings/email/blast", label: "Email Blast" },
  { href: "/admin/settings/sms", label: "SMS Settings" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const settings = useSiteSettings();
  const homeHref = (settings.get("homeUrl") || "/").trim() || "/";

  return (
    <div className="admin-panel flex min-h-screen">
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
          <Link href={homeHref} className="admin-brand text-lg">
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
            const active =
              item.href === "/admin/settings"
                ? pathname === "/admin/settings"
                : pathname.startsWith(item.href);
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
            href={homeHref}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Back to Storefront
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
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
          <span className="admin-brand text-sm">TipsyCake Admin</span>
        </div>
        <main key={pathname} className="relative min-w-0 flex-1 overflow-x-hidden md:overflow-y-auto">
          <div className="min-h-0 w-full p-4 pb-8 md:p-0">
            <AdminGuard>{children}</AdminGuard>
          </div>
        </main>
      </div>
    </div>
  );
}
