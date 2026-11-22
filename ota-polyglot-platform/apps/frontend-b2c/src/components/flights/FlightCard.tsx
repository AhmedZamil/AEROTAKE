"use client";

import { format as formatDate } from "date-fns";
import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  LuBriefcase,
  LuChevronDown,
  LuChevronUp,
  LuCircleAlert,
  LuCoffee,
  LuMapPin,
  LuMonitor,
  LuPlane,
  LuPlug,
  LuTicket,
  LuUtensils,
} from "react-icons/lu";
import { useApp } from "@/context/AppProviders";
import { useAirport } from "@/lib/airports";
import { formatDuration, type Airline, type Flight } from "@/lib/flight-types";
import { AirlineLogo } from "./AirlineLogo";
import { matchesWindows, type TimeWindowId } from "@/lib/schedule-windows";

type Badge = "lowest" | "quickest" | "best";

type Props = {
  flight: Flight;
  onSelect: (flight: Flight) => void;
  badges?: Badge[];
};

function formatShortDate(iso: string): string {
  try {
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) return iso;
    return formatDate(new Date(y, m - 1, d), "d MMM");
  } catch {
    return iso;
  }
}

function to12h(time: string): string {
  const [hRaw, mRaw] = time.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${suffix}`;
}

function formatDetailDate(iso: string): string {
  try {
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) return iso;
    return formatDate(new Date(y, m - 1, d), "d MMM, EEEE");
  } catch {
    return iso;
  }
}

function cabinClassLabel(cabin: string, bookingClass: string): string {
  return bookingClass ? `${cabin.toUpperCase()} (${bookingClass})` : cabin.toUpperCase();
}

function stopsLabel(stops: number, layoverAirport?: string) {
  if (stops === 0) return "Non-Stop";
  return `${stops} Stop${stops > 1 ? "s" : ""}${layoverAirport ? ` via ${layoverAirport}` : ""}`;
}

type FlightSegment = {
  from: string;
  to: string;
  date: string;
  arriveDate: string;
  departTime: string;
  arriveTime: string;
  durationMinutes: number;
  flightNumber: string;
  bookingClass: string;
  airline: Airline;
  layoverAfterMinutes?: number;
};

/** The leg's real flights, as the airline scheduled them (local times at each airport). Nothing here is estimated or filled in. */
function buildSegments(leg: Flight): { segments: FlightSegment[]; multiStop: boolean } {
  return {
    multiStop: leg.stops >= 2,
    segments: leg.segments.map((s) => ({
      from: s.from,
      to: s.to,
      date: s.departLocal.slice(0, 10),
      arriveDate: s.arriveLocal.slice(0, 10),
      departTime: s.departLocal.slice(11, 16),
      arriveTime: s.arriveLocal.slice(11, 16),
      durationMinutes: s.durationMinutes,
      flightNumber: s.flightNumber,
      bookingClass: s.bookingClass,
      airline: s.airline,
      layoverAfterMinutes: s.layoverAfterMinutes,
    })),
  };
}

function NoticeBanner({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-primary-strong/20 bg-primary-tint px-3 py-2.5 text-[13px] leading-snug text-navy">
      <LuCircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
      <p>{children}</p>
    </div>
  );
}

function PlaceBanner({
  tone,
  title,
  subtitle,
}: {
  tone: "start" | "layover" | "end";
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-stretch gap-2.5 sm:gap-3">
      <span
        className={`mt-2.5 flex h-5 w-9 shrink-0 items-center justify-center ${
          tone === "end" ? "text-primary-strong" : "text-slate"
        }`}
      >
        <LuMapPin className="h-4 w-4" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-bg px-3 py-2.5 sm:px-4">
        <p className="text-sm font-semibold text-navy">{title}</p>
        <p className="truncate text-xs text-slate sm:text-sm">{subtitle}</p>
      </div>
    </div>
  );
}

function SegmentBlock({
  segment,
  cabin,
}: {
  segment: FlightSegment;
  cabin: string;
}) {
  return (
    <div className="flex gap-2.5 sm:gap-3">
      <div className="flex w-9 shrink-0 flex-col items-center">
        <AirlineLogo airline={segment.airline} size="sm" />
        <div className="relative my-1 flex min-h-[88px] w-px flex-1 border-l border-dashed border-border">
          <span className="absolute left-1/2 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-card text-primary-strong">
            <LuPlane className="h-3.5 w-3.5" aria-hidden />
          </span>
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-2 pt-0.5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-4">
          <div className="min-w-0">
            <p className="text-sm font-bold text-navy">
              {segment.from} - {segment.to}
            </p>
            <p className="mt-0.5 text-xs text-slate">
              {formatDuration(segment.durationMinutes)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-base font-bold tabular-nums text-navy">
              {to12h(segment.departTime)}
            </p>
            <p className="mt-0.5 text-xs text-slate">{formatDetailDate(segment.date)}</p>
          </div>
          <div className="min-w-0">
            <p className="text-base font-bold tabular-nums text-navy">
              {to12h(segment.arriveTime)}
            </p>
            <p className="mt-0.5 text-xs text-slate">
              {formatDetailDate(segment.arriveDate)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-navy">{segment.airline.name}</p>
          </div>
          <div>
            <p className="text-xs text-slate">
              Flight no :{" "}
              <span className="font-medium text-navy">{segment.flightNumber}</span>
            </p>
            <p className="mt-0.5 text-xs text-slate">
              Class :{" "}
              <span className="font-medium text-navy">
                {cabinClassLabel(cabin, segment.bookingClass)}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function LayoverBanner({ code, minutes }: { code: string; minutes: number }) {
  const ap = useAirport(code);
  return <PlaceBanner tone="layover" title={`Layover at ${ap?.city ?? code} : ${formatDuration(minutes)}`} subtitle={ap?.name ?? code} />;
}

function LegItineraryDetail({ leg }: { leg: Flight }) {
  const detail = useMemo(() => buildSegments(leg), [leg]);
  const fromAp = useAirport(leg.from);
  const toAp = useAirport(leg.to);

  return (
    <div className="space-y-4 p-4 sm:p-5">
      {detail.multiStop ? (
        <div className="space-y-2">
          {detail.multiStop ? (
            <NoticeBanner>
              This flight has multiple stops. Please check visa requirements for each
              stop as per your nationality.
            </NoticeBanner>
          ) : null}
        </div>
      ) : null}

      <PlaceBanner
        tone="start"
        title={`Departure from ${fromAp?.city ?? leg.from}`}
        subtitle={fromAp?.name ?? leg.from}
      />

      {detail.segments.map((segment, i) => {
        return (
          <div key={`${segment.flightNumber}-${i}`} className="space-y-4">
            <SegmentBlock segment={segment} cabin={leg.cabin} />
            {segment.layoverAfterMinutes ? (
              <LayoverBanner code={segment.to} minutes={segment.layoverAfterMinutes} />
            ) : null}
          </div>
        );
      })}

      <PlaceBanner
        tone="end"
        title={`Destination at ${toAp?.city ?? leg.to}`}
        subtitle={toAp?.name ?? leg.to}
      />
    </div>
  );
}

function LegRow({ leg }: { leg: Flight }) {
  const fromAp = useAirport(leg.from);
  const toAp = useAirport(leg.to);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
      <div className="flex min-w-0 shrink-0 items-center gap-2.5 sm:w-[160px]">
        <AirlineLogo airline={leg.airline} size="md" />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-navy">
            {leg.from} - {leg.to}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate">{leg.airline.name}</p>
          <p className="mt-0.5 text-xs text-slate">{formatDuration(leg.durationMinutes)}</p>
        </div>
      </div>

      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_88px_minmax(0,1fr)] sm:gap-3">
        <div className="min-w-0 text-left leading-tight">
          <p className="text-lg font-bold tabular-nums text-navy sm:text-xl">
            {to12h(leg.departTime)}
          </p>
          <p className="mt-0.5 text-xs text-slate">{formatShortDate(leg.date)}</p>
          <p className="mt-0.5 truncate text-xs text-slate sm:text-sm">
            {fromAp?.name ?? leg.from}
          </p>
        </div>

        <div className="flex flex-col items-center justify-center self-center px-0.5 text-center leading-tight">
          <p className="whitespace-nowrap text-[11px] font-semibold text-navy sm:text-xs">
            {stopsLabel(leg.stops, leg.layoverAirport)}
          </p>
          <div className="my-1.5 h-px w-full max-w-[56px] bg-border" />
          <p className="text-[11px] font-medium text-slate">{leg.to}</p>
        </div>

        <div className="min-w-0 text-right leading-tight">
          <p className="text-lg font-bold tabular-nums text-navy sm:text-xl">
            {to12h(leg.arriveTime)}
          </p>
          <p className="mt-0.5 text-xs text-slate">{formatShortDate(leg.date)}</p>
          <p className="mt-0.5 truncate text-xs text-slate sm:text-sm">
            {toAp?.name ?? leg.to}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function FlightCard({
  flight,
  onSelect,
  badges = [],
}: Props) {
  const { format } = useApp();
  const [open, setOpen] = useState(false);
  const [legIndex, setLegIndex] = useState(0);
  const [infoTab, setInfoTab] = useState<"baggage" | "policy">("baggage");

  // A round-trip offer carries its own way back (the airline's real flights); nothing is invented for a return.
  const itineraryLegs = useMemo((): Flight[] => (flight.returnLeg ? [flight, flight.returnLeg] : [flight]), [flight]);

  const activeLeg = itineraryLegs[Math.min(legIndex, itineraryLegs.length - 1)] ?? flight;

  const totalPrice = useMemo(() => {
    if (itineraryLegs.length <= 1) return flight.price;
    return itineraryLegs.reduce((sum, leg) => sum + leg.price, 0);
  }, [flight.price, itineraryLegs]);
  const showBest = badges.includes("best") || badges.includes("lowest");
  const hasMultipleLegs = itineraryLegs.length > 1;

  return (
    <article className="relative overflow-hidden rounded-xl border border-border bg-card shadow-[0_2px_8px_rgba(16,24,40,0.06)]">
      {showBest ? (
        <div className="absolute left-0 top-0 z-10">
          <span className="inline-block rounded-br-lg bg-success-text px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
            Best Deal
          </span>
        </div>
      ) : null}

      <div className={`flex flex-col md:flex-row md:items-stretch ${showBest ? "pt-1" : ""}`}>
        {/* Legs */}
        <div className="flex min-w-0 flex-1 flex-col justify-center space-y-4 px-4 py-4 sm:px-5 sm:py-5">
          {itineraryLegs.map((leg, i) => (
            <div key={leg.id}>
              {i > 0 ? <div className="mb-4 border-t border-dashed border-border" /> : null}
              <LegRow leg={leg} />
            </div>
          ))}
        </div>

        {/* Price rail */}
        <div className="flex shrink-0 flex-row items-center justify-between gap-3 border-t border-border bg-primary-tint/70 px-4 py-4 sm:px-5 md:w-[188px] md:flex-col md:justify-center md:gap-0 md:border-l md:border-t-0 md:px-4 md:py-5">
          <div className="min-w-0 md:w-full md:text-center">
            <p className="text-2xl font-bold tabular-nums leading-none text-navy md:text-[26px]">
              {format(totalPrice)}
            </p>
            <p className="mt-1.5 text-[11px] leading-none text-slate">{hasMultipleLegs ? "Round trip, all travellers" : "All travellers"}</p>
          </div>
          <button
            type="button"
            onClick={() => onSelect(flight)}
            className="btn-primary inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg px-5 text-sm font-semibold leading-none md:mt-3 md:w-full"
          >
            Select &gt;
          </button>
        </div>
      </div>

      {/* Expand bar */}
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-1.5 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          {flight.refundable === undefined ? null : (
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
              flight.refundable
                ? "bg-success-bg text-success-text"
                : "bg-warning-bg text-warning-text"
            }`}
          >
            {flight.refundable ? "Partially Refundable" : "Non Refundable"}
          </span>
          )}
          {badges.includes("quickest") ? (
            <span className="rounded-md bg-primary-tint px-2 py-0.5 text-xs font-semibold text-primary-strong">
              Fastest
            </span>
          ) : null}
          {badges.includes("lowest") && !showBest ? (
            <span className="rounded-md bg-warning-bg px-2 py-0.5 text-xs font-semibold text-warning-text">
              Cheapest
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-primary-strong"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide Detail" : "View Detail"}
          {open ? (
            <LuChevronUp className="h-4 w-4" aria-hidden />
          ) : (
            <LuChevronDown className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>

      {open ? (
        <div className="grid gap-4 border-t border-border bg-bg/40 p-4 sm:p-5 lg:grid-cols-2">
          {/* Timeline */}
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {hasMultipleLegs ? (
              <div
                className={`grid ${
                  itineraryLegs.length === 2
                    ? "grid-cols-2"
                    : itineraryLegs.length === 3
                      ? "grid-cols-3"
                      : "grid-cols-2 sm:grid-cols-4"
                }`}
                role="tablist"
                aria-label="Flight legs"
              >
                {itineraryLegs.map((leg, i) => {
                  const active = legIndex === i;
                  return (
                    <button
                      key={leg.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setLegIndex(i)}
                      className={`flex min-h-11 items-center justify-between gap-2 px-2.5 text-left text-[11px] font-semibold sm:px-3 sm:text-sm ${
                        active
                          ? "bg-primary-strong text-white"
                          : "bg-bg text-navy hover:bg-border/40"
                      }`}
                    >
                      <span className="truncate">
                        {leg.from}-{leg.to}
                      </span>
                      <span
                        className={`shrink-0 font-medium ${
                          active ? "text-white/90" : "text-slate"
                        }`}
                      >
                        {formatDuration(leg.durationMinutes)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            <LegItineraryDetail leg={activeLeg} />
          </div>

          {/* Baggage / Policy */}
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="grid grid-cols-2 border-b border-border" role="tablist" aria-label="Fare info">
              <button
                type="button"
                role="tab"
                aria-selected={infoTab === "baggage"}
                onClick={() => setInfoTab("baggage")}
                className={`min-h-11 text-sm font-semibold transition ${
                  infoTab === "baggage"
                    ? "bg-primary-strong text-white"
                    : "bg-bg text-slate hover:text-navy"
                }`}
              >
                Baggage
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={infoTab === "policy"}
                onClick={() => setInfoTab("policy")}
                className={`min-h-11 text-sm font-semibold transition ${
                  infoTab === "policy"
                    ? "bg-primary-strong text-white"
                    : "bg-bg text-slate hover:text-navy"
                }`}
              >
                Policy
              </button>
            </div>

            <div className="p-4">
              {infoTab === "baggage" ? (
                <div className="space-y-3">
                  {itineraryLegs.map((leg) => (
                    <div key={leg.id} className="overflow-hidden rounded-lg border border-border">
                      <div className="bg-primary-tint/80 px-3 py-2">
                        <p className="text-sm font-bold uppercase tracking-wide text-navy">
                          {leg.from}-{leg.to}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 px-3 py-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg text-primary-strong" aria-hidden>
                          <LuBriefcase className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-navy">Checked baggage</p>
                          <p className="mt-0.5 text-xs text-slate">
                            {leg.baggage.checkedKg > 0
                              ? `Up to ${leg.baggage.checkedKg} kg included`
                              : "Not stated for this fare — check the airline's conditions before you pay."}
                            {leg.baggage.cabinKg > 0 ? ` · Cabin ${leg.baggage.cabinKg} kg` : ""}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3 text-sm leading-relaxed text-slate">
                  <div className="rounded-lg border border-primary-strong/25 bg-primary-tint px-3.5 py-3 text-[13px] text-navy">
                    Before booking this flight please check your visa requirements as per your nationality.
                  </div>
                  <p>
                    Refund and date-change conditions are set by the airline for this fare and are not shown on this page. If you need them
                    before you book, contact us and we will confirm them with the airline.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function FlightCardSkeleton() {
  return <div className="h-[160px] animate-pulse rounded-xl border border-border bg-border/40" />;
}

export function EmptyFlights() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
      <p className="text-lg font-bold text-navy">No flights match your filters</p>
      <p className="mt-2 text-sm text-slate">Try clearing filters or picking another date.</p>
    </div>
  );
}

/** The search itself produced nothing. Two very different reasons, told apart: an airline did not answer (try again), or there really are no fares. */
export function NoFares({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center" role="status">
      <p className="text-lg font-bold text-navy">{failed ? "We couldn't get fares just now" : "No flights found for these dates"}</p>
      <p className="mt-2 text-sm text-slate">
        {failed ? "Some airlines didn't answer in time. This usually clears up on a second try." : "Try another date, or nearby airports."}
      </p>
      {failed ? (
        <button type="button" onClick={onRetry} className="btn-primary mt-4 inline-flex min-h-11 items-center rounded-full px-6 text-sm font-semibold">
          Search again
        </button>
      ) : null}
    </div>
  );
}

export function FlightError({ message }: { message: string }) {
  return (
    <div className="banner-error rounded-xl px-6 py-8 text-center" role="alert">
      <p className="font-semibold">{message}</p>
      <Link href="/" className="mt-3 inline-flex text-sm font-semibold underline">
        Back to search
      </Link>
    </div>
  );
}

export function useSortedFilteredFlights(
  flights: Flight[],
  opts: {
    sort: "best" | "cheapest" | "fastest" | "earliest";
    maxPrice: number;
    stops: Set<number>;
    airlines: Set<string>;
    outboundDepart: Set<TimeWindowId>;
    outboundArrive: Set<TimeWindowId>;
    returnDepart: Set<TimeWindowId>;
    returnArrive: Set<TimeWindowId>;
    layovers: Set<string>;
    cabins: Set<string>;
    /** Checked-bag weights (kg) to keep; empty = any. */
    bagKgs: Set<number>;
    fareFlex: "any" | "flexible" | "saver";
  },
) {
  return useMemo(() => {
    let list = flights.filter((f) => f.price <= opts.maxPrice);
    if (opts.stops.size) list = list.filter((f) => opts.stops.has(f.stops >= 2 ? 2 : f.stops));
    if (opts.airlines.size) list = list.filter((f) => opts.airlines.has(f.airline.code));
    if (opts.layovers.size) {
      list = list.filter((f) => f.layoverAirport && opts.layovers.has(f.layoverAirport));
    }
    if (opts.cabins.size) list = list.filter((f) => opts.cabins.has(f.cabin));
    if (opts.bagKgs.size) list = list.filter((f) => opts.bagKgs.has(f.baggage.checkedKg));
    if (opts.fareFlex === "flexible") list = list.filter((f) => f.refundable === true);
    if (opts.fareFlex === "saver") list = list.filter((f) => f.refundable === false);
    if (opts.outboundDepart.size) {
      list = list.filter((f) => matchesWindows(f.departTime, opts.outboundDepart));
    }
    if (opts.outboundArrive.size) {
      list = list.filter((f) => matchesWindows(f.arriveTime, opts.outboundArrive));
    }
    if (opts.returnDepart.size) {
      list = list.filter(
        (f) => f.returnLeg && matchesWindows(f.returnLeg.departTime, opts.returnDepart),
      );
    }
    if (opts.returnArrive.size) {
      list = list.filter(
        (f) => f.returnLeg && matchesWindows(f.returnLeg.arriveTime, opts.returnArrive),
      );
    }
    const sorted = [...list];
    if (opts.sort === "cheapest") sorted.sort((a, b) => a.price - b.price);
    else if (opts.sort === "fastest") sorted.sort((a, b) => a.durationMinutes - b.durationMinutes);
    else if (opts.sort === "earliest")
      sorted.sort((a, b) => a.departTime.localeCompare(b.departTime));
    else
      sorted.sort(
        (a, b) =>
          a.price / 10 + a.durationMinutes - (b.price / 10 + b.durationMinutes) || a.price - b.price,
      );
    return sorted;
  }, [flights, opts]);
}
