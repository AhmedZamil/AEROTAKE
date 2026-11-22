"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAirport } from "@/lib/airports";
import { offsetIso } from "@/lib/dates";

// Where this site's customers most often fly from and to. Just starting points for a search — no prices are shown: a fare is only known
// by asking the airlines, and a "from" price written into the page would be a promise nobody is keeping.
const ROUTES: { from: string; to: string }[] = [
  { from: "DAC", to: "DXB" },
  { from: "DAC", to: "DOH" },
  { from: "DAC", to: "JED" },
  { from: "DAC", to: "LHR" },
  { from: "DAC", to: "SIN" },
  { from: "DAC", to: "BKK" },
];

function RouteLabel({ from, to }: { from: string; to: string }) {
  const a = useAirport(from);
  const b = useAirport(to);
  return (
    <>
      {a?.city ?? from} → {b?.city ?? to}
    </>
  );
}

export default function PopularRoutes() {
  // Client-only dates (relative to today). Never use href="/" as a placeholder — that made taps look like a broken Search.
  const [dates, setDates] = useState<{ depart: string } | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => setDates({ depart: offsetIso(30) }), 0);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <section className="overflow-x-hidden bg-bg px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1320px]">
        <h2 className="mb-2 text-2xl font-bold text-navy sm:text-3xl">Popular routes</h2>
        <p className="mb-6 text-[15px] text-slate">Tap a route to search it, with dates a month ahead you can change.</p>

        <div className="grid w-full grid-cols-2 gap-3 lg:grid-cols-3">
          {ROUTES.map((route) => {
            const className =
              "flex min-h-[72px] w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 transition hover:-translate-y-0.5 hover:border-primary-strong/40 hover:shadow-sm";
            const body = (
              <div className="min-w-0">
                <p className="text-sm font-semibold text-primary-strong">
                  {route.from} → {route.to}
                </p>
                <p className="truncate text-lg font-bold text-navy">
                  <RouteLabel from={route.from} to={route.to} />
                </p>
              </div>
            );
            if (!dates) {
              return (
                <div key={`${route.from}${route.to}`} className={`${className} opacity-70`} aria-hidden>
                  {body}
                </div>
              );
            }
            const href = `/flights?from=${route.from}&to=${route.to}&depart=${dates.depart}&adults=1&children=0&infants=0&cabin=economy&trip=oneway&fare=regular`;
            return (
              <Link key={`${route.from}${route.to}`} href={href} className={className}>
                {body}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
