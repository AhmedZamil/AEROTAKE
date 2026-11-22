/**
 * Platform-admin session. Tokens live in an httpOnly cookie this app owns
 * (`ota_admin_session`), separate from the agency portal cookie, because both
 * apps are served from localhost and browsers do not isolate cookies by port.
 */

import { cookies } from "next/headers";
import { tenantLabel } from "@/lib/auth";
import { verifyJwt } from "./jwks";

export const SESSION_COOKIE = "ota_admin_session";
export const DEVICE_TOKEN_COOKIE = "ota_admin_device";

const REFRESH_SKEW_MS = 30_000;
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const DEVICE_TOKEN_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
const CORE_ENGINE_URL = process.env.CORE_ENGINE_REST_URL ?? "http://localhost:8080";
const JWT_ISSUER = "ota-core-engine";
const JWT_AUDIENCE = "ota-agents";

export interface SessionData {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  email: string;
  persistent: boolean;
}

export interface AdminClaims {
  sub: string;
  tenantId: string;
  role: string;
  email: string;
}

function cookieBase() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
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
    if (!parsed.accessToken || !parsed.refreshToken || !parsed.expiresAt || !parsed.email) return null;
    return { ...parsed, persistent: Boolean(parsed.persistent) } as SessionData;
  } catch {
    return null;
  }
}

export async function setSession(data: SessionData): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, JSON.stringify(data), {
    ...cookieBase(),
    ...(data.persistent ? { maxAge: SESSION_MAX_AGE_SECONDS } : {}),
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getDeviceToken(): Promise<string | null> {
  const store = await cookies();
  const saved = store.get(DEVICE_TOKEN_COOKIE)?.value;
  if (saved) return saved;
  const fallback = process.env.ADMIN_DEVICE_TOKEN;
  if (fallback && fallback.length > 0) return fallback;
  // Local core seeds this device so the first admin login skips email verification.
  if (process.env.NODE_ENV !== "production") return "dev-admin-device";
  return null;
}

export async function setDeviceToken(token: string): Promise<void> {
  const store = await cookies();
  store.set(DEVICE_TOKEN_COOKIE, token, {
    ...cookieBase(),
    maxAge: DEVICE_TOKEN_MAX_AGE_SECONDS,
  });
}

export async function verifyAdminAccessToken(accessToken: string, email: string): Promise<AdminClaims | null> {
  const payload = await verifyJwt(accessToken, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
  if (!payload) return null;
  if (payload.token_type !== "access") return null;
  if (payload.actor_type !== "agent") return null;
  if (payload.role !== "Admin") return null;
  if (typeof payload.sub !== "string" || typeof payload.tenant_id !== "string") return null;
  return { sub: payload.sub, tenantId: payload.tenant_id, role: "Admin", email };
}

/** Read-only. Safe from a Server Component: it never writes cookies. */
export async function getVerifiedAdmin(): Promise<AdminClaims | null> {
  const session = await getSession();
  if (!session || isExpired(session.expiresAt)) return null;
  return verifyAdminAccessToken(session.accessToken, session.email);
}

export interface VerifiedAdmin {
  claims: AdminClaims;
  accessToken: string;
}

export async function verifiedAdminSession(): Promise<VerifiedAdmin | null> {
  let session = await getSession();
  if (!session) return null;
  if (isExpired(session.expiresAt)) {
    session = await performRefresh();
    if (!session) return null;
  }
  const claims = await verifyAdminAccessToken(session.accessToken, session.email);
  return claims ? { claims, accessToken: session.accessToken } : null;
}

export function toAuthUser(claims: AdminClaims) {
  return {
    email: claims.email,
    name: "Platform Admin",
    tenantId: claims.tenantId,
    tenantLabel: tenantLabel(claims.tenantId),
    role: claims.role,
  };
}

async function performRefresh(): Promise<SessionData | null> {
  const session = await getSession();
  if (!session) return null;

  // The access token may already be expired, so this read is only the tenant
  // header the anonymous refresh endpoint requires. Core validates the refresh token.
  const headerTenant = decodeUnverified(session.accessToken)?.tenant_id;
  if (typeof headerTenant !== "string" || headerTenant.length === 0) {
    await clearSession();
    return null;
  }

  let response: Response;
  try {
    response = await fetch(`${CORE_ENGINE_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Tenant-ID": headerTenant },
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
    | { accessToken?: string; refreshToken?: string; expiresAt?: string }
    | null;
  if (!tokens?.accessToken || !tokens.refreshToken || !tokens.expiresAt) {
    await clearSession();
    return null;
  }

  const claims = await verifyAdminAccessToken(tokens.accessToken, session.email);
  if (!claims) {
    await clearSession();
    return null;
  }

  const next: SessionData = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    email: session.email,
    persistent: session.persistent,
  };
  await setSession(next);
  return next;
}

function decodeUnverified(accessToken: string): Record<string, unknown> | null {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return null;
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}
