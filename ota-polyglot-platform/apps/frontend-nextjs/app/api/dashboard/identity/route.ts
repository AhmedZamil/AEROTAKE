import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { TENANT_HEADERS } from "@/lib/tenants";
import { verifyAndRefreshSession } from "@/lib/auth-session";
import { callBackendWithAuth, TenantHeaders } from "@/lib/backend-client";

/**
 * Real identity for the dashboard nav — replaces PartnerProfileProvider's
 * fake defaults. Deliberately separate from GET /api/auth/session (used for
 * cheap "am I still logged in" checks) so that lightweight check never also
 * triggers this backend credit-balance fetch.
 *
 * No agentId (e.g. a platform Admin) is a valid, authenticated state, not
 * an error — the response just carries nulls for the agency fields.
 */
export async function GET() {
  const h = await headers();
  const tenantId = h.get(TENANT_HEADERS.tenantId) ?? "";

  const claims = await verifyAndRefreshSession(tenantId);
  if (!claims) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  if (!claims.agentId) {
    return NextResponse.json({
      displayName: null,
      tier: null,
      creditLimit: null,
      creditUsed: null,
      available: null,
    });
  }

  const tenant: TenantHeaders = {
    tenantId: claims.tenantId,
    channel: h.get(TENANT_HEADERS.channel) ?? "CHANNEL_TYPE_B2B_AGENT",
    agentId: claims.agentId,
    agentTier: h.get(TENANT_HEADERS.agentTier),
  };

  try {
    const upstream = await callBackendWithAuth(`/api/v1/agents/${claims.agentId}/credit`, { method: "GET" }, tenant);
    if (!upstream.ok) {
      return NextResponse.json({
        displayName: null,
        tier: null,
        creditLimit: null,
        creditUsed: null,
        available: null,
      });
    }
    const agent = await upstream.json();
    return NextResponse.json({
      displayName: agent.displayName ?? null,
      tier: agent.tier ?? null,
      creditLimit: agent.creditLimit ?? null,
      creditUsed: agent.creditUsed ?? null,
      available: agent.available ?? null,
    });
  } catch {
    // core-engine unreachable — degrade to "no agency data" rather than
    // failing the whole nav; this isn't the money-moving path.
    return NextResponse.json({
      displayName: null,
      tier: null,
      creditLimit: null,
      creditUsed: null,
      available: null,
    });
  }
}
