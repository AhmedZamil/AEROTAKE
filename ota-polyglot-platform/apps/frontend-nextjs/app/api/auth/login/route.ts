import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { notifyError } from "@/lib/alerts";
import { TENANT_HEADERS } from "@/lib/tenants";
import { callBackend, TenantHeaders } from "@/lib/backend-client";
import { getDeviceToken, setSession } from "@/lib/auth-session";

interface LoginBody {
  email?: string;
  password?: string;
  rememberMe?: boolean;
}

/**
 * Proxies to POST /api/v1/auth/login. Two distinct success shapes come back
 * from the backend: a known device gets tokens directly (session cookie set,
 * done); an unknown device gets `{deviceVerificationRequired, userId}` (no
 * cookie yet — the client must complete /api/auth/verify-device first). The
 * device token itself is read from this server's own cookie, never sent by
 * the client — the browser doesn't have access to it.
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

  let body: LoginBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "Request body must be JSON." }, { status: 400 });
  }
  if (!body.email || !body.password) {
    return NextResponse.json(
      { error: "invalid_request", message: "email and password are required." },
      { status: 400 }
    );
  }

  const deviceToken = await getDeviceToken();

  try {
    const upstream = await callBackend(
      "/api/v1/auth/login",
      { method: "POST", body: JSON.stringify({ email: body.email, password: body.password, deviceToken }) },
      tenant
    );
    const payload = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      return NextResponse.json(payload, { status: upstream.status });
    }

    if (payload.deviceVerificationRequired) {
      return NextResponse.json({ success: true, deviceVerificationRequired: true, userId: payload.userId });
    }

    await setSession({
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      expiresAt: payload.expiresAt,
      persistent: Boolean(body.rememberMe),
    });
    return NextResponse.json({ success: true, deviceVerificationRequired: false });
  } catch (err) {
    console.error("[auth/login] core-engine unreachable:", err);
    await notifyError("Auth login: core-engine unreachable", err, { tenantId });
    return NextResponse.json(
      { error: "upstream_unavailable", message: "Login is temporarily unavailable. Try again shortly." },
      { status: 502 }
    );
  }
}
