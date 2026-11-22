import { NextRequest, NextResponse } from "next/server";
import { getDeviceToken, setSession, verifyAdminAccessToken } from "@/server/session";

const CORE_ENGINE_URL = process.env.CORE_ENGINE_REST_URL ?? "http://localhost:8080";

interface LoginBody {
  email?: string;
  password?: string;
  tenantId?: string;
  rememberMe?: boolean;
}

export async function POST(request: NextRequest) {
  let body: LoginBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "Request body must be JSON." }, { status: 400 });
  }

  const email = body.email?.trim();
  const tenantId = body.tenantId?.trim();
  if (!email || !body.password || !tenantId) {
    return NextResponse.json(
      { error: "invalid_request", message: "Email, password, and tenant are required." },
      { status: 400 },
    );
  }

  const deviceToken = await getDeviceToken();

  let upstream: Response;
  try {
    upstream = await fetch(`${CORE_ENGINE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Tenant-ID": tenantId },
      body: JSON.stringify({ email, password: body.password, deviceToken }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: "upstream_unavailable", message: "Login is temporarily unavailable." },
      { status: 502 },
    );
  }

  const payload = (await upstream.json().catch(() => ({}))) as {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
    deviceVerificationRequired?: boolean;
    userId?: string;
    error?: string;
    message?: string;
  };

  if (!upstream.ok) {
    return NextResponse.json(payload, { status: upstream.status });
  }

  if (payload.deviceVerificationRequired) {
    return NextResponse.json({
      success: true,
      deviceVerificationRequired: true,
      userId: payload.userId,
    });
  }

  if (!payload.accessToken || !payload.refreshToken || !payload.expiresAt) {
    return NextResponse.json(
      { error: "invalid_response", message: "Login did not return a session." },
      { status: 502 },
    );
  }

  const claims = await verifyAdminAccessToken(payload.accessToken, email);
  if (!claims || claims.tenantId !== tenantId) {
    return NextResponse.json(
      {
        error: "not_platform_admin",
        message: "This account is not a platform admin for that tenant.",
      },
      { status: 403 },
    );
  }

  await setSession({
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    expiresAt: payload.expiresAt,
    email,
    persistent: Boolean(body.rememberMe),
  });

  return NextResponse.json({ success: true, deviceVerificationRequired: false });
}
