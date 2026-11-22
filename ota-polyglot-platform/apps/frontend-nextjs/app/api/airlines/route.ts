import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { CORE_ENGINE_URL } from "@/lib/backend-client";
import { TENANT_HEADERS } from "@/lib/tenants";

/**
 * Airlines are global reference data (no TenantId in core-engine's Airline
 * table) and AirlinesController is [AllowAnonymous], so this needs no
 * session — but, same as airports/route.ts, core-engine's
 * TenantResolutionMiddleware still requires X-Tenant-ID on every non-gRPC
 * request regardless of the controller's own auth/scoping. Unlike airports
 * this isn't a per-keystroke typeahead (the Preferred Airline field is a
 * plain <select>, fetched once on mount), so `revalidate` can be much longer.
 */
export async function GET() {
  const h = await headers();
  const tenantId = h.get(TENANT_HEADERS.tenantId);
  if (!tenantId) {
    return NextResponse.json(
      { error: "tenant_unresolved", message: "Middleware did not stamp a tenant." },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(`${CORE_ENGINE_URL}/api/v1/airlines`, {
      headers: { [TENANT_HEADERS.tenantId]: tenantId },
      next: { revalidate: 3600 },
    });
    if (!response.ok) {
      return NextResponse.json({ items: [] });
    }
    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    // Degrade quietly — the dropdown falls back to its static "All Airlines"
    // entry rather than surfacing a broken select.
    return NextResponse.json({ items: [] });
  }
}
