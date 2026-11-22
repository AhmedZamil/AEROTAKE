import { NextResponse } from "next/server";
import { verifiedAdminSession } from "./session";

const CORE_ENGINE_URL = process.env.CORE_ENGINE_REST_URL ?? "http://localhost:8080";

/** Forwards a Platform Admin call to core. The bearer token is never sent to the browser. */
export async function proxyAdmin(path: string, init?: { method?: string; body?: string }): Promise<NextResponse> {
  const session = await verifiedAdminSession();
  if (!session) {
    return NextResponse.json(
      { error: "unauthenticated", message: "Sign in as a platform admin." },
      { status: 401 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${CORE_ENGINE_URL}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: "upstream_unavailable", message: "Core is unreachable." },
      { status: 502 },
    );
  }

  if (upstream.status === 204) return new NextResponse(null, { status: 204 });
  const body = await upstream.text();
  return new NextResponse(body.length > 0 ? body : null, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
