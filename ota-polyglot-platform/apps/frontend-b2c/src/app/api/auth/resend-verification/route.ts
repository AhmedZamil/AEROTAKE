import { NextRequest, NextResponse } from "next/server";
import { coreFetch } from "@/server/core-rest";
import { crossSiteRefusal, customerToken, relay, unavailable, unknownSite } from "@/server/session";

/** Sends the "confirm your email" message again to the signed-in customer. */
export async function POST(request: NextRequest) {
  const refused = crossSiteRefusal(request);
  if (refused) return refused;
  try {
    const session = await customerToken();
    if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    const result = await coreFetch("/api/v1/customers/me/resend-verification", { method: "POST", body: {}, bearer: session.token });
    return result === "unknown_site" ? unknownSite() : relay(result);
  } catch (err) {
    console.error("[auth/resend-verification]", err);
    return unavailable();
  }
}
