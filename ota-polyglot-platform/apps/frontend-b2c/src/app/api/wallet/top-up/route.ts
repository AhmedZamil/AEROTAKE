import { NextRequest, NextResponse } from "next/server";
import { coreFetch } from "@/server/core-rest";
import { crossSiteRefusal, customerToken, relay, unavailable, unknownSite } from "@/server/session";

/** Adds money in local development only. Production refuses this until a real top-up gateway exists. */
export async function POST(request: NextRequest) {
  const refused = crossSiteRefusal(request);
  if (refused) return refused;
  const session = await customerToken();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const b = (await request.json().catch(() => null)) as { amount?: number } | null;
  try {
    const result = await coreFetch("/api/v1/customers/me/wallet/top-up", {
      body: { amount: b?.amount },
      bearer: session.token,
    });
    return result === "unknown_site" ? unknownSite() : relay(result);
  } catch (err) {
    console.error("[wallet top-up]", err);
    return unavailable();
  }
}
