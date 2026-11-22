import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { CORE_ENGINE_URL } from "@/lib/backend-client";
import { TENANT_HEADERS } from "@/lib/tenants";

/**
 * Airports are global reference data (no TenantId in core-engine's Airport
 * table) and AirportsController is [AllowAnonymous], so this needs no
 * session — but core-engine's TenantResolutionMiddleware still requires
 * X-Tenant-ID on every non-gRPC request regardless of the controller's own
 * auth/scoping, so the tenant header the edge middleware already stamped on
 * this request still has to be forwarded (same as search/route.ts).
 * `revalidate` caches identical queries briefly since the underlying
 * directory barely ever changes, keeping per-keystroke typeahead traffic cheap.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query") ?? "";
  if (!query.trim()) {
    return NextResponse.json({ items: [] });
  }

  const h = await headers();
  const tenantId = h.get(TENANT_HEADERS.tenantId);
  if (!tenantId) {
    return NextResponse.json(
      { error: "tenant_unresolved", message: "Middleware did not stamp a tenant." },
      { status: 500 }
    );
  }

  const limit = request.nextUrl.searchParams.get("limit") ?? "20";
  const upstream = new URL(`${CORE_ENGINE_URL}/api/v1/airports`);
  upstream.searchParams.set("query", query);
  upstream.searchParams.set("limit", limit);

  try {
    const response = await fetch(upstream, {
      headers: { [TENANT_HEADERS.tenantId]: tenantId },
      next: { revalidate: 300 },
    });
    if (!response.ok) {
      return NextResponse.json({ items: [] });
    }
    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    // Degrade quietly to no results — the picker falls back to its static
    // suggestion list rather than surfacing a broken search box.
    return NextResponse.json({ items: [] });
  }
}
