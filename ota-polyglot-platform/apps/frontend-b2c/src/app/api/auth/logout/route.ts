import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { coreFetch } from "@/server/core-rest";
import { clearSession, crossSiteRefusal } from "@/server/session";

/** Ends the session in core (so the tokens stop working everywhere, not just here) and clears the cookies. */
export async function POST(request: NextRequest) {
  const refused = crossSiteRefusal(request);
  if (refused) return refused;
  const refresh = (await cookies()).get("b2c_rt")?.value;
  if (refresh) await coreFetch("/api/v1/auth/customer/logout", { body: { refreshToken: refresh } }).catch(() => null);
  await clearSession();
  return new NextResponse(null, { status: 204 });
}
