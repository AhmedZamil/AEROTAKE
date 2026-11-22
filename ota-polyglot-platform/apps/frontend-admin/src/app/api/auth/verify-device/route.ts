import { NextRequest, NextResponse } from "next/server";
import { setDeviceToken, setSession, verifyAdminAccessToken } from "@/server/session";

const CORE_ENGINE_URL = process.env.CORE_ENGINE_REST_URL ?? "http://localhost:8080";

interface VerifyBody {
  userId?: string;
  code?: string;
  email?: string;
  tenantId?: string;
  rememberMe?: boolean;
}

export async function POST(request: NextRequest) {
  let body: VerifyBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "Request body must be JSON." }, { status: 400 });
  }

  const email = body.email?.trim();
  const tenantId = body.tenantId?.trim();
  if (!body.userId || !body.code || !email || !tenantId) {
    return NextResponse.json(
      { error: "invalid_request", message: "A verification code is required." },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${CORE_ENGINE_URL}/api/v1/auth/verify-device`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Tenant-ID": tenantId },
      body: JSON.stringify({ userId: body.userId, code: body.code.trim() }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: "upstream_unavailable", message: "Verification is temporarily unavailable." },
      { status: 502 },
    );
  }

  const payload = (await upstream.json().catch(() => ({}))) as {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
    deviceToken?: string;
    message?: string;
    error?: string;
  };

  if (!upstream.ok) return NextResponse.json(payload, { status: upstream.status });
  if (!payload.accessToken || !payload.refreshToken || !payload.expiresAt) {
    return NextResponse.json(
      { error: "invalid_response", message: "Verification did not return a session." },
      { status: 502 },
    );
  }

  const claims = await verifyAdminAccessToken(payload.accessToken, email);
  if (!claims || claims.tenantId !== tenantId) {
    return NextResponse.json(
      { error: "not_platform_admin", message: "This account is not a platform admin for that tenant." },
      { status: 403 },
    );
  }

  if (payload.deviceToken) await setDeviceToken(payload.deviceToken);
  await setSession({
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    expiresAt: payload.expiresAt,
    email,
    persistent: Boolean(body.rememberMe),
  });

  return NextResponse.json({ success: true });
}
