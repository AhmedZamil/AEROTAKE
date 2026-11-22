/**
 * This app's own credential for calling core-engine's gRPC service on behalf of visitors who
 * are not logged in (anonymous search and offer revalidation). It exchanges SERVICE_CLIENT_ID /
 * SERVICE_CLIENT_SECRET for a short-lived service token (core: POST /api/v1/auth/service/token).
 *
 * The secret is deliberately weak power: core limits it to the scopes, channels and tenants
 * configured for this client, so it can read prices but never book, and it cannot mint any other
 * token. Logged-in agents don't use this at all — their own session token is forwarded instead.
 */

const CORE_ENGINE_URL = process.env.CORE_ENGINE_REST_URL ?? "http://localhost:8080";
const EXPIRY_MARGIN_MS = 60_000; // renew a minute early so a token never expires mid-call
const REQUEST_TIMEOUT_MS = 3_000;

export class ServiceCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceCredentialError";
  }
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cached: CachedToken | null = null;
let inflight: Promise<string> | null = null;

async function fetchToken(): Promise<CachedToken> {
  const clientId = process.env.SERVICE_CLIENT_ID;
  const clientSecret = process.env.SERVICE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new ServiceCredentialError(
      "SERVICE_CLIENT_ID / SERVICE_CLIENT_SECRET are not set — run scripts/generate-service-clients.sh --write-env.",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${CORE_ENGINE_URL}/api/v1/auth/service/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (res.status === 401) throw new ServiceCredentialError(`core-engine refused service client '${clientId}'.`);
    if (!res.ok) throw new Error(`service token endpoint answered ${res.status}`);

    const body = (await res.json()) as { accessToken?: string; expiresAt?: string };
    if (!body.accessToken || !body.expiresAt) throw new Error("service token response is malformed");
    return { token: body.accessToken, expiresAt: new Date(body.expiresAt).getTime() };
  } finally {
    clearTimeout(timer);
  }
}

/** A valid service token, fetched on demand and shared by concurrent callers (one request, not many). */
export async function getServiceToken(): Promise<string> {
  if (cached && cached.expiresAt - EXPIRY_MARGIN_MS > Date.now()) return cached.token;

  inflight ??= fetchToken()
    .then((t) => {
      cached = t;
      return t.token;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Drop the cached token — e.g. core answered UNAUTHENTICATED (keys rotated, client revoked). */
export function invalidateServiceToken(): void {
  cached = null;
}
