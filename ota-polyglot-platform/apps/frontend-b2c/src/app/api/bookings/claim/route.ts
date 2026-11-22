import { NextRequest, NextResponse } from "next/server";
import { coreFetch } from "@/server/core-rest";
import { crossSiteRefusal, customerToken, relay, unavailable, unknownSite } from "@/server/session";

/** Adds a booking made as a guest to the signed-in customer's account, with the token from its emailed link. */
export async function POST(request: NextRequest) {
  const refused = crossSiteRefusal(request);
  if (refused) return refused;
  const b = (await request.json().catch(() => null)) as { claimToken?: string } | null;
  try {
    const session = await customerToken();
    if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    const result = await coreFetch("/api/v1/customers/me/bookings/claim", { body: { claimToken: b?.claimToken }, bearer: session.token });
    return result === "unknown_site" ? unknownSite() : relay(result);
  } catch (err) {
    console.error("[bookings/claim]", err);
    return unavailable();
  }
}
