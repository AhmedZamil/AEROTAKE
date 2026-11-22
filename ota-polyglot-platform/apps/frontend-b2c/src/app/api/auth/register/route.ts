import { NextRequest, NextResponse } from "next/server";
import { coreFetch } from "@/server/core-rest";
import { crossSiteRefusal, relay, storeSession, unavailable, unknownSite } from "@/server/session";

/** Create an account with a mobile number, an email and a password, and sign in. Core decides everything (password rules, address already taken); the tokens it issues go into httpOnly cookies. */
export async function POST(request: NextRequest) {
  const refused = crossSiteRefusal(request);
  if (refused) return refused;
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: "invalid_request", message: "Request body must be JSON." }, { status: 400 });

  try {
    const result = await coreFetch("/api/v1/auth/customer/register", { body: { email: b.email, password: b.password, phone: b.phone, captchaToken: b.captchaToken } });
    if (result === "unknown_site") return unknownSite();
    if (result.status !== 200) return relay(result); // wrong password, address taken, too many attempts: core's own words
    const session = result.body as Parameters<typeof storeSession>[0] & { isNewCustomer?: boolean; attachedGuestBookings?: number };
    await storeSession(session);
    return NextResponse.json({ customer: session.customer, isNewCustomer: session.isNewCustomer ?? false, attachedGuestBookings: session.attachedGuestBookings ?? 0 });
  } catch (err) {
    console.error("[auth/register]", err);
    return unavailable();
  }
}
