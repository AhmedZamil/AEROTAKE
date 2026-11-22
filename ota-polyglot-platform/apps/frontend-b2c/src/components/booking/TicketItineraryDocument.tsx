"use client";

import { format as formatDate } from "date-fns";
import type { BookingView } from "@/lib/booking-types";
import { formatMoney } from "@/lib/currency";
import { formatDuration } from "@/lib/flight-types";
import { SITE } from "@/lib/site";

function localParts(iso: string): { date: string; time: string } {
  const [d, t] = iso.split("T");
  const [y, m, day] = (d ?? "").split("-").map(Number);
  if (!y || !m || !day) return { date: iso, time: "" };
  return {
    date: formatDate(new Date(y, m - 1, day), "EEE d MMM yyyy"),
    time: (t ?? "").slice(0, 5),
  };
}

function legLabel(legCount: number, legIndex: number): string {
  if (legCount <= 1) return "Flight";
  if (legCount === 2) return legIndex === 0 ? "Outbound" : "Return";
  return `Flight ${legIndex + 1}`;
}

/**
 * Print / Save-as-PDF friendly e-ticket. Uses only the narrow booking view — no net rate or supplier refs.
 * This is an itinerary receipt, not an airline boarding pass.
 */
export default function TicketItineraryDocument({ booking }: { booking: BookingView }) {
  const legs = new Map<number, NonNullable<BookingView["itinerary"]>>();
  for (const s of booking.itinerary ?? []) legs.set(s.legIndex, [...(legs.get(s.legIndex) ?? []), s]);
  const ordered = [...legs.entries()].sort(([a], [b]) => a - b);
  const issued = booking.status === "Confirmed";

  return (
    <article className="ticket-doc mx-auto max-w-2xl rounded-2xl border border-border bg-white text-navy shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-5 sm:px-7">
        <div>
          <p className="font-display text-xl font-bold tracking-tight text-navy">{SITE.name}</p>
          <p className="mt-0.5 text-xs text-slate">{SITE.tagline}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate">
            {issued ? "E-ticket / Itinerary" : "Booking summary"}
          </p>
          <p className="mt-1 text-xs text-slate">
            {issued ? "Ticket issued" : booking.status}
            {" · "}
            {formatDate(new Date(booking.createdAt), "d MMM yyyy")}
          </p>
        </div>
      </header>

      <div className="px-5 py-6 sm:px-7">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate">Booking reference</p>
        <p className="mt-1 font-display text-4xl font-extrabold tracking-[0.18em] text-navy sm:text-5xl">{booking.reference}</p>
        <p className="mt-2 text-sm text-slate">Show this reference at check-in. It is not a boarding pass.</p>
      </div>

      <div className="space-y-4 px-5 pb-6 sm:px-7">
        {ordered.length === 0 ? (
          <p className="rounded-xl bg-bg px-4 py-3 text-sm text-slate">Flight details are not available for this booking.</p>
        ) : (
          ordered.map(([leg, segments]) => (
            <section key={leg} className="overflow-hidden rounded-xl border border-border">
              <div className="border-b border-border bg-bg px-4 py-2">
                <p className="text-xs font-bold uppercase tracking-wide text-slate">{legLabel(ordered.length, leg)}</p>
              </div>
              <div className="divide-y divide-border">
                {segments.map((s) => {
                  const dep = localParts(s.departureTimeLocal);
                  const arr = localParts(s.arrivalTimeLocal);
                  const mins = Math.max(0, Math.round((new Date(s.arrivalTime).getTime() - new Date(s.departureTime).getTime()) / 60000));
                  const flightNo = s.flightNumber.replace(new RegExp(`^${s.airlineCode}`), "");
                  return (
                    <div key={`${s.flightNumber}-${s.departureTimeLocal}`} className="grid gap-4 px-4 py-4 sm:grid-cols-[1fr_auto_1fr]">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate">Depart</p>
                        <p className="mt-1 text-2xl font-bold tabular-nums text-navy">{dep.time}</p>
                        <p className="text-sm font-semibold text-navy">{s.origin}</p>
                        <p className="text-xs text-slate">{dep.date}</p>
                      </div>
                      <div className="flex flex-col items-center justify-center text-center">
                        <p className="text-sm font-bold text-navy">
                          {s.airlineCode}
                          {flightNo}
                        </p>
                        <p className="mt-1 text-xs text-slate">{formatDuration(mins)}</p>
                        <div className="mt-2 h-px w-16 bg-border sm:w-24" aria-hidden />
                      </div>
                      <div className="sm:text-right">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate">Arrive</p>
                        <p className="mt-1 text-2xl font-bold tabular-nums text-navy">{arr.time}</p>
                        <p className="text-sm font-semibold text-navy">{s.destination}</p>
                        <p className="text-xs text-slate">{arr.date}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      <div className="grid gap-4 border-t border-border px-5 py-5 sm:grid-cols-2 sm:px-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">Travellers</p>
          <ul className="mt-2 space-y-1 text-sm font-semibold text-navy">
            {booking.travelers.map((t) => (
              <li key={`${t.firstName}-${t.lastName}`}>
                {t.firstName} {t.lastName}
              </li>
            ))}
          </ul>
          {booking.checkedBaggageIncluded && booking.checkedBaggageWeightKg > 0 ? (
            <p className="mt-3 text-xs text-slate">Checked baggage: {booking.checkedBaggageWeightKg} kg per traveller</p>
          ) : null}
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">{issued ? "Total paid" : "Total"}</p>
          <p className="mt-2 text-2xl font-bold text-primary-strong">{formatMoney(booking.total, booking.currency)}</p>
          <p className="mt-1 text-xs text-slate">Includes taxes and fees shown at booking</p>
        </div>
      </div>

      <footer className="border-t border-border px-5 py-4 text-xs leading-relaxed text-slate sm:px-7">
        <p>
          Keep this document for your records. Airport check-in still requires a valid ID matching the traveller names above.
          Times are local to each airport. Contact {SITE.email} if details look wrong.
        </p>
      </footer>
    </article>
  );
}
