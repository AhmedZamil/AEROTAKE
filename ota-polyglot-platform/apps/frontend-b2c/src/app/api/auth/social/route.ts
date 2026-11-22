import { NextRequest, NextResponse } from "next/server";
import { coreFetch } from "@/server/core-rest";
import { crossSiteRefusal, relay, storeSession, unavailable, unknownSite } from "@/server/session";

/** Exchanges the provider's ID token for a customer session. Core verifies the token; the tokens it issues go into httpOnly cookies. */
export async function POST(request: NextRequest) {
  const refused = crossSiteRefusal(request);
  if (refused) return refused;
  const body = (await request.json().catch(() => null)) as { provider?: string; idToken?: string; nonce?: string } | null;
  if (!body?.provider || !body.idToken) return NextResponse.json({ error: "invalid_request", message: "provider and idToken are required." }, { status: 400 });

  try {
    const result = await coreFetch("/api/v1/auth/customer/social", { body: { provider: body.provider, idToken: body.idToken, nonce: body.nonce } });
    if (result === "unknown_site") return unknownSite();
    if (result.status !== 200) return relay(result);
    const session = result.body as Parameters<typeof storeSession>[0] & { isNewCustomer?: boolean };
    await storeSession(session);
    return NextResponse.json({ customer: session.customer, isNewCustomer: session.isNewCustomer ?? false });
  } catch (err) {
    console.error("[auth/social]", err);
    return unavailable();
  }
}
