import { NextResponse } from "next/server";
import { clearDeviceToken, clearSession } from "@/lib/auth-session";

/**
 * No backend call — core-engine has no /logout endpoint (stateless JWTs,
 * no revocation list). Logout is entirely a matter of clearing local cookies.
 *
 * The device-trust cookie is cleared too, not left to survive logout: this
 * is a B2B agent portal where a workstation may be shared, and since the
 * backend can't revoke a device token server-side, deleting it here is the
 * only lever available to bound exposure once someone explicitly signs out.
 */
export async function POST() {
  await clearSession();
  await clearDeviceToken();
  return NextResponse.json({ success: true });
}
