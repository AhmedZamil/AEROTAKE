import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { notifyError } from "@/lib/alerts";
import { TENANT_HEADERS } from "@/lib/tenants";
import { callBackend, TenantHeaders } from "@/lib/backend-client";
import { setDeviceToken, setSession } from "@/lib/auth-session";

interface VerifyDeviceBody {
  userId?: string;
  code?: string;
  rememberMe?: boolean;
}

/**
 * Proxies to POST /api/v1/auth/verify-device — the MFA completion step after
 * a login came back with `deviceVerificationRequired`. Unlike login, this
 * response always includes a new `deviceToken`, which this route persists so
 * future logins from this browser skip verification.
 */
export async function POST(request: NextRequest) {
  const h = await headers();
  const tenantId = h.get(TENANT_HEADERS.tenantId);
  if (!tenantId) {
    return NextResponse.json(
      { error: "tenant_unresolved", message: "Middleware did not stamp a tenant." },
      { status: 500 }
    );
  }
  const tenant: TenantHeaders = {
    tenantId,
    channel: h.get(TENANT_HEADERS.channel) ?? "B2C",
    agentId: h.get(TENANT_HEADERS.agentId),
    agentTier: h.get(TENANT_HEADERS.agentTier),
  };

  let body: VerifyDeviceBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "Request body must be JSON." }, { status: 400 });
  }
  if (!body.userId || !body.code) {
    return NextResponse.json(
      { error: "invalid_request", message: "userId and code are required." },
      { status: 400 }
    );
  }

  try {
    const upstream = await callBackend(
      "/api/v1/auth/verify-device",
      { method: "POST", body: JSON.stringify({ userId: body.userId, code: body.code }) },
      tenant
    );
    const payload = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      return NextResponse.json(payload, { status: upstream.status });
    }

    await setSession({
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      expiresAt: payload.expiresAt,
      persistent: Boolean(body.rememberMe),
    });
    if (payload.deviceToken) {
      await setDeviceToken(payload.deviceToken);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[auth/verify-device] core-engine unreachable:", err);
    await notifyError("Auth verify-device: core-engine unreachable", err, { tenantId });
    return NextResponse.json(
      { error: "upstream_unavailable", message: "Verification is temporarily unavailable. Try again shortly." },
      { status: 502 }
    );
  }
}
