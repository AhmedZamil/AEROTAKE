/**
 * Tenant resolution.
 *
 * Hosts are resolved against core-engine's tenant registry
 * (GET /api/v1/tenant-registry/resolve), so adding a tenant or a white-label
 * domain is data (scripts/provision-tenant.sh), not a frontend deploy. There is
 * deliberately NO fallback to a default tenant: an unregistered host resolves to
 * null and middleware.ts rejects it. Local dev works because core seeds
 * `localhost` and `127.0.0.1` in Development.
 *
 * Demo API keys are a separate, dev-only convenience (see DEMO_API_KEYS) and are
 * off unless ENABLE_DEMO_API_KEYS=true.
 */

export type Channel = "B2C" | "B2B_AGENT" | "B2B_SUB_AGENT" | "WHITE_LABEL";

export interface TenantContext {
  tenantId: string;
  channel: Channel;
  agentId?: string;
  agentTier?: "STANDARD" | "SILVER" | "GOLD" | "PLATINUM";
  sellCurrency?: string;
  branding: {
    name: string;
    logoUrl: string;
    primaryColor: string;
    accentColor: string;
  };
  markupProfile: string; // key resolved server-side by core-engine
}

/** Core is reachable but cannot answer, and nothing usable is cached. */
export class TenantRegistryUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantRegistryUnavailableError";
  }
}

const CORE_ENGINE_URL = process.env.CORE_ENGINE_REST_URL ?? "http://localhost:8080";

const FOUND_TTL_MS = 60_000; // how long a resolved host is trusted without re-asking
const NOT_FOUND_TTL_MS = 15_000; // shorter, so a newly provisioned host works quickly
const STALE_IF_ERROR_MS = 10 * 60_000; // keep serving a known host if core blips
const REQUEST_TIMEOUT_MS = 2_000;
const MAX_CACHED_HOSTS = 500; // random Host headers must not grow this without bound

interface CacheEntry {
  value: TenantContext | null;
  fetchedAt: number;
}

// Per runtime instance (the Edge middleware and the Node server each get their own).
const cache = new Map<string, CacheEntry>();

interface RegistryResponse {
  tenantId: string;
  channel: Channel;
  agentId: string | null;
  sellCurrency: string;
  markupProfile: string;
  branding: TenantContext["branding"];
}

function bareHost(host: string | null): string | null {
  if (!host) return null;
  const bare = host.split(":")[0].trim().toLowerCase();
  return bare.length > 0 ? bare : null;
}

async function fetchFromRegistry(host: string): Promise<TenantContext | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {};
    const key = process.env.TENANT_REGISTRY_KEY;
    if (key) headers["X-Registry-Key"] = key;

    const res = await fetch(
      `${CORE_ENGINE_URL}/api/v1/tenant-registry/resolve?host=${encodeURIComponent(host)}`,
      { headers, cache: "no-store", signal: controller.signal },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new TenantRegistryUnavailableError(`registry answered ${res.status}`);

    const body = (await res.json()) as RegistryResponse;
    return {
      tenantId: body.tenantId,
      channel: body.channel,
      agentId: body.agentId ?? undefined,
      sellCurrency: body.sellCurrency,
      branding: body.branding,
      markupProfile: body.markupProfile,
    };
  } catch (err) {
    if (err instanceof TenantRegistryUnavailableError) throw err;
    throw new TenantRegistryUnavailableError(err instanceof Error ? err.message : "registry request failed");
  } finally {
    clearTimeout(timer);
  }
}

/** null = the host is not a registered tenant domain. Throws
 *  TenantRegistryUnavailableError if core can't be asked and nothing recent is cached. */
export async function resolveTenantByHost(host: string | null): Promise<TenantContext | null> {
  const bare = bareHost(host);
  if (!bare) return null;

  const now = Date.now();
  const cached = cache.get(bare);
  if (cached && now - cached.fetchedAt < (cached.value ? FOUND_TTL_MS : NOT_FOUND_TTL_MS)) {
    return cached.value;
  }

  try {
    const value = await fetchFromRegistry(bare);
    if (cache.size >= MAX_CACHED_HOSTS) cache.delete(cache.keys().next().value as string);
    cache.set(bare, { value, fetchedAt: now });
    return value;
  } catch (err) {
    // Keep serving a host we already know rather than taking the site down
    // because core restarted; never invent one we don't.
    if (cached?.value && now - cached.fetchedAt < STALE_IF_ERROR_MS) return cached.value;
    throw err;
  }
}

/**
 * Dev-only: X-Api-Key values that act as a B2B agency without logging in, used by the
 * README's curl examples. The key is public in this repo, so it is disabled unless
 * ENABLE_DEMO_API_KEYS=true; production must leave it unset.
 */
const DEMO_API_KEYS: Record<string, TenantContext> = {
  "demo-b2b-key": {
    tenantId: "demo-tenant",
    channel: "B2B_AGENT",
    agentId: "b6e21149-7f9d-4e10-a597-119c3c977565",
    agentTier: "GOLD",
    branding: {
      name: "AeroTake",
      logoUrl: "/images/verticle_logo_1.png",
      primaryColor: "#0B3D5C",
      accentColor: "#F2A104",
    },
    markupProfile: "gold-tier",
  },
};

export function resolveTenantByApiKey(apiKey: string | null): TenantContext | null {
  if (!apiKey || process.env.ENABLE_DEMO_API_KEYS !== "true") return null;
  return DEMO_API_KEYS[apiKey] ?? null;
}

/** Header names propagated to every backend microservice. */
export const TENANT_HEADERS = {
  tenantId: "X-Tenant-ID",
  channel: "X-Channel",
  agentId: "X-Agent-ID",
  agentTier: "X-Agent-Tier",
  brandName: "X-Brand-Name",
} as const;
