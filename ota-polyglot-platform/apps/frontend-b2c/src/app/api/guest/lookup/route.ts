import { NextRequest, NextResponse } from "next/server";
import { coreFetch } from "@/server/core-rest";
import { crossSiteRefusal, relay, unavailable, unknownSite } from "@/server/session";

/** Booking reference + a traveller's surname. */
export async function POST(request: NextRequest) {
  const refused = crossSiteRefusal(request);
  if (refused) return refused;
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: "invalid_request", message: "Request body must be JSON." }, { status: 400 });
  try {
    const result = await coreFetch("/api/v1/guest/bookings/lookup", { body: b });
    return result === "unknown_site" ? unknownSite() : relay(result);
  } catch (err) {
    console.error("[guest/lookup]", err);
    return unavailable();
  }
}
