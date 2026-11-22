import { NextRequest, NextResponse } from "next/server";
import { coreFetch } from "@/server/core-rest";
import { crossSiteRefusal, relay, unavailable, unknownSite } from "@/server/session";

/** Redeems the link from the confirmation email (the token arrives in the URL fragment, so it reaches this server only in this POST). */
export async function POST(request: NextRequest) {
  const refused = crossSiteRefusal(request);
  if (refused) return refused;
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: "invalid_request", message: "Request body must be JSON." }, { status: 400 });
  try {
    const result = await coreFetch("/api/v1/auth/customer/verify-email", { body: { token: b.token } });
    return result === "unknown_site" ? unknownSite() : relay(result);
  } catch (err) {
    console.error("[auth/verify-email]", err);
    return unavailable();
  }
}
