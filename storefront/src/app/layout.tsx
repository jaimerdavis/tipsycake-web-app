import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "./ConvexClientProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "TheTipsyCake — Handcrafted Cake Ordering",
    template: "%s | TheTipsyCake",
  },
  description:
    "Order handcrafted cakes, cupcakes, and desserts for pickup, delivery, or shipping. Customize flavors, schedule your perfect date, and enjoy tipsy-good treats.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://tipsycake.com"
  ),
  openGraph: {
    type: "website",
    siteName: "TheTipsyCake",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
