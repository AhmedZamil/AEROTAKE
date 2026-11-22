import "server-only";

import { headers } from "next/headers";
import { resolveStorefront } from "./tenant";

const CORE_REST = process.env.CORE_ENGINE_REST_URL ?? "http://localhost:8080";
const TIMEOUT_MS = 40_000; // a reservation makes real supplier calls

export interface CoreResult {
  status: number;
  body: unknown;
  retryAfter?: string;
}

/**
 * A call to core-engine's REST API on behalf of a visitor. The tenant comes from the request's host (never the browser's say-so), and the
 * visitor's address is forwarded as X-Forwarded-For — core's rate limits count per client address, so without it every visitor of this site
 * would share this server's one bucket (core honours the header only from its trusted proxy networks). Set TRUST_FORWARDED_FOR=true only
 * behind a reverse proxy that overwrites X-Forwarded-For.
 */
export async function coreFetch(path: string, opts: { method?: string; body?: unknown; bearer?: string } = {}): Promise<CoreResult | "unknown_site"> {
  const tenant = await resolveStorefront();
  if (!tenant) return "unknown_site";

  const h = await headers();
  // The visitor's address is only believed when a proxy we control sits in front of this server and overwrites the header
  // (TRUST_FORWARDED_FOR=true). Otherwise any visitor could send X-Forwarded-For with a new value on every request and walk around core's
  // rate limits; without it core sees this server's address, which is coarse but cannot be forged.
  const trusted = process.env.TRUST_FORWARDED_FOR === "true";
  const client = trusted ? (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip") || "" : "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${CORE_REST}${path}`, {
      method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-ID": tenant.tenantId,
        ...(client ? { "X-Forwarded-For": client } : {}),
        ...(opts.bearer ? { Authorization: `Bearer ${opts.bearer}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    return { status: res.status, body, retryAfter: res.headers.get("retry-after") ?? undefined };
  } finally {
    clearTimeout(timer);
  }
}
