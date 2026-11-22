/**
 * Session storage and refresh for the real core-engine auth API.
 *
 * Tokens live in a single httpOnly cookie (`ota_session`, JSON-encoded) plus a
 * separate long-lived device-trust cookie (`ota_device_token`) populated by a
 * successful device-verification call. Neither is ever readable from client
 * JS by design — client components go through GET /api/auth/session instead.
 *
 * IMPORTANT: `decodeAccessTokenUnverified` does not check the JWT signature —
 * it exists only so the frontend can show "logged in as X" without a crypto
 * dependency. Never use its output to gate access to anything; the backend
 * independently verifies every real call — for REST. It does NOT for gRPC:
 * core-engine's gRPC service has no [Authorize] anywhere and trusts whatever
 * tenant_id/agent_id a caller's request message claims. For any call that
 * reaches the backend over gRPC (see lib/grpc-client.ts), this frontend is
 * the only place identity ever gets checked, so use `verifyAccessTokenClaims`
 * instead — it actually checks the signature — never the unverified decode.
 *
 * This module uses `next/headers` (Route Handler / Server Component context
 * only) and Node's `Buffer`, so it must never be imported from `middleware.ts`
 * (Edge runtime) — middleware only checks cookie *presence*, duplicating the
 * `ota_session` cookie name as a local literal for that reason.
 */

import { cookies } from "next/headers";
import { verifyJwt } from "./jwks";

export const SESSION_COOKIE = "ota_session";
export const DEVICE_TOKEN_COOKIE = "ota_device_token";

const REFRESH_SKEW_MS = 30_000;
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // mirrors the backend's refresh-token lifetime
const DEVICE_TOKEN_MAX_AGE_SECONDS = 400 * 24 * 60 * 60; // browsers cap cookie Max-Age around here

const CORE_ENGINE_URL = process.env.CORE_ENGINE_REST_URL ?? "http://localhost:8080";

export interface SessionData {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  /** Whether "Remember me" was checked — controls whether refreshed cookies stay persistent. */
  persistent: boolean;
}

export interface AccessTokenClaims {
  sub?: string;
  role?: string;
  tenant_id?: string;
  agent_id?: string;
}

function cookieOptions(persistent: boolean) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    ...(persistent ? { maxAge: SESSION_MAX_AGE_SECONDS } : {}),
  };
}

export function isExpired(expiresAt: string): boolean {
  return Date.now() + REFRESH_SKEW_MS >= new Date(expiresAt).getTime();
}

export async function getSession(): Promise<SessionData | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SessionData>;
    if (!parsed.accessToken || !parsed.refreshToken || !parsed.expiresAt) return null;
    return { ...parsed, persistent: Boolean(parsed.persistent) } as SessionData;
  } catch {
    return null;
  }
}

export async function setSession(data: SessionData): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, JSON.stringify(data), cookieOptions(data.persistent));
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getDeviceToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(DEVICE_TOKEN_COOKIE)?.value ?? null;
}

export async function setDeviceToken(token: string): Promise<void> {
  const store = await cookies();
  store.set(DEVICE_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_TOKEN_MAX_AGE_SECONDS,
  });
}

export async function clearDeviceToken(): Promise<void> {
  const store = await cookies();
  store.delete(DEVICE_TOKEN_COOKIE);
}

/**
 * Not a trust boundary — see the module doc comment. Display use only.
 */
export function decodeAccessTokenUnverified(accessToken: string): AccessTokenClaims | null {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(base64, "base64").toString("utf-8");
    return JSON.parse(json) as AccessTokenClaims;
  } catch {
    return null;
  }
}

export interface VerifiedAccessTokenClaims {
  sub: string;
  tenantId: string;
  agentId: string | null;
  role: string;
}

const JWT_ISSUER = "ota-core-engine";
// Must match core-engine's TokenAudiences.Agents. Customer and service tokens use other
// audiences, so they can never pass this verifier.
const JWT_AUDIENCE = "ota-agents";

/**
 * This IS a trust boundary — unlike decodeAccessTokenUnverified above, this
 * checks the signature (ES256, against the public keys core-engine publishes —
 * this app holds no signing secret), issuer, audience, expiry, and that the
 * token is an access token (not a refresh token used where one isn't allowed),
 * mirroring core-engine's own JwtBearerOptions validation. Use this — never
 * the unverified decode — for anything whose result reaches a gRPC call,
 * since core-engine's gRPC service does not verify tokens itself.
 */
export async function verifyAccessTokenClaims(accessToken: string): Promise<VerifiedAccessTokenClaims | null> {
  try {
    const payload = await verifyJwt(accessToken, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
    if (!payload) return null;
    if (payload.token_type !== "access") return null;
    if (payload.actor_type !== "agent") return null;
    if (typeof payload.sub !== "string" || typeof payload.tenant_id !== "string" || typeof payload.role !== "string") {
      return null;
    }
    return {
      sub: payload.sub,
      tenantId: payload.tenant_id,
      agentId: typeof payload.agent_id === "string" ? payload.agent_id : null,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

/**
 * Read-only: verifies the session's access token WITHOUT attempting a
 * refresh if it's expired. Safe to call from a plain Server Component
 * (a page or layout render) — unlike `verifyAndRefreshSession`/
 * `requireVerifiedAgentSession` below, this never calls `performRefresh`,
 * which writes cookies via `setSession`/`clearSession`. Next.js only
 * permits cookie mutation during `phase: 'action'` (Server Actions and
 * Route Handlers); a Server Component renders under `phase: 'render'` and
 * would throw `ReadonlyRequestCookiesError` if this tried to refresh.
 * A null return here just means "can't confirm the session is good without
 * a refresh" — callers in a render context should treat that as
 * unauthenticated (e.g. redirect), not as a hard error.
 */
export async function getVerifiedClaims(): Promise<VerifiedAccessTokenClaims | null> {
  const session = await getSession();
  if (!session || isExpired(session.expiresAt)) return null;
  return verifyAccessTokenClaims(session.accessToken);
}

/**
 * Refreshes-if-needed and verifies the session's access token in one call.
 * Only safe from a Route Handler / Server Action (see `getVerifiedClaims`'s
 * comment on why). `middlewareTenantId` is only used for the X-Tenant-ID
 * header the REST /refresh call itself requires; it is not a
 * security-relevant value here — the tenantId/agentId this function
 * returns come from the verified JWT, never from that header.
 */
export async function verifyAndRefreshSession(
  middlewareTenantId: string,
): Promise<VerifiedAccessTokenClaims | null> {
  return (await verifiedSessionWithToken(middlewareTenantId))?.claims ?? null;
}

/** The verified claims AND the access token they came from — what a gRPC call needs, since core
 *  authenticates the call with that same token instead of trusting the claims we pass along. */
export interface VerifiedSession {
  claims: VerifiedAccessTokenClaims;
  accessToken: string;
}

export async function verifiedSessionWithToken(middlewareTenantId: string): Promise<VerifiedSession | null> {
  let session = await getSession();
  if (!session) return null;

  if (isExpired(session.expiresAt)) {
    session = await performRefresh(middlewareTenantId);
    if (!session) return null;
  }

  const claims = await verifyAccessTokenClaims(session.accessToken);
  return claims ? { claims, accessToken: session.accessToken } : null;
}

/**
 * Same as `verifyAndRefreshSession`, but additionally requires an
 * `agentId` claim — for routes that need an actual agency to act on behalf
 * of (booking, credit) where a platform Admin (no agent) can't be let
 * through.
 */
export async function requireVerifiedAgentSession(
  middlewareTenantId: string,
): Promise<VerifiedAccessTokenClaims | null> {
  return (await requireVerifiedAgentSessionWithToken(middlewareTenantId))?.claims ?? null;
}

export async function requireVerifiedAgentSessionWithToken(
  middlewareTenantId: string,
): Promise<VerifiedSession | null> {
  const session = await verifiedSessionWithToken(middlewareTenantId);
  if (!session || !session.claims.agentId) return null; // no agency to book against (e.g. a platform Admin)
  return session;
}

/**
 * The single place refresh happens. Replaces all three token fields
 * atomically from the backend's response — never patch just the access
 * token, since the backend is free to rotate the refresh token too.
 *
 * A network failure talking to core-engine leaves the existing session
 * alone (returns null without clearing) so a transient outage doesn't log
 * the user out; an explicit rejection from the backend (expired/invalid
 * refresh token) does clear it.
 */
export async function performRefresh(tenantId: string): Promise<SessionData | null> {
  const session = await getSession();
  if (!session) return null;

  let response: Response;
  try {
    response = await fetch(`${CORE_ENGINE_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Tenant-ID": tenantId },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
      cache: "no-store",
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    await clearSession();
    return null;
  }

  const tokens = (await response.json().catch(() => null)) as
    | { accessToken: string; refreshToken: string; expiresAt: string }
    | null;
  if (!tokens?.accessToken || !tokens.refreshToken || !tokens.expiresAt) {
    await clearSession();
    return null;
  }

  // Pick only the declared fields — the backend's TokensResponse also
  // carries a `deviceToken` (always null on refresh) that doesn't belong in
  // this cookie.
  const next: SessionData = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    persistent: session.persistent,
  };
  await setSession(next);
  return next;
}
