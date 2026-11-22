/**
 * Shared helpers for calling core-engine from Route Handlers. The browser
 * never talks to core-engine directly (no CORS is configured there) — every
 * call goes through one of these two functions so tenant headers and, where
 * relevant, the bearer token are attached consistently.
 */

import { getSession, isExpired, performRefresh } from "./auth-session";

export const CORE_ENGINE_URL = process.env.CORE_ENGINE_REST_URL ?? "http://localhost:8080";

export interface TenantHeaders {
  tenantId: string;
  channel: string;
  agentId?: string | null;
  agentTier?: string | null;
}

function tenantHeaderRecord(tenant: TenantHeaders): Record<string, string> {
  return {
    "X-Tenant-ID": tenant.tenantId,
    "X-Channel": tenant.channel,
    "X-Agent-ID": tenant.agentId ?? "",
    "X-Agent-Tier": tenant.agentTier ?? "",
  };
}

/** Unauthenticated call — the /auth/* endpoints themselves. */
export async function callBackend(path: string, init: RequestInit, tenant: TenantHeaders): Promise<Response> {
  return fetch(`${CORE_ENGINE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...tenantHeaderRecord(tenant),
      ...(init.headers as Record<string, string> | undefined),
    },
    cache: "no-store",
  });
}

/**
 * Authenticated call: attaches `Authorization: Bearer <token>` plus the same
 * tenant headers `callBackend` sends (X-Channel/X-Agent-Tier are never in the
 * JWT, so the backend treats an authenticated call without them as anonymous
 * B2C — dropping these would silently break tier/channel-specific logic).
 *
 * On a 401 it refreshes once and retries before giving up. No route in this
 * task calls this yet (booking/credit endpoints are a later module), but
 * it's the seam those calls attach to.
 */
export async function callBackendWithAuth(
  path: string,
  init: RequestInit,
  tenant: TenantHeaders
): Promise<Response> {
  let session = await getSession();
  if (!session) {
    return Response.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (isExpired(session.expiresAt)) {
    session = await performRefresh(tenant.tenantId);
    if (!session) {
      return Response.json({ error: "not_authenticated" }, { status: 401 });
    }
  }

  const attempt = (accessToken: string) =>
    fetch(`${CORE_ENGINE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...tenantHeaderRecord(tenant),
        ...(init.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

  let response = await attempt(session.accessToken);
  if (response.status === 401) {
    const refreshed = await performRefresh(tenant.tenantId);
    if (!refreshed) return response; // refresh failed — propagate the original 401
    response = await attempt(refreshed.accessToken);
  }
  return response;
}
