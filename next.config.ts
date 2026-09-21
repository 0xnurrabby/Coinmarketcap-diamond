import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@neondatabase/serverless",
    "playwright-core",
    "steel-sdk",
  ],
};

export default nextConfig;
