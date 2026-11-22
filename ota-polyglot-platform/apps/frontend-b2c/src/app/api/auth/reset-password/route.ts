import { NextRequest, NextResponse } from "next/server";
import { coreFetch } from "@/server/core-rest";
import { clearSession, crossSiteRefusal, relay, unavailable, unknownSite } from "@/server/session";

/** Sets a new password from the emailed link. Core ends every session of that customer, so this browser is signed out too: clear our cookies. */
export async function POST(request: NextRequest) {
  const refused = crossSiteRefusal(request);
  if (refused) return refused;
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: "invalid_request", message: "Request body must be JSON." }, { status: 400 });
  try {
    const result = await coreFetch("/api/v1/auth/customer/reset-password", { body: { token: b.token, password: b.password } });
    if (result === "unknown_site") return unknownSite();
    if (result.status === 204) await clearSession();
    return relay(result);
  } catch (err) {
    console.error("[auth/reset-password]", err);
    return unavailable();
  }
}
