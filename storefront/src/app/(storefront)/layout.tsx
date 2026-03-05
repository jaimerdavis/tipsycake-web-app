"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

const navLinks = [
  { href: "/products", label: "Menu" },
  { href: "/cart", label: "Cart" },
];

export default function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="h-7 w-7 text-rose-600" />
            <span className="text-lg font-semibold tracking-tight">
              TheTipsyCake
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {navLinks.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Button
                  key={link.href}
                  asChild
                  variant={active ? "secondary" : "ghost"}
                  size="sm"
                >
                  <Link href={link.href}>{link.label}</Link>
                </Button>
              );
            })}
          </nav>

          <div className="ml-auto">
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/products">Admin</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t bg-muted/40">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-2 px-4 py-6 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between sm:text-left">
          <p>&copy; {new Date().getFullYear()} TheTipsyCake. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/products" className="hover:text-foreground transition-colors">
              Menu
            </Link>
            <Link href="/cart" className="hover:text-foreground transition-colors">
              Cart
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
