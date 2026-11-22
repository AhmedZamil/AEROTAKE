import { defineConfig, devices } from "@playwright/test";

// Runs against a live storefront (default: the compose stack at http://localhost:3001; the local .env sets STOREFRONT_HOST_OVERRIDE=b2c.localhost so
// that host is looked up as the consumer tenant). Do not use b2c.localhost as the browser host: inside the container it does not resolve, so
// Next's image optimiser, which fetches the logo from itself by host name, hangs. Override with B2C_BASE_URL for another environment.
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  retries: 0,
  reporter: [["list"]],
  // Each run pretends to be a different visitor: core rate-limits per client address, and the local stack runs with TRUST_FORWARDED_FOR=true
  // (put it in .env) so the storefront passes that address on.
  use: { extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250) + 1}` }, baseURL: process.env.B2C_BASE_URL ?? "http://localhost:3001", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
});
