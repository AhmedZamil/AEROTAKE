import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required by apps/frontend-b2c/Dockerfile: the runtime image copies only
  // .next/standalone, not the whole source tree and node_modules.
  output: "standalone",
  poweredByHeader: false,
  // Dev: SSLCommerz / browsers sometimes open the storefront as http://[::]:3001 (IPv6 localhost).
  // Without this, Next blocks HMR and client bundles from that host and the payment return page stays blank.
  allowedDevOrigins: ["localhost", "127.0.0.1", "[::]", "[::1]", "b2c.localhost"],
};

export default nextConfig;
