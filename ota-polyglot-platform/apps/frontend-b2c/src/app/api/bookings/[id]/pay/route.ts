import { NextRequest, NextResponse } from "next/server";
import { coreFetch } from "@/server/core-rest";
import { crossSiteRefusal, customerToken, relay, unavailable, unknownSite } from "@/server/session";

/**
 * Starts SSLCommerz hosted checkout for a Pending booking the signed-in customer owns.
 * Returns { gatewayUrl, paymentId, tranId, replayed } for the browser to navigate to.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const refused = crossSiteRefusal(request);
  if (refused) return refused;
  const session = await customerToken();
  if (!session) {
    return NextResponse.json({ error: "login_required", message: "Sign in to pay for a booking." }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    return NextResponse.json({ error: "invalid_request", message: "A valid booking id is required." }, { status: 400 });
  }

  const b = (await request.json().catch(() => null)) as { idempotencyKey?: string; method?: string } | null;
  const method = b?.method === "wallet" ? "wallet" : "sslcommerz";
  try {
    const result = await coreFetch(`/api/v1/customers/me/bookings/${id}/pay`, {
      body: { idempotencyKey: b?.idempotencyKey, method },
      bearer: session.token,
    });
    return result === "unknown_site" ? unknownSite() : relay(result);
  } catch (err) {
    console.error("[bookings pay]", err);
    return unavailable();
  }
}
