import { NextResponse } from "next/server";

/** Which sign-in providers this deployment has set up. Read at request time so a client id can be added without rebuilding the image. */
export async function GET() {
  return NextResponse.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null, turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || null });
}
