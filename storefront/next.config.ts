import type { NextConfig } from "next";
import path from "path";

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
