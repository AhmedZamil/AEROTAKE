import "server-only";

/**
 * Which tenant this storefront request is for: the request's host, resolved against core-engine's tenant registry
 * (GET /api/v1/tenant-registry/resolve) — adding a brand is data (scripts/provision-tenant.sh), not a deploy. There is no
 * default tenant: an unregistered host, or a host registered for another channel (an agent portal), is refused.
 * Local dev works because core seeds `localhost` as a B2C domain in Development.
 */

import { headers } from "next/headers";

const CORE_REST = process.env.CORE_ENGINE_REST_URL ?? "http://localhost:8080";
const FOUND_TTL_MS = 60_000;
const NOT_FOUND_TTL_MS = 15_000;
const STALE_IF_ERROR_MS = 10 * 60_000;
const MAX_HOSTS = 200;

export interface StorefrontTenant {
  tenantId: string;
  sellCurrency: string;
  brandName: string;
}

export class TenantUnavailableError extends Error {}

interface Entry {
  value: StorefrontTenant | null;
  at: number;
}
const cache = new Map<string, Entry>();

async function fetchTenant(host: string): Promise<StorefrontTenant | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);
  try {
    const key = process.env.TENANT_REGISTRY_KEY;
    const res = await fetch(`${CORE_REST}/api/v1/tenant-registry/resolve?host=${encodeURIComponent(host)}`, {
      headers: key ? { "X-Registry-Key": key } : {},
      cache: "no-store",
      signal: controller.signal,
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new TenantUnavailableError(`registry answered ${res.status}`);
    const body = (await res.json()) as { tenantId: string; channel: string; sellCurrency: string; branding?: { name?: string } };
    // This app sells to consumers: a host that belongs to an agent portal or a white-label agency is not ours to serve.
    if (body.channel !== "B2C") return null;
    return { tenantId: body.tenantId, sellCurrency: body.sellCurrency, brandName: body.branding?.name ?? "" };
  } catch (err) {
    if (err instanceof TenantUnavailableError) throw err;
    throw new TenantUnavailableError(err instanceof Error ? err.message : "registry request failed");
  } finally {
    clearTimeout(timer);
  }
}

/** null = this host is not a B2C storefront. Throws TenantUnavailableError if core can't be asked and nothing recent is cached. */
export async function resolveStorefront(): Promise<StorefrontTenant | null> {
  const h = await headers();
  // Development only: browsers and Google sign-in accept http://localhost:3001 but not b2c.localhost, and `localhost` belongs to the demo
  // agent tenant in the registry. STOREFRONT_HOST_OVERRIDE makes this server look the tenant up as another registered host (b2c.localhost).
  // Never set it in production: the tenant must come from the host the customer actually used.
  const host = (process.env.STOREFRONT_HOST_OVERRIDE || (h.get("host") ?? "")).split(":")[0].trim().toLowerCase();
  if (!host) return null;

  const now = Date.now();
  const hit = cache.get(host);
  if (hit && now - hit.at < (hit.value ? FOUND_TTL_MS : NOT_FOUND_TTL_MS)) return hit.value;
  try {
    const value = await fetchTenant(host);
    if (cache.size >= MAX_HOSTS) cache.delete(cache.keys().next().value as string);
    cache.set(host, { value, at: now });
    return value;
  } catch (err) {
    if (hit?.value && now - hit.at < STALE_IF_ERROR_MS) return hit.value;
    throw err;
  }
}
