import { NextRequest, NextResponse } from "next/server";
import { callCore, GRPC_DEADLINES, GrpcCallError } from "@/server/grpc-client";
import { crossSiteRefusal, unavailable, unknownSite } from "@/server/session";
import { resolveStorefront } from "@/server/tenant";

/** Is the offer still bookable at the price the visitor was shown? Answered by the airline's system through core; the price is core's. */
export async function POST(request: NextRequest) {
  const refused = crossSiteRefusal(request);
  if (refused) return refused;
  const b = (await request.json().catch(() => null)) as { offerId?: string; expectedSellPrice?: number } | null;
  if (!b?.offerId || typeof b.expectedSellPrice !== "number") return NextResponse.json({ error: "invalid_request", message: "offerId and expectedSellPrice are required." }, { status: 400 });

  try {
    const tenant = await resolveStorefront();
    if (!tenant) return unknownSite();
    const r = await callCore<unknown, { matches: boolean; currentSellPrice: number; failureReason: string }>(
      "RevalidateOffer",
      { tenant: { tenantId: tenant.tenantId, channel: "CHANNEL_TYPE_B2C" }, offerId: b.offerId, expectedSellPrice: b.expectedSellPrice },
      GRPC_DEADLINES.revalidate,
    );
    return NextResponse.json({ matches: r.matches, currentSellPrice: Number(r.currentSellPrice) || 0, failureReason: r.failureReason || "" });
  } catch (err) {
    if (err instanceof GrpcCallError) console.error("[revalidate] gRPC", err.code, err.message);
    else console.error("[revalidate]", err);
    return unavailable();
  }
}
