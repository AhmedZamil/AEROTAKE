/** What the storefront knows about a flight offer. Every field is something core-engine actually returned: where the supplier says
 *  nothing (refundability, seats left, cabin baggage) the field is absent and the UI shows nothing, rather than a made-up value. */

export type CabinClass = "economy" | "premium" | "business" | "first";

export type Airline = { code: string; name: string; color: string; logoUrl?: string };

/** One flown segment, exactly as the airline schedules it. Times are local wall-clock at each airport ("2026-10-15T04:30:00"). */
export type FlightSegmentInfo = {
  airline: Airline;
  flightNumber: string;
  from: string;
  to: string;
  departLocal: string;
  arriveLocal: string;
  durationMinutes: number;
  bookingClass: string;
  /** Wait at `to` before the next segment; absent on the last one. */
  layoverAfterMinutes?: number;
};

export type Flight = {
  /** The offer id: the only handle the booking step needs, and only valid for a short time. */
  id: string;
  /** ISO 4217, as priced by core — never converted here. */
  currency: string;
  airline: Airline;
  flightNumber: string;
  from: string;
  to: string;
  date: string;
  departTime: string;
  arriveTime: string;
  durationMinutes: number;
  stops: number;
  layoverAirport?: string;
  layoverMinutes?: number;
  /** The price the customer pays for the WHOLE offer (both directions of a round trip), computed by core. */
  price: number;
  cabin: CabinClass;
  /** 0 = the supplier did not say (or none included). */
  baggage: { cabinKg: number; checkedKg: number };
  refundable?: boolean;
  seatsLeft?: number;
  segments: FlightSegmentInfo[];
  /** Round-trip offers: the way back, as its own leg (its `price` is 0 — the total is on the outbound). */
  returnLeg?: Flight;
};

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}
