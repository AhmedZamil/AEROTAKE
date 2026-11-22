import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { TENANT_HEADERS } from "@/lib/tenants";
import { decodeAccessTokenUnverified, getSession, isExpired, performRefresh, SessionData } from "@/lib/auth-session";

/**
 * Session status check for client components — the session cookie is
 * httpOnly, so this is the only way client-side code can know whether one
 * exists. Transparently refreshes an expired access token before answering,
 * so callers only ever see "authenticated" or "not" (never a bare "expired"
 * state to handle themselves).
 */
function authenticatedResponse(session: SessionData) {
  const claims = decodeAccessTokenUnverified(session.accessToken);
  return NextResponse.json({
    authenticated: true,
    user: claims
      ? { sub: claims.sub, role: claims.role, tenantId: claims.tenant_id, agentId: claims.agent_id }
      : null,
  });
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }
  if (!isExpired(session.expiresAt)) {
    return authenticatedResponse(session);
  }

  const h = await headers();
  const tenantId = h.get(TENANT_HEADERS.tenantId);
  const refreshed = tenantId ? await performRefresh(tenantId) : null;
  return refreshed ? authenticatedResponse(refreshed) : NextResponse.json({ authenticated: false });
}
