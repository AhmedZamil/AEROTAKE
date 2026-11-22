import "server-only";

import type { Airline, CabinClass, Flight, FlightSegmentInfo } from "@/lib/flight-types";
import { timestampMs } from "./grpc-client";

/** What core-engine's SupplierOffer looks like after proto-loader (camelCase, timestamps as {seconds,nanos}). */
/* eslint-disable @typescript-eslint/no-explicit-any */
type ProtoOffer = any;

const CORE_REST = process.env.CORE_ENGINE_REST_URL ?? "http://localhost:8080";

type AirlineInfo = { name: string; logoUrl?: string };

let airlineCatalogue: { at: number; byCode: Map<string, AirlineInfo> } | null = null;

/** IATA code -> airline name + logo, from core's global catalogue (cached an hour). A failure just means codes are shown as names. */
async function airlineInfoOf(code: string, tenantId: string): Promise<AirlineInfo> {
  if (!airlineCatalogue || Date.now() - airlineCatalogue.at > 3_600_000) {
    const byCode = new Map<string, AirlineInfo>();
    try {
      const res = await fetch(`${CORE_REST}/api/v1/airlines`, { headers: { "X-Tenant-ID": tenantId }, cache: "no-store" });
      if (res.ok) {
        const items = ((await res.json()) as { items: { code: string; name: string; logoUrl?: string | null }[] }).items ?? [];
        for (const a of items) byCode.set(a.code, { name: a.name, logoUrl: a.logoUrl || undefined });
      }
    } catch {
      // keep whatever we had; codes stand in for names
    }
    if (byCode.size > 0 || !airlineCatalogue) airlineCatalogue = { at: Date.now(), byCode };
  }
  return airlineCatalogue.byCode.get(code) ?? { name: code };
}

/** A stable colour per carrier for the fallback badge, used when there is no logo or it fails to load. */
function colourFor(code: string): string {
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 38%)`;
}

function segmentsOf(offer: ProtoOffer, leg: number) {
  return (offer.segments ?? [])
    .filter((s: any) => Number(s.legIndex ?? 0) === leg)
    .sort((a: any, b: any) => (timestampMs(a.departureTime) ?? 0) - (timestampMs(b.departureTime) ?? 0));
}

export async function mapOffers(offers: ProtoOffer[], tenantId: string, cabin: CabinClass): Promise<Flight[]> {
  const codes = new Set<string>();
  for (const o of offers) for (const s of o.segments ?? []) codes.add(s.airlineCode);
  const infos = new Map<string, AirlineInfo>();
  for (const code of codes) infos.set(code, await airlineInfoOf(code, tenantId));
  const airline = (code: string): Airline => {
    const info = infos.get(code);
    return { code, name: info?.name ?? code, color: colourFor(code), logoUrl: info?.logoUrl };
  };

  const flights: Flight[] = [];
  for (const offer of offers) {
    const outbound = buildLeg(offer, 0, airline, cabin);
    if (!outbound) continue; // an offer with no itinerary cannot be shown or booked from
    outbound.id = offer.offerId;
    outbound.currency = offer.currency;
    outbound.price = Number(offer.sellPrice);
    outbound.baggage.checkedKg = offer.checkedBaggageIncluded ? Number(offer.checkedBaggageWeightKg) || 0 : 0;
    const back = buildLeg(offer, 1, airline, cabin);
    if (back) {
      back.id = `${offer.offerId}:return`;
      back.currency = offer.currency;
      back.price = 0;
      back.baggage.checkedKg = outbound.baggage.checkedKg;
      outbound.returnLeg = back;
    }
    flights.push(outbound);
  }
  return flights.sort((a, b) => a.price - b.price);
}

function buildLeg(offer: ProtoOffer, leg: number, airline: (c: string) => Airline, cabin: CabinClass): Flight | null {
  const segs = segmentsOf(offer, leg);
  if (segs.length === 0) return null;

  const infos: FlightSegmentInfo[] = segs.map((s: any, i: number) => {
    const dep = timestampMs(s.departureTime) ?? 0;
    const arr = timestampMs(s.arrivalTime) ?? 0;
    const next = segs[i + 1];
    const wait = next ? Math.round(((timestampMs(next.departureTime) ?? arr) - arr) / 60_000) : 0;
    return {
      airline: airline(s.airlineCode),
      flightNumber: String(s.flightNumber).startsWith(s.airlineCode) ? String(s.flightNumber) : `${s.airlineCode}${s.flightNumber}`,
      from: s.origin,
      to: s.destination,
      departLocal: s.departureTimeLocal,
      arriveLocal: s.arrivalTimeLocal,
      durationMinutes: Math.max(0, Math.round((arr - dep) / 60_000)),
      bookingClass: s.bookingClass ?? "",
      layoverAfterMinutes: next && wait > 0 ? wait : undefined,
    };
  });

  const first = infos[0]!;
  const last = infos[infos.length - 1]!;
  const totalMs = (timestampMs(segs[segs.length - 1].arrivalTime) ?? 0) - (timestampMs(segs[0].departureTime) ?? 0);
  const layovers = infos.filter((s) => s.layoverAfterMinutes);
  return {
    id: "",
    currency: "",
    airline: first.airline,
    flightNumber: first.flightNumber,
    from: first.from,
    to: last.to,
    date: first.departLocal.slice(0, 10),
    departTime: first.departLocal.slice(11, 16),
    arriveTime: last.arriveLocal.slice(11, 16),
    durationMinutes: Math.max(0, Math.round(totalMs / 60_000)),
    stops: infos.length - 1,
    layoverAirport: layovers[0] ? infos[infos.indexOf(layovers[0])]!.to : undefined,
    layoverMinutes: layovers.length ? layovers.reduce((n, s) => n + (s.layoverAfterMinutes ?? 0), 0) : undefined,
    price: 0,
    cabin,
    baggage: { cabinKg: 0, checkedKg: 0 },
    segments: infos,
  };
}
