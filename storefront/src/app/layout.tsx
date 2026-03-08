import type { Metadata, Viewport } from "next";
import { Geist_Mono, Lora, Niconne } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "sonner";
import "./globals.css";
import { ConvexClientProvider } from "./ConvexClientProvider";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const niconne = Niconne({
  variable: "--font-niconne",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "TheTipsyCake — Handcrafted Cake Ordering",
    template: "%s | TheTipsyCake",
  },
  description:
    "Order handcrafted bundt cakes for pickup, delivery, or shipping. Schedule your perfect date and enjoy tipsy-good treats.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://tipsycake.com"
  ),
  openGraph: {
    type: "website",
    siteName: "TheTipsyCake",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TipsyCake",
  },
  icons: {
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#e92486",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${lora.variable} ${geistMono.variable} ${niconne.variable} antialiased`}
      >
        {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
          <ClerkProvider
            publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
            afterSignOutUrl="/"
          >
            <ConvexClientProvider>{children}</ConvexClientProvider>
          </ClerkProvider>
        ) : (
          <ConvexClientProvider>{children}</ConvexClientProvider>
        )}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
