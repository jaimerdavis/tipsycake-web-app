import type { NextConfig } from "next";
import path from "path";

// Fail production build if Clerk dev key is used (catches Vercel env misconfig)
if (process.env.VERCEL_ENV === "production" && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_")) {
  throw new Error(
    "Production deploy cannot use Clerk dev key (pk_test_). Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to pk_live_... in Vercel → Settings → Environment Variables → Production, then redeploy."
  );
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- PWA uses CommonJS
const withPWAInit = require("@ducanh2912/next-pwa").default;
const withPWA = withPWAInit({ dest: "public" });

const nextConfig: NextConfig = {
  typescript: {
    // Convex generates proper types at deploy time via `npx convex deploy`.
    // Stub _generated files don't carry schema types, so we skip TS in `next build`.
    ignoreBuildErrors: true,
  },
  // Align with Vercel's outputFileTracingRoot when Root Directory is storefront
  outputFileTracingRoot: path.join(__dirname),
  turbopack: {
    root: path.join(__dirname),
  },
  webpack: (config) => {
    config.resolve.modules = [
      path.join(__dirname, "node_modules"),
      ...config.resolve.modules,
    ];
    return config;
  },
};

export default withPWA(nextConfig);
