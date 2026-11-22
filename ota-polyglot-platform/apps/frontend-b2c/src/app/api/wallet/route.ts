import { NextResponse } from "next/server";
import { coreFetch } from "@/server/core-rest";
import { customerToken, relay, unavailable, unknownSite } from "@/server/session";

/** The signed-in customer's Aerotake balance. */
export async function GET() {
  try {
    const session = await customerToken();
    if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    const result = await coreFetch("/api/v1/customers/me/wallet", { bearer: session.token });
    return result === "unknown_site" ? unknownSite() : relay(result);
  } catch (err) {
    console.error("[wallet GET]", err);
    return unavailable();
  }
}
