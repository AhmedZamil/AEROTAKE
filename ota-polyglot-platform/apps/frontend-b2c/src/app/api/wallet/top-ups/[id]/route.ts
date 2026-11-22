import { NextResponse } from "next/server";
import { coreFetch } from "@/server/core-rest";
import { customerToken, relay, unavailable, unknownSite } from "@/server/session";

/** Status of one card top-up, plus the balance after it is confirmed. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await customerToken();
    if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    const { id } = await ctx.params;
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
      return NextResponse.json({ error: "invalid_request", message: "A valid top-up id is required." }, { status: 400 });
    }
    const result = await coreFetch(`/api/v1/customers/me/wallet/top-ups/${id}`, { bearer: session.token });
    return result === "unknown_site" ? unknownSite() : relay(result);
  } catch (err) {
    console.error("[wallet top-up status]", err);
    return unavailable();
  }
}
