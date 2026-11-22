import { NextResponse } from "next/server";
import { clearSession, toAuthUser, verifiedAdminSession } from "@/server/session";

export async function GET() {
  const session = await verifiedAdminSession();
  if (!session) {
    await clearSession();
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({ user: toAuthUser(session.claims) });
}
