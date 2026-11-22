"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LuTimer } from "react-icons/lu";
import { useApp } from "@/context/AppProviders";
import { multiTripOffers, readMultiPicks, type MultiPick } from "@/lib/multi-picks";
import { useAirport } from "@/lib/airports";
import { formatDuration } from "@/lib/flight-types";
import { flightsResultsHref } from "@/lib/search-href";

const steps = [
  { label: "Fare" },
  { label: "Traveller details" },
  { label: "Reserved" },
];

function formatHold(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Counts down to the moment core will let the reservation lapse — the real deadline, not a decorative timer. */
export function BookingHoldTimer({ deadline }: { deadline: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!deadline) return null;

  const left = Math.max(0, Math.floor((new Date(deadline).getTime() - now) / 1000));
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm" role="status" aria-live="polite">
      <LuTimer className="h-4 w-4 text-primary-strong" aria-hidden />
      <span className="text-slate">{left > 0 ? "Seats held for" : "Hold expired"}</span>
      {left > 0 ? <span className="font-bold tabular-nums text-primary-strong">{formatHold(left)}</span> : null}
    </div>
  );
}

export function BookingStepper({ current, deadline = null }: { current: number; deadline?: string | null }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <BookingHoldTimer deadline={deadline} />
      <ol className="flex min-w-0 flex-1 flex-wrap gap-1.5 sm:justify-end">
        {steps.map((step, index) => {
          const active = index === current;
          const done = index < current;
          return (
            <li key={step.label}>
              <span
                className={`inline-flex min-h-9 items-center rounded-full px-2.5 text-[11px] font-semibold sm:min-h-10 sm:px-3 sm:text-xs ${
                  active ? "bg-primary-strong text-white" : done ? "bg-primary-tint text-primary-strong" : "bg-bg text-slate"
                }`}
              >
                {index + 1}. {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The flight and the total core priced it at. One number, because that is all core promises: no base/tax split, fees or discounts are invented. */
export function PriceSummary({ mobileBar }: { mobileBar?: boolean }) {
  const { selectedOutbound, search, format } = useApp();
  const fromAp = useAirport(selectedOutbound?.from ?? "");
  const toAp = useAirport(selectedOutbound?.to ?? "");
  const [multi, setMulti] = useState<MultiPick[]>([]);
  useEffect(() => {
    const load = () => setMulti(search.trip === "multi" ? readMultiPicks() : []);
    load();
    window.addEventListener("aerotake-multi-picks", load);
    return () => window.removeEventListener("aerotake-multi-picks", load);
  }, [search.trip]);
  const tripOffers = multiTripOffers(multi);

  if (!selectedOutbound) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-sm text-slate">
        No flight selected.{" "}
        <Link href={flightsResultsHref(search)} className="font-semibold text-primary-strong">
          Back to results
        </Link>
      </div>
    );
  }

  const back = selectedOutbound.returnLeg;
  const travellers = Math.max(1, search.passengers.adults + search.passengers.children);
  const total = tripOffers ? tripOffers.total : selectedOutbound.price;
  const route = tripOffers
    ? multi.map((leg) => leg.from).concat(multi[multi.length - 1]!.to).join(" → ")
    : `${fromAp?.city ?? selectedOutbound.from} ${back ? "⇌" : "→"} ${toAp?.city ?? selectedOutbound.to}`;

  const body = (
    <>
      <div className="mb-4 border-b border-border pb-3">
        <p className="text-sm font-bold text-navy">{route}</p>
        <p className="mt-1 text-xs text-slate">
          {tripOffers ? "Multi city" : back ? "Round trip" : "One way"} · {selectedOutbound.date}
          {back ? ` – ${back.date}` : ""} · {formatDuration(selectedOutbound.durationMinutes)}
        </p>
        {tripOffers ? (
          <ul className="mt-2 space-y-1 text-xs text-slate">
            {multi.map((leg, index) => (
              <li key={`${leg.offerId}-${index}`}>
                Flight {index + 1}: {leg.from} → {leg.to}
                {leg.date ? ` · ${leg.date}` : ""}
                {leg.price != null ? ` · ${format(leg.price)}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-slate">
            {selectedOutbound.airline.name} {selectedOutbound.flightNumber} · {selectedOutbound.departTime} – {selectedOutbound.arriveTime}
          </p>
        )}
      </div>
      <p className="flex justify-between text-base font-bold text-navy">
        <span>
          Total · {travellers} traveller{travellers === 1 ? "" : "s"}
        </span>
        <span className="text-primary-strong">{format(total)}</span>
      </p>
      <p className="mt-2 text-xs text-slate">Includes taxes and fees. We confirm the price with the airline before reserving.</p>
    </>
  );

  if (mobileBar) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card p-3 lg:hidden">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-3">
          <div>
            <p className="text-xs text-slate">Total</p>
            <p className="text-lg font-bold text-primary-strong">{format(total)}</p>
          </div>
        </div>
      </div>
    );
  }

  return <aside className="rounded-2xl border border-border bg-card p-5">{body}</aside>;
}
