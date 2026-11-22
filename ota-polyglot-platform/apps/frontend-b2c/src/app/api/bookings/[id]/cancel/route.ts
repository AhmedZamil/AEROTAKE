import { NextRequest, NextResponse } from "next/server";
import { coreFetch } from "@/server/core-rest";
import { crossSiteRefusal, customerToken, relay, unavailable, unknownSite } from "@/server/session";

/** P5-20: signed-in customer asks to cancel their own booking. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const refused = crossSiteRefusal(request);
  if (refused) return refused;
  const session = await customerToken();
  if (!session) {
    return NextResponse.json({ error: "login_required", message: "Sign in to cancel a booking." }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    return NextResponse.json({ error: "invalid_request", message: "A valid booking id is required." }, { status: 400 });
  }

  const b = (await request.json().catch(() => null)) as { reason?: string } | null;
  try {
    const result = await coreFetch(`/api/v1/customers/me/bookings/${id}/cancel`, {
      body: { reason: b?.reason },
      bearer: session.token,
    });
    return result === "unknown_site" ? unknownSite() : relay(result);
  } catch (err) {
    console.error("[bookings cancel]", err);
    return unavailable();
  }
}
