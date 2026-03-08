"use client";

import Link from "next/link";
import { startTransition, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { AuthNav } from "@/components/AuthNav";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { useSiteSettings } from "@/hooks/useSiteSettings";

function PageTransition({
  children,
  logoUrl,
}: {
  children: React.ReactNode;
  logoUrl?: string | null;
}) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="relative min-h-0 flex-1">
      <div
        className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
        aria-hidden
      >
        <div className="animate-logo-transition">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              className="h-14 w-14 rounded-lg object-contain opacity-90"
            />
          ) : (
            <Logo className="h-14 w-14 text-brand-text opacity-90" />
          )}
        </div>
      </div>
      <div className="relative z-0 pointer-events-auto animate-accordion-in">{children}</div>
    </div>
  );
}

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
  const settings = useSiteSettings();
  const logoUrl = settings.get("logoUrl");
  const storeName = settings.get("storeName") || "TheTipsyCake";
  const faviconUrl = settings.get("faviconUrl");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    startTransition(() => setMobileOpen(false));
  }, [pathname]);

  useEffect(() => {
    if (!faviconUrl) return;
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = faviconUrl;
  }, [faviconUrl]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 sm:gap-6">
          <Link href="/" className="flex items-center shrink-0">
            {logoUrl ? (
              <img src={logoUrl} alt={storeName} className="h-10 w-10 rounded-md object-contain" />
            ) : (
              <Logo className="h-9 w-9 text-brand-text" />
            )}
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 sm:flex">
            {navLinks.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Button
                  key={link.href}
                  asChild
                  variant={active ? "secondary" : "ghost"}
                  size="sm"
                  className="rounded-full transition-all duration-150 active:scale-95"
                >
                  <Link href={link.href}>{link.label}</Link>
                </Button>
              );
            })}
          </nav>

          <div className="ml-auto flex hidden items-center gap-2 sm:flex">
            {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && <AuthNav />}
            <Button asChild variant="ghost" size="sm" className="rounded-full">
              <Link href="/admin/products">Admin</Link>
            </Button>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:hidden"
            aria-label="Toggle menu"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {mobileOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="4" y1="6" x2="20" y2="6" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="18" x2="20" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <nav className="flex flex-col border-t bg-background px-4 py-3 sm:hidden animate-fade-in">
            {navLinks.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && (
              <Link
                href="/account"
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Account
              </Link>
            )}
            <Link
              href="/admin/products"
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Admin
            </Link>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <PageTransition logoUrl={logoUrl}>{children}</PageTransition>
      </main>

      <footer className="border-t bg-muted/40">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-2 px-4 py-6 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between sm:text-left">
          <p>&copy; {new Date().getFullYear()} {storeName}. All rights reserved.</p>
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
