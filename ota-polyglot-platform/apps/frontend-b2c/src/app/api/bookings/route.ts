import { NextRequest, NextResponse } from "next/server";
import { coreFetch } from "@/server/core-rest";
import { crossSiteRefusal, customerToken, relay, unavailable, unknownSite } from "@/server/session";

/** The signed-in customer's bookings. */
export async function GET() {
  try {
    const session = await customerToken();
    if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    const result = await coreFetch("/api/v1/customers/me/bookings", { bearer: session.token });
    return result === "unknown_site" ? unknownSite() : relay(result);
  } catch (err) {
    console.error("[bookings GET]", err);
    return unavailable();
  }
}

/**
 * Reserve seats for the signed-in customer. Anonymous callers are refused (P5-17) — search stays public; holding seats needs an account.
 * Only the fields the visitor chose are forwarded — the price is core's, and the total sent is just "what I was shown", so a change
 * comes back as 409 price_changed instead of a surprise.
 */
export async function POST(request: NextRequest) {
  const refused = crossSiteRefusal(request);
  if (refused) return refused;
  const session = await customerToken();
  if (!session) {
    return NextResponse.json(
      { error: "login_required", message: "Sign in to reserve seats." },
      { status: 401 },
    );
  }
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: "invalid_request", message: "Request body must be JSON." }, { status: 400 });

  const payload = {
    offerId: b.offerId,
    offerIds: b.offerIds,
    idempotencyKey: b.idempotencyKey,
    contactEmail: b.contactEmail,
    contactPhone: b.contactPhone,
    expectedTotal: b.expectedTotal,
    travelers: b.travelers,
  };
  try {
    const result = await coreFetch("/api/v1/customers/me/bookings", { body: payload, bearer: session.token });
    return result === "unknown_site" ? unknownSite() : relay(result);
  } catch (err) {
    console.error("[bookings POST]", err);
    return unavailable();
  }
}
