import { NextRequest, NextResponse } from "next/server";

const CORE_REST = process.env.CORE_ENGINE_REST_URL ?? "http://localhost:8080";

/**
 * SSLCommerz redirects the browser here with a POST form (val_id, tran_id, …).
 * The App Router page at /booking/payment/return only handles GET and dropped that body,
 * so payment stayed Initiated whenever the separate IPN URL was unreachable (common on localhost).
 *
 * We forward the form to core's IPN handler (same validation + Paid + ticket), then 303 to the UI.
 */
async function finish(request: NextRequest) {
  const statusRaw = request.nextUrl.searchParams.get("status") ?? "fail";
  const status = ["success", "fail", "cancel"].includes(statusRaw) ? statusRaw : "fail";
  const bookingId = request.nextUrl.searchParams.get("bookingId") ?? "";
  const topUpId = request.nextUrl.searchParams.get("topUpId") ?? "";

  if (status === "success" && request.method === "POST") {
    try {
      const form = await request.formData();
      const valId = String(form.get("val_id") ?? "").trim();
      if (valId) {
        const body = new URLSearchParams();
        for (const [key, value] of form.entries()) body.append(key, String(value));
        const ipn = await fetch(`${CORE_REST}/api/v1/payments/sslcommerz/ipn`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
          cache: "no-store",
        });
        if (!ipn.ok) {
          console.error("[sslcommerz browser-return] core IPN returned", ipn.status, await ipn.text().catch(() => ""));
        }
      } else {
        console.warn("[sslcommerz browser-return] success POST without val_id — payment not confirmed via return");
      }
    } catch (err) {
      console.error("[sslcommerz browser-return] forward failed", err);
    }
  }

  // Prefer the configured storefront origin. SSLCommerz / some browsers hit http://[::]:3001,
  // which does not share cookies with http://localhost:3001 — so the return page looked logged-out and blank.
  const configured = (process.env.STOREFRONT_PUBLIC_URL ?? "").trim().replace(/\/$/, "");
  const origin = configured || normalizeLoopbackOrigin(request.nextUrl.origin);
  const dest = new URL(topUpId ? "/booking/wallet/return" : "/booking/payment/return", origin);
  dest.searchParams.set("status", status);
  if (bookingId) dest.searchParams.set("bookingId", bookingId);
  if (topUpId) dest.searchParams.set("topUpId", topUpId);
  return NextResponse.redirect(dest, 303);
}

function normalizeLoopbackOrigin(origin: string): string {
  try {
    const u = new URL(origin);
    if (u.hostname === "[::]" || u.hostname === "[::1]" || u.hostname === "127.0.0.1") {
      u.hostname = "localhost";
    }
    return u.origin;
  } catch {
    return origin;
  }
}

export async function POST(request: NextRequest) {
  return finish(request);
}

/** Manual open / bookmark — no gateway body to process. */
export async function GET(request: NextRequest) {
  return finish(request);
}
