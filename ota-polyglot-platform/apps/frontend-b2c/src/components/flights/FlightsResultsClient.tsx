"use client";

import { addDays, differenceInCalendarDays, format as formatDate, parseISO } from "date-fns";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { AirlineLogo } from "@/components/flights/AirlineLogo";
import FilterPanel from "@/components/flights/FilterPanel";
import FlightCard, {
  EmptyFlights,
  NoFares,
  FlightCardSkeleton,
  FlightError,
  useSortedFilteredFlights,
} from "@/components/flights/FlightCard";
import SearchLoadingOverlay from "@/components/flights/SearchLoadingOverlay";
import ModifySearchOverlay from "@/components/flights/ModifySearchOverlay";
import BottomSheet from "@/components/ui/BottomSheet";
import { useApp } from "@/context/AppProviders";
import { useAirport } from "@/lib/airports";
import { loginHref } from "@/lib/auth-redirect";
import { packageOptionsFor } from "@/lib/fare-packages";
import { writeMultiPicks } from "@/lib/multi-picks";
import { formatDuration, type Flight } from "@/lib/flight-types";
import {
  emptySchedule,
  type SchedulePick,
  type TimeWindowId,
} from "@/lib/schedule-windows";

export default function FlightsResultsClient() {
  const params = useSearchParams();
  const router = useRouter();
  const { setSelectedOutbound, setFareOptions, setSearch, setPriceCurrency, format, user, userLoaded } = useApp();

  const from = (params.get("from") ?? "").toUpperCase();
  const to = (params.get("to") ?? "").toUpperCase();
  const depart = params.get("depart") ?? "";
  const returnDate = params.get("return") ?? "";
  const trip = params.get("trip") ?? "oneway";
  const adults = Number(params.get("adults") ?? "1");
  const children = Number(params.get("children") ?? "0");
  const infants = Number(params.get("infants") ?? "0");
  const cabin = (params.get("cabin") ?? "economy") as
    | "economy"
    | "premium"
    | "business"
    | "first";

  const multiLegs = useMemo(() => {
    if (trip !== "multi") return [];
    const count = Number(params.get("legs") ?? "0");
    const max = Math.min(5, Math.max(count, 0));
    const legs: { from: string; to: string; date: string }[] = [];
    for (let i = 1; i <= max; i += 1) {
      const legFrom = (params.get(`leg${i}From`) ?? "").toUpperCase();
      const legTo = (params.get(`leg${i}To`) ?? "").toUpperCase();
      const legDate = params.get(`leg${i}Date`) ?? "";
      if (legFrom && legTo && legDate) {
        legs.push({ from: legFrom, to: legTo, date: legDate });
      }
    }
    if (legs.length < 2 && from && to && depart) {
      const secondDate = params.get("leg2Date") || returnDate || depart;
      return [
        { from, to, date: depart },
        {
          from: to,
          to: (params.get("leg2To") ?? "LHR").toUpperCase(),
          date: secondDate,
        },
      ];
    }
    return legs;
  }, [trip, params, from, to, depart, returnDate]);

  const isMulti = trip === "multi";
  const [activeLegIndex, setActiveLegIndex] = useState(0);
  const [pickedByLeg, setPickedByLeg] = useState<Record<number, Flight>>({});

  // Reset leg picker when the multi-city itinerary in the URL changes.
  const multiSignature = multiLegs.map((l) => `${l.from}-${l.to}-${l.date}`).join("|");
  useEffect(() => {
    setActiveLegIndex(0);
    setPickedByLeg({});
  }, [multiSignature]);

  const activeLeg =
    isMulti && multiLegs[activeLegIndex]
      ? multiLegs[activeLegIndex]!
      : { from, to, date: depart };

  const travellers = adults + children + infants;

  const [result, setResult] = useState<{
    key: string;
    flights: Flight[];
    error: string;
    ceiling: number;
    partial?: boolean;
    /** The slow airlines are still being asked; their fares will be added to the list. */
    moreComing?: boolean;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const autoRetried = useRef("");
  const [sort, setSort] = useState<"best" | "cheapest" | "fastest" | "earliest">("best");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [maxPrice, setMaxPrice] = useState(2000);
  const [stops, setStops] = useState<Set<number>>(new Set());
  const [selectedAirlines, setSelectedAirlines] = useState<Set<string>>(new Set());
  const [selectedLayovers, setSelectedLayovers] = useState<Set<string>>(new Set());
  const [schedule, setSchedule] = useState<SchedulePick>(emptySchedule);
  const scheduleRoute = `${trip}|${activeLeg.from}|${activeLeg.to}`;
  useEffect(() => {
    setSchedule(emptySchedule());
  }, [scheduleRoute]);
  const [cabins, setCabins] = useState<Set<string>>(new Set());
  const [bagKgs, setBagKgs] = useState<Set<number>>(new Set());
  const [fareFlex, setFareFlex] = useState<"any" | "flexible" | "saver">("any");

  const searchKey = isMulti
    ? `multi|${activeLegIndex}|${activeLeg.from}|${activeLeg.to}|${activeLeg.date}|${adults}|${children}|${infants}|${cabin}|${attempt}`
    : `${from}|${to}|${depart}|${trip === "round" ? returnDate : ""}|${adults}|${children}|${infants}|${cabin}|${attempt}`;

  useEffect(() => {
    setSearch({
      from,
      to,
      depart,
      returnDate,
      trip: trip === "round" ? "round" : trip === "multi" ? "multi" : "oneway",
      cabin,
      passengers: { adults, children, infants },
    });
  }, [from, to, depart, returnDate, trip, cabin, adults, children, infants, setSearch]);

  useEffect(() => {
    const key = searchKey;
    const controller = new AbortController();
    setResult(null);

    const fail = (message: string) => setResult({ key, flights: [], error: message, ceiling: 500 });

    if (isMulti) {
      if (multiLegs.length < 2) {
        fail("Multi-city needs at least two flights. Please modify your search.");
        return () => controller.abort();
      }
      if (!activeLeg.from || !activeLeg.to || !activeLeg.date) {
        fail("Missing search parameters. Please start a new search.");
        return () => controller.abort();
      }
    } else if (!from || !to || !depart) {
      fail("Missing search parameters. Please start a new search.");
      return () => controller.abort();
    }
    if (infants > adults) {
      fail("Each infant needs an accompanying adult. Please modify your search.");
      return () => controller.abort();
    }

    const origin = isMulti ? activeLeg.from : from;
    const destination = isMulti ? activeLeg.to : to;
    const checkIn = isMulti ? activeLeg.date : depart;
    const checkOut = !isMulti && trip === "round" ? returnDate : "";

    const ask = (speed: "fast" | "slow") =>
      fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          origin,
          destination,
          checkIn,
          checkOut,
          adults,
          children,
          infants,
          cabin,
          speed,
        }),
      }).then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.message ?? "We couldn't complete that search. Please try again.");
        return body as { flights: Flight[]; currency: string; partial?: boolean };
      });

    // C1-6: this page only searches. The airline revalidate happens once, on the passenger page, immediately before reserve.
    // Two searches at once. If the slow airlines answer within a few seconds, the list is shown once, complete.
    // After that the quick fares appear with a clear "still loading" state, and the slow fares are added when they arrive.
    const SLOW_GRACE_MS = 3000;
    const slow = ask("slow").catch((): null => null);
    ask("fast")
      .then(async (body) => {
        // Nothing came back AND an airline did not answer: that is a failed search, not an empty sky. Try once more by ourselves before saying so.
        const base = searchKey.replace(/\|\d+$/, "");
        if (body.flights.length === 0 && body.partial && autoRetried.current !== base) {
          autoRetried.current = base;
          setAttempt((n) => n + 1);
          return null;
        }
        const ceiling = Math.max(...body.flights.map((f) => f.price), 500);
        if (body.currency) setPriceCurrency(body.currency);
        // Clock starts when the quick fares are ready, so a 2–3s slow answer still joins the first paint.
        const arrived = await new Promise<Awaited<typeof slow> | "timeout">((resolve) => {
          const timer = window.setTimeout(() => resolve("timeout"), SLOW_GRACE_MS);
          const stop = () => window.clearTimeout(timer);
          controller.signal.addEventListener("abort", stop, { once: true });
          slow.then((extra) => {
            stop();
            resolve(extra);
          });
        });
        if (controller.signal.aborted) return null;
        if (arrived !== "timeout") {
          const flights = arrived ? [...body.flights, ...arrived.flights].sort((a, b) => a.price - b.price) : body.flights;
          const widest = Math.max(ceiling, ...flights.map((f) => f.price));
          setResult({
            key,
            flights,
            error: "",
            ceiling: widest,
            partial: Boolean(body.partial) || !arrived || Boolean(arrived.partial),
            moreComing: false,
          });
          setMaxPrice(Math.ceil(widest));
          return null;
        }
        setResult({ key, flights: body.flights, error: "", ceiling, partial: body.partial, moreComing: true });
        setMaxPrice(Math.ceil(ceiling));
        return slow.then((extra) => ({ extra, ceiling }));
      })
      .then((done) => {
        if (!done || controller.signal.aborted) return;
        const { extra, ceiling } = done;
        const widest = extra ? Math.max(ceiling, ...extra.flights.map((f) => f.price)) : ceiling;
        setMaxPrice((current) => (current >= Math.ceil(ceiling) ? Math.ceil(widest) : current)); // follow the new top price unless the visitor already narrowed the budget
        setResult((prev) => {
          if (!prev || prev.key !== key) return prev;
          const flights = extra ? [...prev.flights, ...extra.flights].sort((a, b) => a.price - b.price) : prev.flights;
          const newCeiling = Math.max(ceiling, ...flights.map((f) => f.price));
          return { ...prev, flights, ceiling: newCeiling, partial: prev.partial || !extra || Boolean(extra.partial), moreComing: false };
        });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        fail(err instanceof Error ? err.message : "We couldn't complete that search. Please try again.");
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey, trip, returnDate, adults, children, infants, cabin, attempt, isMulti, activeLeg.from, activeLeg.to, activeLeg.date]);

  const loading = !result || result.key !== searchKey;
  const error = result?.key === searchKey ? result.error : "";
  const flights = result?.key === searchKey ? result.flights : [];
  const priceCeiling = result?.key === searchKey ? result.ceiling : 500;
  const partial = result?.key === searchKey ? Boolean(result.partial) : false;
  const moreComing = result?.key === searchKey ? Boolean(result.moreComing) : false;

  const filtered = useSortedFilteredFlights(flights, {
    sort,
    maxPrice,
    stops,
    airlines: selectedAirlines,
    outboundDepart: schedule.outboundDepart,
    outboundArrive: schedule.outboundArrive,
    returnDepart: schedule.returnDepart,
    returnArrive: schedule.returnArrive,
    layovers: selectedLayovers,
    cabins,
    bagKgs,
    fareFlex,
  });

  const { lowestId, quickestId, bestId } = useMemo(() => {
    if (!filtered.length) return { lowestId: "", quickestId: "", bestId: "" };
    let lowest = filtered[0]!;
    let quickest = filtered[0]!;
    let best = filtered[0]!;
    for (const f of filtered) {
      if (f.price < lowest.price) lowest = f;
      if (f.durationMinutes < quickest.durationMinutes) quickest = f;
      const score = f.price / 10 + f.durationMinutes;
      const bestScore = best.price / 10 + best.durationMinutes;
      if (score < bestScore || (score === bestScore && f.price < best.price)) best = f;
    }
    return { lowestId: lowest.id, quickestId: quickest.id, bestId: best.id };
  }, [filtered]);

  const airlineStrip = useMemo(() => {
    const map = new Map<
      string,
      { code: string; name: string; color: string; logoUrl?: string; min: number; count: number }
    >();
    for (const f of flights) {
      const prev = map.get(f.airline.code);
      if (!prev) {
        map.set(f.airline.code, {
          code: f.airline.code,
          name: f.airline.name,
          color: f.airline.color,
          logoUrl: f.airline.logoUrl,
          min: f.price,
          count: 1,
        });
      } else {
        prev.count += 1;
        if (f.price < prev.min) prev.min = f.price;
      }
    }
    return [...map.values()].sort((a, b) => a.min - b.min);
  }, [flights]);

  const bagOptions = useMemo(() => {
    const weights = [...new Set(flights.map((f) => f.baggage.checkedKg).filter((kg) => kg > 0))].sort((a, b) => a - b);
    return weights.map((kg) => ({ kg, count: flights.filter((f) => f.baggage.checkedKg === kg).length }));
  }, [flights]);

  const layoverOptions = useMemo(() => {
    const set = new Set<string>();
    for (const f of flights) {
      if (f.layoverAirport) set.add(f.layoverAirport);
    }
    return [...set].sort();
  }, [flights]);

  const fromCity = useAirport(from)?.city ?? from;
  const toCity = useAirport(to)?.city ?? to;
  const scheduleFromCity = useAirport(activeLeg.from)?.city ?? activeLeg.from;
  const scheduleToCity = useAirport(activeLeg.to)?.city ?? activeLeg.to;
  const isRound = trip === "round";

  const dateLabel = useMemo(() => {
    try {
      if (isMulti && multiLegs.length > 0) {
        const first = multiLegs[0]!;
        const last = multiLegs[multiLegs.length - 1]!;
        const [fy, fm, fd] = first.date.split("-").map(Number);
        const [ly, lm, ld] = last.date.split("-").map(Number);
        if (!fy || !fm || !fd) return first.date;
        const start = formatDate(new Date(fy, fm - 1, fd), "d MMM");
        if (ly && lm && ld && last.date !== first.date) {
          return `${start} – ${formatDate(new Date(ly, lm - 1, ld), "d MMM")}`;
        }
        return start;
      }
      const [y, m, d] = depart.split("-").map(Number);
      if (!y || !m || !d) return depart;
      const start = formatDate(new Date(y, m - 1, d), "d MMM");
      if (isRound && returnDate) {
        const [ry, rm, rd] = returnDate.split("-").map(Number);
        if (ry && rm && rd) {
          return `${start} – ${formatDate(new Date(ry, rm - 1, rd), "d MMM")}`;
        }
      }
      return start;
    } catch {
      return depart;
    }
  }, [depart, returnDate, isRound, isMulti, multiLegs]);

  const routeTitle = useMemo(() => {
    if (isMulti && multiLegs.length > 0) {
      return multiLegs.map((leg) => leg.from).concat(multiLegs[multiLegs.length - 1]!.to).join(" → ");
    }
    return `${fromCity} (${from}) ${isRound ? "⇌" : "→"} ${toCity} (${to})`;
  }, [isMulti, multiLegs, fromCity, from, toCity, to, isRound]);

  const tripLabel = isMulti ? "Multi city" : isRound ? "Round trip" : "One way";

  const airlineStripRef = useRef<HTMLDivElement>(null);

  const scrollAirlines = (dir: -1 | 1) => {
    airlineStripRef.current?.scrollBy({ left: dir * 220, behavior: "smooth" });
  };

  const toggle = <T,>(set: Set<T>, value: T, setter: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  };

  const clearFilters = () => {
    setStops(new Set());
    setSelectedAirlines(new Set());
    setSelectedLayovers(new Set());
    setSchedule(emptySchedule());
    setCabins(new Set());
    setBagKgs(new Set());
    setFareFlex("any");
    setMaxPrice(priceCeiling);
  };

  const changeDate = (date: string, nextReturn?: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("depart", date);
    if (trip === "round") {
      if (nextReturn) {
        next.set("return", nextReturn);
      } else if (returnDate && depart) {
        try {
          const nights = differenceInCalendarDays(parseISO(returnDate), parseISO(depart));
          next.set(
            "return",
            formatDate(addDays(parseISO(date), Math.max(1, nights)), "yyyy-MM-dd"),
          );
        } catch {
          /* keep existing return */
        }
      }
    }
    router.push(`/flights?${next.toString()}`);
  };

  const tripNights = useMemo(() => {
    if (trip !== "round" || !returnDate || !depart) return 0;
    try {
      return Math.max(1, differenceInCalendarDays(parseISO(returnDate), parseISO(depart)));
    } catch {
      return 2;
    }
  }, [trip, returnDate, depart]);

  const dateStrip = useMemo(() => {
    if (!depart) return [];
    try {
      const base = parseISO(depart);
      const half = 7;
      return Array.from({ length: half * 2 + 1 }, (_, i) => {
        const d = addDays(base, i - half);
        const iso = formatDate(d, "yyyy-MM-dd");
        const min = 0; // per-day fares would need a search per day; only the searched day shows a real price
        const startLabel = formatDate(d, "MMM d");
        const label =
          trip === "round" && tripNights > 0
            ? `${startLabel}–${formatDate(addDays(d, tripNights), "MMM d")}`
            : formatDate(d, "MMM d");
        return { iso, label, min };
      });
    } catch {
      return [];
    }
  }, [depart, from, to, trip, tripNights]);

  const dateStripRef = useRef<HTMLDivElement>(null);
  const scrollDates = (dir: -1 | 1) => {
    const el = dateStripRef.current;
    if (!el) return;
    const step = Math.max(256, Math.floor(el.clientWidth * 0.7));
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  useEffect(() => {
    const el = dateStripRef.current;
    if (!el || !depart) return;
    const active = el.querySelector<HTMLElement>('[aria-selected="true"]');
    active?.scrollIntoView({ inline: "center", block: "nearest", behavior: "auto" });
  }, [depart, dateStrip.length]);

  const goToFare = () => {
    // Offer + package options are already in AppProviders; require a session before checkout.
    if (!userLoaded) return;
    if (!user) {
      router.push(loginHref("/booking/fare"));
      return;
    }
    router.push("/booking/fare");
  };

  const onSelect = (flight: Flight) => {
    if (!isMulti) {
      setSelectedOutbound(flight);
      setFareOptions(packageOptionsFor(flight, flights));
      goToFare();
      return;
    }

    const nextPicks = { ...pickedByLeg, [activeLegIndex]: flight };
    setPickedByLeg(nextPicks);

    if (activeLegIndex < multiLegs.length - 1) {
      setActiveLegIndex(activeLegIndex + 1);
      setAttempt(0);
      clearFilters();
      return;
    }

    // Checkout books every leg as one payment. The first flight is what the fare step shows; the rest travel with it.
    const first = nextPicks[0] ?? flight;
    setSelectedOutbound(first);
    setFareOptions(packageOptionsFor(first, flights));
    writeMultiPicks(
      multiLegs.map((leg, i) => ({
        from: leg.from,
        to: leg.to,
        date: leg.date,
        offerId: nextPicks[i]?.id ?? null,
        price: nextPicks[i]?.price ?? null,
        airline: nextPicks[i]?.airline.code ?? null,
      })),
    );
    goToFare();
  };

  const filterProps = {
    maxPrice,
    priceCeiling,
    onMaxPrice: setMaxPrice,
    stops,
    onToggleStop: (n: number) => toggle(stops, n, setStops),
    availableAirlines: airlineStrip,
    selectedAirlines,
    onToggleAirline: (code: string) => toggle(selectedAirlines, code, setSelectedAirlines),
    layovers: layoverOptions,
    selectedLayovers,
    onToggleLayover: (code: string) => toggle(selectedLayovers, code, setSelectedLayovers),
    originCity: scheduleFromCity,
    destinationCity: scheduleToCity,
    roundTrip: isRound && !isMulti,
    schedule,
    onToggleWindow: (key: keyof SchedulePick, id: TimeWindowId) => {
      setSchedule((prev) => {
        const next = new Set(prev[key]);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { ...prev, [key]: next };
      });
    },
    cabins,
    onToggleCabin: (c: string) => toggle(cabins, c, setCabins),
    bagKgs,
    onToggleBagKg: (kg: number) => toggle(bagKgs, kg, setBagKgs),
    bagOptions,
    fareFlex,
    onFareFlex: setFareFlex,
    hasRefundData: flights.some((f) => f.refundable !== undefined),
    onClear: clearFilters,
    holdKey: searchKey,
  };

  return (
    <div className="bg-bg">
      {loading ? (
        <SearchLoadingOverlay
          from={activeLeg.from}
          to={activeLeg.to}
          depart={activeLeg.date}
          returnDate={isMulti ? "" : returnDate}
          trip={isMulti ? "oneway" : trip}
          travellers={Math.max(1, travellers)}
        />
      ) : null}

      <div className="sticky top-16 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-navy sm:text-base">
              {routeTitle}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate">
              <span>{tripLabel}</span>
              <span aria-hidden>·</span>
              <span>{dateLabel}</span>
              <span aria-hidden>·</span>
              <span>
                {travellers} traveller{travellers === 1 ? "" : "s"}
                {infants > 0 ? ` (${infants} infant${infants === 1 ? "" : "s"})` : ""}
              </span>
              <span aria-hidden>·</span>
              <span className="capitalize">{cabin}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="min-h-11 rounded-full border border-border px-4 text-sm font-semibold text-navy hover:border-primary-strong/40"
          >
            Modify
          </button>
        </div>
      </div>

      {!isMulti && dateStrip.length > 0 ? (
        <div className="border-b border-border bg-card">
          <div className="mx-auto flex h-[60px] w-full max-w-[1320px] items-stretch overflow-hidden px-2 sm:px-4 lg:px-6">
            <button
              type="button"
              aria-label="Earlier dates"
              onClick={() => scrollDates(-1)}
              className="relative z-10 flex w-8 shrink-0 items-center justify-center self-center text-slate hover:text-navy sm:w-10"
            >
              <LuChevronLeft className="h-5 w-5" aria-hidden />
            </button>

            <div
              ref={dateStripRef}
              className="flex min-w-0 flex-1 items-stretch overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="listbox"
              aria-label="Flexible dates"
            >
              {dateStrip.map((d) => {
                const active = d.iso === depart;
                return (
                  <button
                    key={d.iso}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => changeDate(d.iso)}
                    className={`relative flex w-[118px] shrink-0 flex-col items-center justify-center gap-0.5 border-r border-border px-2 text-center sm:w-[128px] ${
                      active ? "text-navy" : "text-slate hover:bg-bg/80 hover:text-navy"
                    }`}
                  >
                    <span
                      className={`block w-full truncate text-xs leading-tight sm:text-sm ${
                        active ? "font-bold" : "font-medium"
                      }`}
                    >
                      {d.label}
                    </span>
                    <span
                      className={`block w-full truncate text-[11px] leading-tight sm:text-xs ${
                        active ? "font-bold text-navy" : "text-slate"
                      }`}
                    >
                      {active && flights.length > 0 ? format(Math.min(...flights.map((f) => f.price))) : "View fares"}
                    </span>
                    {active ? (
                      <span className="absolute inset-x-0 bottom-0 h-[3px] bg-navy" />
                    ) : null}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              aria-label="Later dates"
              onClick={() => scrollDates(1)}
              className="relative z-10 flex w-8 shrink-0 items-center justify-center self-center text-slate hover:text-navy sm:w-10"
            >
              <LuChevronRight className="h-5 w-5" aria-hidden />
            </button>

          </div>
        </div>
      ) : null}

      <div className="mx-auto grid max-w-[1320px] items-start gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[280px_1fr]">
        <aside className="hidden self-start rounded-2xl border border-border bg-card p-5 lg:block">
          <FilterPanel {...filterProps} />
        </aside>

        <div className="min-w-0 space-y-3">
          <div>
            <p className="text-base font-bold leading-tight text-navy sm:text-lg">
              {loading ? "Searching…" : `${filtered.length} available flights`}
            </p>
            <p className="mt-0.5 text-xs text-slate">* Prices include taxes & fees</p>
            {isMulti && multiLegs.length > 0 ? (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap gap-2" role="tablist" aria-label="Multi-city flights">
                  {multiLegs.map((leg, index) => {
                    const active = index === activeLegIndex;
                    const picked = Boolean(pickedByLeg[index]);
                    return (
                      <button
                        key={`${leg.from}-${leg.to}-${leg.date}-${index}`}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => {
                          setActiveLegIndex(index);
                          setAttempt(0);
                        }}
                        className={`inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold transition ${
                          active
                            ? "bg-primary-strong text-white"
                            : picked
                              ? "bg-primary-tint text-primary-strong ring-1 ring-primary-strong/30"
                              : "border border-border bg-card text-slate hover:text-navy"
                        }`}
                      >
                        <span>
                          Flight {index + 1}: {leg.from} → {leg.to}
                        </span>
                        {picked ? <span aria-hidden>✓</span> : null}
                      </button>
                    );
                  })}
                </div>
                <p className="rounded-lg bg-primary-tint px-3 py-2 text-xs text-navy" role="status">
                  Multi-city: pick a fare for each flight in order. Online checkout books flight 1;
                  other selected flights are saved for your trip summary.
                </p>
              </div>
            ) : null}
            {trip === "round" ? (
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-primary-tint px-3 py-2 text-xs text-navy" role="status">
                Round-trip fares come from some airlines only. Some airlines sell one-way tickets only.
                <button
                  type="button"
                  className="font-bold text-primary-strong underline"
                  onClick={() => {
                    const next = new URLSearchParams(params.toString());
                    next.set("trip", "oneway");
                    next.delete("return");
                    router.push(`/flights?${next.toString()}`);
                  }}
                >
                  Show one-way fares for {from} → {to}
                </button>
              </p>
            ) : null}
            {moreComing ? (
              <p className="mt-2 rounded-lg bg-primary-tint px-3 py-2 text-sm font-semibold text-navy" role="status">
                More airlines are still loading. New fares may appear in this list.
              </p>
            ) : null}
            {partial && !moreComing ? (
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning-text" role="status">
                Some airlines were slow to answer, so a few fares may be missing from this list.
                <button type="button" onClick={() => setAttempt((n) => n + 1)} className="font-bold underline">
                  Search again
                </button>
              </p>
            ) : null}
          </div>

          {!loading && airlineStrip.length > 0 ? (
            <div className="flex h-[56px] items-stretch overflow-hidden rounded-xl border border-border bg-bg">
              <button
                type="button"
                aria-label="Previous airlines"
                onClick={() => scrollAirlines(-1)}
                className="flex w-9 shrink-0 items-center justify-center border-r border-border text-slate transition hover:bg-card hover:text-navy sm:w-10"
              >
                <LuChevronLeft className="h-5 w-5" aria-hidden />
              </button>
              <div
                ref={airlineStripRef}
                className="flex min-w-0 flex-1 items-stretch overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                role="listbox"
                aria-label="Filter by airline"
              >
                {airlineStrip.map((a, i) => {
                  const active = selectedAirlines.has(a.code);
                  return (
                    <button
                      key={a.code}
                      type="button"
                      role="option"
                      aria-selected={active}
                      title={a.name}
                      onClick={() => toggle(selectedAirlines, a.code, setSelectedAirlines)}
                      className={`flex h-full w-[148px] shrink-0 items-center gap-2.5 border-y-2 px-3 text-left transition ${
                        i > 0 ? "border-l border-l-border" : ""
                      } ${
                        active
                          ? "border-y-primary-strong bg-primary-tint shadow-[inset_0_0_0_1px_var(--color-primary-strong)]"
                          : "border-y-transparent bg-transparent hover:bg-card"
                      }`}
                    >
                      <AirlineLogo airline={a} size="sm" />
                      <span className="min-w-0 leading-tight">
                        <span
                          className={`block truncate text-sm font-bold ${
                            active ? "text-primary-strong" : "text-navy"
                          }`}
                        >
                          {a.code}
                        </span>
                        <span
                          className={`block truncate text-xs ${
                            active ? "text-primary-strong/80" : "text-slate"
                          }`}
                        >
                          {format(a.min)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                aria-label="Next airlines"
                onClick={() => scrollAirlines(1)}
                className="flex w-9 shrink-0 items-center justify-center border-l border-border text-slate transition hover:bg-card hover:text-navy sm:w-10"
              >
                <LuChevronRight className="h-5 w-5" aria-hidden />
              </button>
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="min-h-12 shrink-0 rounded-full border border-border bg-card px-4 text-sm font-semibold lg:hidden"
              onClick={() => setFiltersOpen(true)}
            >
              Filters
            </button>
            <div
              className="grid h-12 min-w-0 flex-1 grid-cols-4 gap-1 rounded-xl border border-border bg-card "
              role="tablist"
              aria-label="Sort flights"
            >
              {(
                [
                  { id: "best", label: "Recommend" },
                  { id: "cheapest", label: "Cheapest" },
                  { id: "earliest", label: "Earliest" },
                  { id: "fastest", label: "Fastest" },
                ] as const
              ).map((opt) => {
                const active = sort === opt.id;
                const meta =
                  !filtered.length
                    ? null
                    : opt.id === "cheapest"
                      ? format(Math.min(...filtered.map((f) => f.price)))
                      : opt.id === "earliest"
                        ? [...filtered].sort((a, b) =>
                            a.departTime.localeCompare(b.departTime),
                          )[0]?.departTime
                        : opt.id === "fastest"
                          ? formatDuration(
                              Math.min(...filtered.map((f) => f.durationMinutes)),
                            )
                          : format(
                              [...filtered].sort(
                                (a, b) =>
                                  a.price / 10 +
                                    a.durationMinutes -
                                    (b.price / 10 + b.durationMinutes) ||
                                  a.price - b.price,
                              )[0]!.price,
                            );
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSort(opt.id)}
                    className={`flex h-full min-w-0 flex-col items-center justify-center rounded-lg px-1 text-center leading-tight transition sm:px-2 ${
                      active
                        ? "bg-primary-strong text-white shadow-none"
                        : "bg-transparent text-navy hover:bg-bg"
                    }`}
                  >
                    <span
                      className={`block w-full truncate text-xs font-semibold sm:text-sm ${
                        active ? "text-white" : "text-navy"
                      }`}
                    >
                      {opt.label}
                    </span>
                    {meta ? (
                      <span
                        className={`mt-0.5 block w-full truncate text-[10px] sm:text-xs ${
                          active ? "text-white" : "text-slate"
                        }`}
                      >
                        {meta}
                      </span>
                    ) : (
                      <span className="mt-0.5 block h-[14px] sm:h-[16px]" aria-hidden />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {error ? <FlightError message={error} /> : null}
          {loading ? (
            <div className="space-y-3">
              <FlightCardSkeleton />
              <FlightCardSkeleton />
              <FlightCardSkeleton />
            </div>
          ) : null}
          {!loading && !error && flights.length === 0 && !moreComing ? <NoFares failed={partial} onRetry={() => setAttempt((n) => n + 1)} /> : null}
          {!loading && !error && flights.length > 0 && filtered.length === 0 ? <EmptyFlights /> : null}
          {!loading && !error
            ? filtered.map((flight) => {
                const badges: ("lowest" | "quickest" | "best")[] = [];
                if (bestId && flight.id === bestId) badges.push("best");
                if (lowestId && flight.id === lowestId) badges.push("lowest");
                if (quickestId && flight.id === quickestId) badges.push("quickest");
                return (
                  <FlightCard
                    key={flight.id}
                    flight={flight}
                    onSelect={onSelect}
                    badges={badges}
                  />
                );
              })
            : null}
          {moreComing ? (
            <div className="space-y-3" aria-hidden>
              <FlightCardSkeleton />
              <FlightCardSkeleton />
            </div>
          ) : null}
        </div>
      </div>

      <BottomSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Refine results">
        <FilterPanel {...filterProps} />
      </BottomSheet>

      <ModifySearchOverlay open={editOpen} onClose={() => setEditOpen(false)} />

    </div>
  );
}
