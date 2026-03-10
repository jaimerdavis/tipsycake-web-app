"use client";

import Link from "next/link";
import { startTransition, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SignInButton, SignUpButton, useAuth, useClerk } from "@clerk/nextjs";

import { AuthNav } from "@/components/AuthNav";
import { BottomNav } from "@/components/BottomNav";
import { ChatWidgetUniversal } from "@/components/ChatWidgetUniversal";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useSiteSettings } from "@/hooks/useSiteSettings";

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
  const { isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const settings = useSiteSettings();
  const logoUrl = settings.get("logoUrl");
  const storeName = settings.get("storeName") || "TheTipsyCake";
  const faviconUrl = settings.get("faviconUrl");
  const storePhone = settings.get("storePhone")?.trim();
  const smsHref = storePhone ? `sms:${storePhone.replace(/\D/g, "").length === 10 ? `+1${storePhone.replace(/\D/g, "")}` : storePhone.replace(/\D/g, "")}` : null;
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
      <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 sm:gap-6">
          <Link href="/" className="flex shrink-0 items-center">
            {logoUrl ? (
              <img src={logoUrl} alt={storeName} className="h-10 w-10 rounded-md object-contain" />
            ) : (
              <Logo className="h-9 w-9 text-brand-text" />
            )}
          </Link>

          {/* Page title — products: "Order Your Cake" */}
          {pathname.startsWith("/products") && (
            <span className="flex-1 truncate text-center font-display text-lg font-bold text-brand-text sm:text-xl">
              {settings.get("contentMenuTitle") || "Order Your Cake"}
            </span>
          )}

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
            {smsHref && (
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <a href={smsHref}>Send us a text</a>
              </Button>
            )}
            {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && <AuthNav />}
            <Button asChild variant="ghost" size="sm" className="rounded-full">
              <Link href="/admin">Admin</Link>
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
          <nav className="flex flex-col gap-3 border-t bg-background px-4 py-4 sm:hidden animate-fade-in">
            {smsHref && (
              <a
                href={smsHref}
                className="flex items-center justify-center rounded-full bg-button px-4 py-3 text-sm font-medium text-stone-50 hover:bg-button-hover"
              >
                Send us a text
              </a>
            )}
            {/* Account & Admin section (top) */}
            <div className="flex flex-col gap-1 rounded-lg bg-muted/50 px-2 py-2">
              {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
                (isSignedIn ? (
                  <>
                    <Link
                      href="/account"
                      className={`rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                        pathname.startsWith("/account")
                          ? "bg-secondary text-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      My Account
                    </Link>
                    <button
                      type="button"
                      onClick={() => void signOut()}
                      className="rounded-md px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  <>
                    <SignInButton mode="modal">
                      <button
                        type="button"
                        className="w-full rounded-md px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        Log in
                      </button>
                    </SignInButton>
                    <SignUpButton mode="modal">
                      <button
                        type="button"
                        className="w-full rounded-md px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        Create account
                      </button>
                    </SignUpButton>
                  </>
                ))}
              <Link
                href="/admin"
                className={`rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                  pathname.startsWith("/admin")
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                Admin
              </Link>
            </div>
            <Separator />
            {/* Menu & Cart section */}
            <div className="flex flex-col gap-1">
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
            </div>
          </nav>
        )}
      </header>

      <main className="flex-1 pb-20 sm:pb-0">
        <div key={pathname} className="animate-page-content-in">
          {children}
        </div>
      </main>

      <ChatWidgetUniversal />
      <BottomNav />
    </div>
  );
}
