"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LuCheck, LuLuggage } from "react-icons/lu";
import { BookingStepper, PriceSummary } from "@/components/booking/BookingChrome";
import { useApp } from "@/context/AppProviders";
import { loginHref } from "@/lib/auth-redirect";
import { packageHighlights, packageLabel } from "@/lib/fare-packages";
import { formatDuration, type Flight } from "@/lib/flight-types";
import { useAirport } from "@/lib/airports";
import { readMultiPicks, writeMultiPicks, type MultiPick } from "@/lib/multi-picks";
import { flightsResultsHref } from "@/lib/search-href";

function PackageCard({
  flight,
  selected,
  onSelect,
  format,
}: {
  flight: Flight;
  selected: boolean;
  onSelect: () => void;
  format: (n: number) => string;
}) {
  const highlights = packageHighlights(flight);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full rounded-2xl border p-4 text-left transition sm:p-5 ${
        selected
          ? "border-primary-strong bg-primary-tint/50 shadow-[inset_0_0_0_1px_var(--color-primary-strong)]"
          : "border-border bg-card hover:border-primary-strong/40"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-bold text-navy">{packageLabel(flight)}</p>
          <ul className="mt-3 space-y-1.5">
            {highlights.map((line) => (
              <li key={line} className="flex gap-2 text-sm text-slate">
                <LuCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xl font-bold tabular-nums text-navy">{format(flight.price)}</p>
          <p className="mt-1 text-[11px] text-slate">All travellers</p>
          {selected ? (
            <span className="mt-2 inline-block rounded-md bg-primary-strong px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Selected
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

export default function FarePackagePage() {
  const router = useRouter();
  const {
    selectedOutbound,
    setSelectedOutbound,
    fareOptions,
    format,
    search,
    user,
    userLoaded,
  } = useApp();
  const fromAp = useAirport(selectedOutbound?.from ?? "");
  const toAp = useAirport(selectedOutbound?.to ?? "");
  const [multi, setMulti] = useState<MultiPick[]>([]);
  useEffect(() => {
    setMulti(search.trip === "multi" ? readMultiPicks() : []);
  }, [search.trip]);

  const options = useMemo(() => {
    if (!selectedOutbound) return [];
    if (fareOptions.length > 0) return fareOptions;
    return [selectedOutbound];
  }, [fareOptions, selectedOutbound]);

  const [pickedId, setPickedId] = useState(selectedOutbound?.id ?? "");

  useEffect(() => {
    if (selectedOutbound?.id) setPickedId(selectedOutbound.id);
  }, [selectedOutbound?.id]);

  useEffect(() => {
    if (!userLoaded) return;
    if (!selectedOutbound) {
      router.replace("/");
      return;
    }
    if (!user) {
      router.replace(loginHref("/booking/fare"));
    }
  }, [userLoaded, user, selectedOutbound, router]);

  const picked = options.find((o) => o.id === pickedId) ?? selectedOutbound;

  const confirm = () => {
    if (!picked) return;
    if (search.trip === "multi") {
      const picks = readMultiPicks();
      if (picks.length >= 2) {
        picks[0] = { ...picks[0]!, offerId: picked.id, price: picked.price, airline: picked.airline.code };
        writeMultiPicks(picks);
      }
    }
    setSelectedOutbound(picked);
    if (!user) {
      router.push(loginHref("/booking/passengers"));
      return;
    }
    router.push("/booking/passengers");
  };

  if (!selectedOutbound || !picked) {
    return (
      <div className="mx-auto max-w-[1320px] px-4 py-16 text-center sm:px-6">
        <p className="text-slate">No flight selected.</p>
        <Link href={flightsResultsHref(search)} className="mt-4 inline-block font-semibold text-primary-strong">
          Back to results
        </Link>
      </div>
    );
  }

  const back = selectedOutbound.returnLeg;

  return (
    <div className="mx-auto max-w-[1320px] px-4 py-8 sm:px-6 lg:px-8">
      <BookingStepper current={0} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          <div>
            <h1 className="text-2xl font-bold text-navy">Confirm your fare</h1>
            <p className="mt-1 text-sm text-slate">
              Review what is included, pick another package for this flight if available, then continue to traveller details.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <p className="text-sm font-bold text-navy">
              {multi.length >= 2
                ? multi.map((leg) => leg.from).concat(multi[multi.length - 1]!.to).join(" → ")
                : `${fromAp?.city ?? selectedOutbound.from} ${back ? "⇌" : "→"} ${toAp?.city ?? selectedOutbound.to}`}
            </p>
            <p className="mt-1 text-xs text-slate">
              {multi.length >= 2 ? "Multi city" : back ? "Round trip" : "One way"} · {selectedOutbound.date}
              {back ? ` – ${back.date}` : ""} · {formatDuration(selectedOutbound.durationMinutes)}
            </p>
            {multi.length >= 2 ? (
              <ul className="mt-2 space-y-1 text-xs text-slate">
                {multi.map((leg, index) => (
                  <li key={`${leg.offerId}-${index}`}>
                    Flight {index + 1}: {leg.from} → {leg.to}
                    {leg.date ? ` · ${leg.date}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-1 text-xs text-slate">
              {selectedOutbound.airline.name} {selectedOutbound.flightNumber} · {selectedOutbound.departTime} –{" "}
              {selectedOutbound.arriveTime}
            </p>
          </div>

          <div>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-navy">
              <LuLuggage className="h-4 w-4 text-primary-strong" aria-hidden />
              {options.length > 1 ? "Available packages for this flight" : "Your fare package"}
            </h2>
            <div className="space-y-3">
              {options.map((opt) => (
                <PackageCard
                  key={opt.id}
                  flight={opt}
                  selected={opt.id === picked.id}
                  onSelect={() => {
                    setPickedId(opt.id);
                    setSelectedOutbound(opt);
                  }}
                  format={format}
                />
              ))}
            </div>
            {options.length === 1 ? (
              <p className="mt-2 text-xs text-slate">
                No other packages for this schedule were returned in your search. You can go back to results to compare other flights.
              </p>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <Link
              href={flightsResultsHref(search)}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-card px-5 text-sm font-semibold text-navy"
            >
              Back to results
            </Link>
            <button
              type="button"
              onClick={confirm}
              className="btn-primary inline-flex min-h-11 items-center justify-center rounded-lg px-6 text-sm font-semibold"
            >
              Confirm fare · continue
            </button>
          </div>
        </div>

        <div className="hidden lg:block">
          <PriceSummary />
        </div>
      </div>
      <PriceSummary mobileBar />
      <div className="h-20 lg:hidden" />
    </div>
  );
}
