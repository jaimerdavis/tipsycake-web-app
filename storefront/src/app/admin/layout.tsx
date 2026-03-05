"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/admin/products", label: "Products" },
  { href: "/admin/coupons", label: "Coupons" },
  { href: "/admin/loyalty", label: "Loyalty" },
  { href: "/admin/scheduling", label: "Scheduling" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/drivers", label: "Drivers" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/audit-logs", label: "Audit Logs" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r bg-muted/40 p-4">
        <Link href="/" className="mb-6 text-lg font-semibold tracking-tight">
          TipsyCake Admin
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-2 text-sm transition-colors ${
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
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
