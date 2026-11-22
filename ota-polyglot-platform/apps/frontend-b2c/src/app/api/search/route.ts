import { NextRequest, NextResponse } from "next/server";
import type { CabinClass } from "@/lib/flight-types";
import { callCore, GRPC_DEADLINES, GrpcCallError } from "@/server/grpc-client";
import { ServiceCredentialError } from "@/server/service-token";
import { mapOffers } from "@/server/offers";
import { resolveStorefront, TenantUnavailableError } from "@/server/tenant";

const IATA = /^[A-Z]{3}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CABINS: Record<CabinClass, string> = { economy: "ECONOMY", premium: "PREMIUM_ECONOMY", business: "BUSINESS", first: "FIRST" };

function bad(message: string) {
  return NextResponse.json({ error: "invalid_request", message }, { status: 400 });
}

/**
 * Flight search for the storefront. The browser sends only what the visitor chose; the tenant comes from the request's host
 * (never from the body), the credential is this app's service token, and the price on every offer is core's — computed with the
 * consumer markup rule, in core's currency, and never containing a supplier net rate.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return bad("Request body must be JSON.");
  }

  const origin = String(body.origin ?? "").toUpperCase();
  const destination = String(body.destination ?? "").toUpperCase();
  const checkIn = String(body.checkIn ?? "");
  const checkOut = body.checkOut ? String(body.checkOut) : "";
  const adults = Number(body.adults ?? 1);
  const children = Number(body.children ?? 0);
  const infants = Number(body.infants ?? 0);
  const cabin = (Object.keys(CABINS).includes(String(body.cabin)) ? body.cabin : "economy") as CabinClass;
  // "fast": the airlines that answer in a few seconds. "slow": the ones that take longer, asked for separately (with a long time limit) so they
  // never hold back the fares that are ready. Neither names a supplier; core decides which is which. Omitted: everything at once.
  const speed = body.speed === "fast" || body.speed === "slow" ? (body.speed as "fast" | "slow") : null;

  if (!IATA.test(origin) || !IATA.test(destination) || origin === destination) return bad("Choose two different airports.");
  if (!DATE.test(checkIn) || (checkOut && !DATE.test(checkOut))) return bad("Dates must be YYYY-MM-DD.");
  if (checkOut && checkOut < checkIn) return bad("The return date is before the departure.");
  if (!Number.isInteger(adults) || adults < 1 || adults > 9) return bad("Choose between 1 and 9 adults.");
  if (!Number.isInteger(children) || children < 0 || adults + children > 9) return bad("Adults and children together can be at most 9 (seated travellers).");
  if (!Number.isInteger(infants) || infants < 0 || infants > adults) return bad("Each infant needs an accompanying adult (at most one infant per adult).");

  try {
    const tenant = await resolveStorefront();
    if (!tenant) return NextResponse.json({ error: "unknown_site", message: "This site is not available." }, { status: 404 });

    const response = await callCore<unknown, { searchId: string; warnings?: string[]; offers?: unknown[] }>(
      "GetSupplierAvailability",
      {
        tenant: { tenantId: tenant.tenantId, channel: "CHANNEL_TYPE_B2C" },
        productType: "PRODUCT_TYPE_FLIGHT",
        origin,
        destination,
        checkIn,
        checkOut,
        adults,
        children,
        infants,
        filters: { ...(cabin === "economy" ? {} : { cabin: CABINS[cabin] }), ...(speed ? { speed } : {}) },
      },
      speed === "slow" ? GRPC_DEADLINES.slowSearch : GRPC_DEADLINES.search,
    );

    const flights = await mapOffers(response.offers ?? [], tenant.tenantId, cabin);
    return NextResponse.json({ searchId: response.searchId, partial: (response.warnings?.length ?? 0) > 0, currency: flights[0]?.currency ?? tenant.sellCurrency, flights });
  } catch (err) {
    if (err instanceof TenantUnavailableError || err instanceof ServiceCredentialError) {
      console.error("[search] storefront cannot reach core-engine:", (err as Error).message);
      return NextResponse.json({ error: "service_unavailable", message: "Search is temporarily unavailable. Please try again shortly." }, { status: 503 });
    }
    if (err instanceof GrpcCallError) {
      console.error("[search] core-engine gRPC error:", err.code, err.message);
      return NextResponse.json({ error: "search_failed", message: "We couldn't complete that search. Please try again." }, { status: err.code === 3 ? 400 : 502 });
    }
    console.error("[search] unexpected:", err);
    return NextResponse.json({ error: "search_failed", message: "We couldn't complete that search. Please try again." }, { status: 502 });
  }
}
