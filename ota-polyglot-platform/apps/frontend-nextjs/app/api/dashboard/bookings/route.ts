import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { TENANT_HEADERS } from "@/lib/tenants";
import { verifyAndRefreshSession } from "@/lib/auth-session";
import { callBackendWithAuth, TenantHeaders } from "@/lib/backend-client";

/**
 * Recent bookings for the dashboard-home widget — wraps the new
 * GET /api/v1/agents/{agentId}/bookings endpoint. Same shape and same
 * "degrade quietly, don't error" philosophy as app/api/dashboard/identity:
 * this is a decoration widget, not the money-moving path.
 */
export async function GET() {
  const h = await headers();
  const tenantId = h.get(TENANT_HEADERS.tenantId) ?? "";

  const claims = await verifyAndRefreshSession(tenantId);
  if (!claims) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  if (!claims.agentId) {
    return NextResponse.json([]);
  }

  const tenant: TenantHeaders = {
    tenantId: claims.tenantId,
    channel: h.get(TENANT_HEADERS.channel) ?? "CHANNEL_TYPE_B2B_AGENT",
    agentId: claims.agentId,
    agentTier: h.get(TENANT_HEADERS.agentTier),
  };

  try {
    const upstream = await callBackendWithAuth(
      `/api/v1/agents/${claims.agentId}/bookings?take=10`,
      { method: "GET" },
      tenant,
    );
    if (!upstream.ok) {
      return NextResponse.json([]);
    }
    const bookings = await upstream.json();
    return NextResponse.json(bookings);
  } catch {
    // core-engine unreachable — degrade to an empty list rather than
    // failing the whole home page over a decoration widget.
    return NextResponse.json([]);
  }
}
