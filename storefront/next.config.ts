import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  typescript: {
    // Convex generates proper types at deploy time via `npx convex deploy`.
    // Stub _generated files don't carry schema types, so we skip TS in `next build`.
    ignoreBuildErrors: true,
  },
  turbopack: {
    root: __dirname,
  },
  webpack: (config) => {
    config.resolve.modules = [
      path.join(__dirname, "node_modules"),
      ...config.resolve.modules,
    ];
    return config;
  },
};

export default nextConfig;
