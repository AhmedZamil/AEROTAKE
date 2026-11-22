"use client";

import { format as formatDate } from "date-fns";
import type { BookingView } from "@/lib/booking-types";
import { formatMoney } from "@/lib/currency";
import { formatDuration } from "@/lib/flight-types";

function statusOf(b: BookingView): { label: string; tone: "ok" | "wait" | "bad" } {
  switch (b.status) {
    case "Confirmed":
      return { label: "Confirmed", tone: "ok" };
    case "Pending":
      return b.ticketingDeadline && new Date(b.ticketingDeadline).getTime() < Date.now()
        ? { label: "Hold expired", tone: "bad" }
        : { label: "Reserved — awaiting payment", tone: "wait" };
    case "Cancelled":
      return { label: "Cancelled", tone: "bad" };
    case "Failed":
      return { label: "Not completed", tone: "bad" };
    default:
      return { label: "Not completed", tone: "bad" };
  }
}

function localTime(iso: string): string {
  // "2026-12-01T09:00:00" is wall-clock at the airport; format the text itself so the browser's own timezone can never shift it.
  const [d, t] = iso.split("T");
  const [y, m, day] = (d ?? "").split("-").map(Number);
  if (!y || !m || !day) return iso;
  return `${formatDate(new Date(y, m - 1, day), "d MMM")}, ${(t ?? "").slice(0, 5)}`;
}

/** A booking as core shows it to its owner. Everything here came from core: nothing is estimated or filled in. */
export default function BookingSummaryCard({ booking, children }: { booking: BookingView; children?: React.ReactNode }) {
  const status = statusOf(booking);
  const tone = status.tone === "ok" ? "bg-success-bg text-success-text" : status.tone === "wait" ? "bg-warning-bg text-warning-text" : "bg-error-bg text-error-text";
  const legs = new Map<number, NonNullable<BookingView["itinerary"]>>();
  for (const s of booking.itinerary ?? []) legs.set(s.legIndex, [...(legs.get(s.legIndex) ?? []), s]);

  return (
    <article className="rounded-2xl border border-border bg-card p-5 text-left">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">Booking reference</p>
          <p className="text-2xl font-bold tracking-wider text-navy">{booking.reference}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>{status.label}</span>
      </div>

      {[...legs.entries()].sort(([a], [b]) => a - b).map(([leg, segments]) => (
        <div key={leg} className="mt-3 space-y-2 rounded-xl bg-bg p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate">
            {legs.size <= 1 ? "Flight" : legs.size === 2 ? (leg === 0 ? "Outbound" : "Return") : `Flight ${leg + 1}`}
          </p>
          {segments.map((s) => (
            <div key={`${s.flightNumber}-${s.departureTimeLocal}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-navy">
                {s.origin} → {s.destination}
              </span>
              <span className="text-slate">
                {s.airlineCode}
                {s.flightNumber.replace(new RegExp(`^${s.airlineCode}`), "")} · {localTime(s.departureTimeLocal)} → {localTime(s.arrivalTimeLocal)}
                {" · "}
                {formatDuration(Math.max(0, Math.round((new Date(s.arrivalTime).getTime() - new Date(s.departureTime).getTime()) / 60000)))}
              </span>
            </div>
          ))}
        </div>
      ))}

      <p className="mt-3 text-sm text-slate">
        {booking.travelers.map((t) => `${t.firstName} ${t.lastName}`).join(", ")}
      </p>
      {booking.checkedBaggageIncluded && booking.checkedBaggageWeightKg > 0 ? (
        <p className="mt-1 text-xs text-slate">Checked baggage: {booking.checkedBaggageWeightKg} kg per traveller</p>
      ) : null}

      <div className="mt-4 flex items-end justify-between gap-3 border-t border-border pt-3">
        <div className="text-xs text-slate">
          {status.tone === "wait" && booking.ticketingDeadline ? `Seats held until ${formatDate(new Date(booking.ticketingDeadline), "d MMM yyyy, HH:mm")}` : null}
        </div>
        <p className="text-lg font-bold text-primary-strong">{formatMoney(booking.total, booking.currency)}</p>
      </div>
      {children}
    </article>
  );
}
