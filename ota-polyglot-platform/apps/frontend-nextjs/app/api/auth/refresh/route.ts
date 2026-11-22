import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { TENANT_HEADERS } from "@/lib/tenants";
import { performRefresh } from "@/lib/auth-session";

/**
 * Explicit refresh trigger. The refresh token itself lives server-side in
 * the `ota_session` cookie — nothing needs to come from the client body.
 * The same `performRefresh` this calls also runs transparently from
 * GET /api/auth/session and from callBackendWithAuth's 401 handling, so this
 * route is one of three callers, not the only place refresh happens.
 */
export async function POST() {
  const h = await headers();
  const tenantId = h.get(TENANT_HEADERS.tenantId);
  if (!tenantId) {
    return NextResponse.json(
      { error: "tenant_unresolved", message: "Middleware did not stamp a tenant." },
      { status: 500 }
    );
  }

  const session = await performRefresh(tenantId);
  if (!session) {
    return NextResponse.json(
      { error: "invalid_refresh_token", message: "Session could not be refreshed. Please log in again." },
      { status: 401 }
    );
  }
  return NextResponse.json({ success: true });
}
