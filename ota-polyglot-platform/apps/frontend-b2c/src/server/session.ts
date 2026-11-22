import "server-only";

import { cookies, headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { coreFetch } from "./core-rest";

/**
 * The signed-in customer's session lives in two httpOnly cookies, so page scripts can never read a token: a short-lived access token
 * (15 minutes, from core) and a refresh token. Only route handlers read them; the browser just learns "signed in as <profile>".
 */
const ACCESS = "b2c_at";
const REFRESH = "b2c_rt";
const REFRESH_DAYS = 30;

export interface CustomerProfile {
  id: string;
  email: string | null;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  phone?: string | null;
}

interface SessionResponse {
  accessToken: string;
  refreshToken: string;
  /** Core names this `expiresAt` on the session response. */
  expiresAt?: string;
  accessTokenExpiresAt?: string;
  customer: CustomerProfile;
}

/** Seconds until the access cookie should disappear. Falls back to 15 minutes when the timestamp is missing. */
function accessCookieMaxAge(res: Pick<SessionResponse, "expiresAt" | "accessTokenExpiresAt">): number {
  const raw = res.expiresAt ?? res.accessTokenExpiresAt;
  const ms = raw ? new Date(raw).getTime() - Date.now() : Number.NaN;
  if (!Number.isFinite(ms)) return 15 * 60;
  return Math.max(60, Math.floor(ms / 1000));
}

/** `exp` from the JWT payload, in ms. Null when the token is not a JWT we can read. */
function jwtExpiryMs(token: string): number | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { exp?: number };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function isHttps(): Promise<boolean> {
  return ((await headers()).get("x-forwarded-proto") ?? "").split(",")[0] === "https";
}

export async function storeSession(res: SessionResponse): Promise<void> {
  const jar = await cookies();
  const secure = await isHttps();
  const base = { httpOnly: true, sameSite: "lax" as const, secure, path: "/" };
  const accessMax = accessCookieMaxAge(res);
  jar.set(ACCESS, res.accessToken, { ...base, maxAge: accessMax });
  jar.set(REFRESH, res.refreshToken, { ...base, maxAge: REFRESH_DAYS * 86_400 });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACCESS);
  jar.delete(REFRESH);
}

/** A usable access token, renewing it from the refresh token when it is missing or about to expire. null = not signed in. */
export async function customerToken(): Promise<{ token: string; profile?: CustomerProfile } | null> {
  const jar = await cookies();
  const access = jar.get(ACCESS)?.value;
  const exp = access ? jwtExpiryMs(access) : null;
  // A cookie can outlive the JWT (the session response's expiry field used to be unread). Refresh before core answers 401.
  if (access && (exp === null || exp - Date.now() > 60_000)) return { token: access };

  const refresh = jar.get(REFRESH)?.value;
  if (!refresh) return null;
  const result = await coreFetch("/api/v1/auth/customer/refresh", { body: { refreshToken: refresh } });
  if (result === "unknown_site" || result.status !== 200) {
    await clearSession(); // an unusable refresh token (used, revoked, expired) ends the session here too
    return null;
  }
  const session = result.body as SessionResponse;
  await storeSession(session);
  return { token: session.accessToken, profile: session.customer };
}

/** Rejects a state-changing request that did not come from this site's own pages (defence in depth on top of SameSite=Lax). */
export function crossSiteRefusal(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) return null; // same-origin GET-like or non-browser call
  const host = request.headers.get("host");
  try {
    if (host && new URL(origin).host === host) return null;
  } catch {
    // fall through
  }
  return NextResponse.json({ error: "forbidden", message: "Cross-site request refused." }, { status: 403 });
}

export function relay(result: { status: number; body: unknown; retryAfter?: string }): NextResponse {
  if (result.status === 204) return new NextResponse(null, { status: 204 }); // a 204 may not carry a body
  const res = NextResponse.json(result.body ?? {}, { status: result.status });
  if (result.retryAfter) res.headers.set("Retry-After", result.retryAfter);
  return res;
}

export function unavailable(): NextResponse {
  return NextResponse.json({ error: "service_unavailable", message: "This is temporarily unavailable. Please try again shortly." }, { status: 503 });
}

export function unknownSite(): NextResponse {
  return NextResponse.json({ error: "unknown_site", message: "This site is not available." }, { status: 404 });
}
