import { NextResponse } from "next/server";
import { coreFetch } from "@/server/core-rest";
import { clearSession, customerToken, unavailable } from "@/server/session";

/** Who is signed in ({customer: null} if nobody — not an error, so every page load of a signed-out visitor is not a red line in the console). */
export async function GET() {
  try {
    const session = await customerToken();
    if (!session) return NextResponse.json({ customer: null });
    if (session.profile) return NextResponse.json({ customer: session.profile });

    const result = await coreFetch("/api/v1/customers/me", { bearer: session.token });
    if (result === "unknown_site") return NextResponse.json({ customer: null });
    if (result.status === 401) {
      await clearSession();
      return NextResponse.json({ customer: null });
    }
    return NextResponse.json({ customer: result.body }, { status: result.status });
  } catch (err) {
    console.error("[auth/me]", err);
    return unavailable();
  }
}
