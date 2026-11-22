import { NextRequest, NextResponse } from "next/server";
import { notifyError } from "../../../lib/alerts";

/**
 * Server-side sink for client-reported errors (see app/global-error.tsx).
 * global-error.tsx is a Client Component and can't import lib/alerts.ts
 * directly — that would bundle nodemailer and leak SMTP env vars into the
 * browser. It posts the error here instead, where secrets stay server-side.
 */
export async function POST(request: NextRequest) {
  let body: { message?: string; stack?: string; digest?: string; path?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Malformed report body — nothing useful to alert on.
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const error = new Error(body.message ?? "Unknown client-side error");
  error.stack = body.stack ?? error.stack;

  console.error("[global-error] unhandled client render error:", body);
  await notifyError("Unhandled client-side render error", error, {
    digest: body.digest ?? "",
    path: body.path ?? "",
  });

  return NextResponse.json({ ok: true });
}
