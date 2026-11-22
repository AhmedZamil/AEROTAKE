"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import AirlineMark from "./airline-mark";
import type { FlightSearchQuery } from "./booking-search";
import { saveFlightBookingDraft } from "@/data/flight-booking";
import { SHOW_SUPPLIER_TAG, supplierLabel } from "@/lib/live-offers";
import {
  fareTiersFor,
  findAirline,
  findDate,
  pricedFlight,
  searchFlights,
  type DummyFlight,
} from "@/data/flight-search";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ClockIcon,
  CloseIcon,
  CopyIcon,
  DollarIcon,
  ExternalIcon,
  FilterIcon,
  HandBagIcon,
  InfoIcon,
  MoonIcon,
  PlaneLandingIcon,
  PlaneTakeoffIcon,
  RouteIcon,
  SeatIcon,
  SuitcaseIcon,
  SunIcon,
  SunriseIcon,
  SunsetIcon,
  UndoIcon,
} from "./icons";

type FlightOption = DummyFlight & {
  airline: string;
  shortName: string;
  // Present only for a round-trip live offer — one Sabre offer prices the
  // whole round trip together, so the return leg's summary rides alongside
  // the outbound FlightOption instead of being a separately bookable flight
  // (see the data-fetching effect below for why).
  returnLeg?: {
    departTime: string;
    arriveTime: string;
    duration: string;
    stops: number;
    code: string;
    fromCode: string;
    toCode: string;
  };
  // Undefined means "the source didn't say" (dummy/Intelli-Bestbuy data, or
  // a future supplier that doesn't report it) — filters and display treat
  // that the same as "not included" rather than guessing. See
  // offerToFlightOption below for where live data populates these.
  checkedBaggageIncluded?: boolean;
  checkedBaggageWeightKg?: number;
  // Real minutes between connecting segments, when segment-level data is
  // available (any live supplier). Falls back to flightLayoverHours's
  // duration-based approximation when undefined (dummy data only).
  layoverMinutes?: number;
  // Supplier net rate (pre-markup, pre-tax) for a live offer. Carried on the
  // booking draft so checkout can revalidate once, just before reserve (C1-6).
  // Undefined for dummy/Intelli-Bestbuy data, which is never revalidated.
  netRate?: number;
  // Which supplier sold this fare ("SABRE", "HAJEE", …) — undefined for the
  // dummy dataset. Shown as a small "via …" tag (see SHOW_SUPPLIER_TAG).
  supplierCode?: string;
};

// ---- Live search (Sabre via /api/search) ----------------------------------

type LiveSegment = {
  airlineCode: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureTime: string | null; // ISO UTC instant — for duration/layover math
  arrivalTime: string | null;
  departureTimeLocal: string; // ISO, no offset — local wall-clock, for display
  arrivalTimeLocal: string;
  bookingClass?: string;
  legIndex?: number;
};

type LiveOffer = {
  offerId: string;
  supplierCode: string;
  title: string;
  netRate: number;
  sellPrice: number;
  currency: string;
  segments: LiveSegment[];
  checkedBaggageIncluded: boolean;
  checkedBaggageWeightKg: number;
};

function localHHmm(iso: string) {
  return iso.slice(11, 16);
}

function formatDurationBetween(startIso: string | null, endIso: string | null) {
  if (!startIso || !endIso) return "";
  const totalMin = Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000));
  return `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
}

/** Real layover minutes: the gap between one segment's arrival and the next
 * segment's departure, summed across every connection in the leg. Genuinely
 * more accurate than a duration-based guess since it's the actual segment
 * timestamps — 0 for a non-stop leg (no gaps to sum). */
function sumLayoverMinutes(segments: LiveSegment[]) {
  let total = 0;
  for (let i = 1; i < segments.length; i++) {
    const prevArrival = segments[i - 1].arrivalTime;
    const nextDeparture = segments[i].departureTime;
    if (!prevArrival || !nextDeparture) continue;
    total += Math.max(0, (new Date(nextDeparture).getTime() - new Date(prevArrival).getTime()) / 60000);
  }
  return Math.round(total);
}

/** Summarizes one leg's worth of consecutive segments (a non-stop flight has
 * one; a connection has several) into the fields the existing card/detail
 * UI already renders per DummyFlight — so no downstream JSX has to know
 * whether it's looking at live or dummy data. */
function summarizeLegSegments(segments: LiveSegment[]) {
  const first = segments[0];
  const last = segments[segments.length - 1];
  return {
    departTime: localHHmm(first.departureTimeLocal),
    arriveTime: localHHmm(last.arrivalTimeLocal),
    duration: formatDurationBetween(first.departureTime, last.arrivalTime),
    stops: segments.length - 1,
    code: `${first.airlineCode} ${first.flightNumber}`.trim(),
    airlineCode: first.airlineCode,
    fromCode: first.origin,
    toCode: last.destination,
    layoverMinutes: sumLayoverMinutes(segments),
  };
}

/** Sabre doesn't reliably give us aircraft type, an exact refundable flag, or
 * live seat counts — rather than invent values, aircraft renders as absent
 * (hidden in the UI, see the two "• {aircraft}" spots below) and refundable
 * defaults to the conservative `false` (never over-promise flexibility a
 * fare might not actually have). */
function offerToFlightOption(offer: LiveOffer, legSegments: LiveSegment[], returnSegments?: LiveSegment[]): FlightOption {
  const summary = summarizeLegSegments(legSegments);
  const returnSummary = returnSegments?.length ? summarizeLegSegments(returnSegments) : null;
  return {
    id: returnSummary ? `${offer.offerId}` : offer.offerId,
    from: summary.fromCode,
    to: summary.toCode,
    date: legSegments[0].departureTimeLocal.slice(0, 10),
    airlineCode: summary.airlineCode,
    code: summary.code,
    aircraft: "",
    departTime: summary.departTime,
    arriveTime: summary.arriveTime,
    duration: summary.duration,
    price: offer.sellPrice,
    stops: summary.stops,
    refundable: false,
    seatsLeft: undefined,
    action: "book",
    airline: "",
    shortName: "",
    checkedBaggageIncluded: offer.checkedBaggageIncluded,
    checkedBaggageWeightKg: offer.checkedBaggageWeightKg > 0 ? offer.checkedBaggageWeightKg : undefined,
    layoverMinutes: summary.layoverMinutes,
    netRate: offer.netRate,
    supplierCode: offer.supplierCode,
    returnLeg: returnSummary
      ? {
          departTime: returnSummary.departTime,
          arriveTime: returnSummary.arriveTime,
          duration: returnSummary.duration,
          stops: returnSummary.stops,
          code: returnSummary.code,
          fromCode: returnSummary.fromCode,
          toCode: returnSummary.toCode,
        }
      : undefined,
  };
}

type FareTier = { id: string; name: string; price: number };

type SortOption = "cheapest" | "quickest" | "earliest" | "departure";

const sortOptions: { id: SortOption; label: string }[] = [
  { id: "cheapest", label: "Cheapest" },
  { id: "quickest", label: "Quickest" },
  { id: "earliest", label: "Earliest" },
  { id: "departure", label: "Departure" },
];

type ScheduleSlot = "all" | "morning" | "afternoon" | "evening" | "night";
type BaggageFilter = "all" | "checked";
type PriceMode = "gross" | "net";

const priceModes: { id: PriceMode; label: string }[] = [
  { id: "gross", label: "Gross Amount" },
  { id: "net", label: "Net Amount" },
];

const scheduleSlots: {
  id: Exclude<ScheduleSlot, "all">;
  label: string;
  range: string;
  icon: (props: { className?: string }) => React.ReactNode;
}[] = [
  { id: "morning", label: "Morning", range: "06:00 - 11:59", icon: SunriseIcon },
  { id: "afternoon", label: "After Noon", range: "12:00 - 17:59", icon: SunIcon },
  { id: "evening", label: "Evening", range: "18:00 - 23:59", icon: SunsetIcon },
  { id: "night", label: "Night", range: "00:00 - 05:59", icon: MoonIcon },
];

function cityCode(label: string) {
  const match = label.match(/\(([A-Z]{3})\)/);
  return match?.[1] ?? label.slice(0, 3).toUpperCase();
}

function cityName(label: string) {
  return label.replace(/\s*\([A-Z]{3}\)\s*$/, "");
}

const FLIGHTS_PER_PAGE = 15;

export default function FlightSearchResults({
  query,
}: {
  query: FlightSearchQuery;
}) {
  const router = useRouter();
  const [stops, setStops] = useState("all");
  const [selectedAirlines, setSelectedAirlines] = useState<string[] | null>(null);
  const [maxPrice, setMaxPrice] = useState(25000);
  const [openDetails, setOpenDetails] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState("flight");
  const [openFare, setOpenFare] = useState<string | null>(null);
  const [selectedFare, setSelectedFare] = useState<Record<string, string>>({});
  const [classFlight, setClassFlight] = useState<FlightOption | null>(null);
  const [bookingClass, setBookingClass] = useState("N1");
  const [secondsLeft, setSecondsLeft] = useState(23 * 60 + 51);
  const [sortBy, setSortBy] = useState<SortOption>("cheapest");
  const [sortOpen, setSortOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [priceMode, setPriceMode] = useState<PriceMode>("gross");
  const [priceModeOpen, setPriceModeOpen] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleSlot>("all");
  const [layoverMin, setLayoverMin] = useState(0);
  const [layoverMax, setLayoverMax] = useState(60);
  const [baggage, setBaggage] = useState<BaggageFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isDesktopLayout, setIsDesktopLayout] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSecondsLeft((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const sync = () => {
      setIsDesktopLayout(media.matches);
      if (media.matches) setFiltersOpen(false);
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!filtersOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [filtersOpen]);

  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const seconds = String(secondsLeft % 60).padStart(2, "0");
  const searchLegs =
    query.legs?.length > 0
      ? query.legs
      : [
          {
            from: query.from,
            to: query.to,
            date: query.departureDate,
            dateLabel: query.departureLabel,
            dateHint: query.departureHint,
            dateShort: query.departureShort,
          },
        ];

  const fromCode = searchLegs[0].from.code || cityCode(searchLegs[0].from.city);
  const toCode = searchLegs[0].to.code || cityCode(searchLegs[0].to.city);
  const fromCity = cityName(searchLegs[0].from.city);
  const toCity = cityName(searchLegs[0].to.city);

  const [legResults, setLegResults] = useState<
    {
      index: number;
      leg: (typeof searchLegs)[number];
      fromCode: string;
      toCode: string;
      fromCity: string;
      toCity: string;
      dateText: string;
      label: string;
      flights: FlightOption[];
    }[]
  >([]);
  const [searchLoading, setSearchLoading] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Suppliers that didn't answer (down/timed out) — results may be incomplete.
  const [searchWarnings, setSearchWarnings] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    function applyClientFilters(list: FlightOption[]) {
      return list.filter((flight) => {
        if (query.preferredAirline && query.preferredAirline !== "ALL" && flight.airlineCode !== query.preferredAirline) {
          return false;
        }
        if (query.flightType === "direct") return flight.stops === 0;
        if (query.flightType === "connecting") return flight.stops > 0;
        return true;
      });
    }

    function priceAndLabel(flight: DummyFlight | FlightOption): FlightOption {
      const priced = pricedFlight(flight, query.fareType, query.cabin);
      const airline = findAirline(flight.airlineCode);
      return {
        ...priced,
        airline: airline?.name ?? flight.airlineCode,
        shortName: airline?.shortName ?? flight.airlineCode,
        returnLeg: "returnLeg" in flight ? flight.returnLeg : undefined,
      };
    }

    // Intelli-Bestbuy is intentionally still dummy data — its GDS-paste flow
    // is a separate, narrower concern, out of scope for the live-Sabre wiring.
    if (query.tripType === "intelli-bestbuy") {
      const groups = searchLegs.map((leg, index) => {
        const legFrom = leg.from.code || cityCode(leg.from.city);
        const legTo = leg.to.code || cityCode(leg.to.city);
        const flights = applyClientFilters(
          searchFlights({ fromCode: legFrom, toCode: legTo, date: leg.date, airlineCode: query.preferredAirline }).map(priceAndLabel),
        );
        const dateInfo = findDate(leg.date);
        return {
          index,
          leg,
          fromCode: legFrom,
          toCode: legTo,
          fromCity: cityName(leg.from.city),
          toCity: cityName(leg.to.city),
          dateText: `${leg.dateShort || dateInfo.short}, ${leg.dateLabel || dateInfo.label}`,
          label: `Flight ${index + 1}`,
          flights,
        };
      });
      setLegResults(groups);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }

    const collectedWarnings = new Set<string>();

    async function fetchOffers(body: Record<string, unknown>): Promise<LiveOffer[]> {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productType: "PRODUCT_TYPE_FLIGHT",
          adults: Math.max(1, query.travelers || 1),
          ...body,
        }),
      });
      if (!res.ok) throw new Error(`search_failed_${res.status}`);
      const data = await res.json();
      for (const warning of (data.warnings ?? []) as string[]) collectedWarnings.add(warning);
      return (data.offers ?? []) as LiveOffer[];
    }

    async function run() {
      setSearchLoading(true);
      setSearchError(null);
      setSearchWarnings([]);
      try {
        if (query.tripType === "round-trip" && searchLegs.length > 1) {
          const offers = await fetchOffers({
            origin: searchLegs[0].from.code,
            destination: searchLegs[0].to.code,
            checkIn: searchLegs[0].date,
            checkOut: searchLegs[1].date,
          });
          const flights = applyClientFilters(
            offers
              .filter((offer) => offer.segments?.length)
              .map((offer) => {
                const outbound = offer.segments.filter((s) => (s.legIndex ?? 0) === 0);
                const ret = offer.segments.filter((s) => (s.legIndex ?? 0) === 1);
                return offerToFlightOption(offer, outbound, ret);
              }),
          ).map(priceAndLabel);
          const dateInfo = findDate(searchLegs[0].date);
          if (!cancelled) {
            setLegResults([
              {
                index: 0,
                leg: searchLegs[0],
                fromCode: searchLegs[0].from.code || cityCode(searchLegs[0].from.city),
                toCode: searchLegs[0].to.code || cityCode(searchLegs[0].to.city),
                fromCity: cityName(searchLegs[0].from.city),
                toCity: cityName(searchLegs[0].to.city),
                dateText: `${searchLegs[0].dateShort || dateInfo.short}, ${searchLegs[0].dateLabel || dateInfo.label}`,
                label: "Round Trip",
                flights,
              },
            ]);
          }
        } else {
          const groups = await Promise.all(
            searchLegs.map(async (leg, index) => {
              const legFrom = leg.from.code || cityCode(leg.from.city);
              const legTo = leg.to.code || cityCode(leg.to.city);
              const offers = await fetchOffers({ origin: legFrom, destination: legTo, checkIn: leg.date });
              const flights = applyClientFilters(
                offers.filter((offer) => offer.segments?.length).map((offer) => offerToFlightOption(offer, offer.segments)),
              ).map(priceAndLabel);
              const dateInfo = findDate(leg.date);
              return {
                index,
                leg,
                fromCode: legFrom,
                toCode: legTo,
                fromCity: cityName(leg.from.city),
                toCity: cityName(leg.to.city),
                dateText: `${leg.dateShort || dateInfo.short}, ${leg.dateLabel || dateInfo.label}`,
                label: query.tripType === "multi-city" ? `Flight ${index + 1}` : "Departure",
                flights,
              };
            }),
          );
          if (!cancelled) setLegResults(groups);
        }
      } catch {
        if (!cancelled) {
          setSearchError("We couldn't reach the fare system just now. Please try searching again.");
          setLegResults([]);
        }
      } finally {
        if (!cancelled) {
          setSearchWarnings([...collectedWarnings]);
          setSearchLoading(false);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [query]);

  const flights = useMemo(
    () => legResults.flatMap((group) => group.flights),
    [legResults],
  );

  const airlineStats = useMemo(() => {
    const map = new Map<string, { code: string; name: string; count: number; minPrice: number }>();
    for (const flight of flights) {
      const current = map.get(flight.airlineCode);
      if (current) {
        current.count += 1;
        current.minPrice = Math.min(current.minPrice, flight.price);
      } else {
        map.set(flight.airlineCode, {
          code: flight.airlineCode,
          name: flight.airline,
          count: 1,
          minPrice: flight.price,
        });
      }
    }
    return [...map.values()];
  }, [flights]);

  const priceBounds = useMemo(() => {
    if (!flights.length) {
      return { min: 5000, max: 25000 };
    }
    return {
      min: Math.min(...flights.map((flight) => flight.price)),
      max: Math.max(...flights.map((flight) => flight.price)),
    };
  }, [flights]);

  useEffect(() => {
    setSelectedAirlines(null);
    setMaxPrice(priceBounds.max);
    setOpenDetails(null);
    setOpenFare(null);
    setSelectedFare({});
    setSortOpen(false);
    setPriceModeOpen(false);
    setSchedule("all");
    setLayoverMin(0);
    setLayoverMax(60);
    setBaggage("all");
  }, [fromCode, priceBounds.max, query.cabin, query.departureDate, query.fareType, query.preferredAirline, toCode]);

  const activeAirlines = selectedAirlines ?? airlineStats.map((airline) => airline.code);
  const allAirlines =
    airlineStats.length > 0 && activeAirlines.length === airlineStats.length;

  const visibleFlights = useMemo(() => {
    const list = flights.filter((flight) => {
      const priceOk = flight.price <= maxPrice;
      const airlineOk = activeAirlines.includes(flight.airlineCode);
      const stopsOk =
        stops === "all" ||
        (stops === "direct" && flight.stops === 0) ||
        (stops === "1stop" && flight.stops === 1) ||
        (stops === "2stop" && flight.stops >= 2);
      const scheduleOk = schedule === "all" || departureSlot(flight.departTime) === schedule;
      const layover = flight.layoverMinutes !== undefined ? flight.layoverMinutes / 60 : flightLayoverHours(flight);
      const layoverOk = layover >= layoverMin && layover <= layoverMax;
      const baggageOk = baggage === "all" || hasCheckedBaggage(flight);
      return priceOk && airlineOk && stopsOk && scheduleOk && layoverOk && baggageOk;
    });

    return sortFlights(list, sortBy);
  }, [activeAirlines, baggage, flights, layoverMax, layoverMin, maxPrice, schedule, sortBy, stops]);

  // Any change to what's listed (filters, sort, a new search) goes back to page 1.
  // Keyed on the filter inputs themselves: `visibleFlights` is a fresh array on
  // every render, which would reset the page on each Next click.
  const activeAirlinesKey = activeAirlines.join(",");
  useEffect(() => {
    setPage(1);
  }, [flights, activeAirlinesKey, baggage, layoverMax, layoverMin, maxPrice, schedule, sortBy, stops]);

  const pageCount = useMemo(() => {
    const ids = new Set(visibleFlights.map((flight) => flight.id));
    const largestGroup = Math.max(
      0,
      ...legResults.map((group) => group.flights.filter((flight) => ids.has(flight.id)).length),
    );
    return Math.max(1, Math.ceil(largestGroup / FLIGHTS_PER_PAGE));
  }, [legResults, visibleFlights]);
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * FLIGHTS_PER_PAGE;

  // Numbered pager: always show first/last, a window around the current
  // page, and "…" for whatever's skipped — so it stays usable at 20+ pages
  // instead of listing every number.
  const pageNumbers = useMemo(() => {
    const numbers: (number | "…")[] = [];
    let previous = 0;
    for (let n = 1; n <= pageCount; n++) {
      if (n === 1 || n === pageCount || Math.abs(n - currentPage) <= 1) {
        if (previous && n - previous > 1) numbers.push("…");
        numbers.push(n);
        previous = n;
      }
    }
    return numbers;
  }, [currentPage, pageCount]);

  const activeFilterCount = [
    stops !== "all",
    selectedAirlines !== null && selectedAirlines.length !== airlineStats.length,
    maxPrice < priceBounds.max,
    schedule !== "all",
    layoverMin > 0 || layoverMax < 60,
    baggage !== "all",
  ].filter(Boolean).length;

  function proceedToBooking(
    flight: FlightOption,
    tier: FareTier,
    leg: {
      fromCode: string;
      toCode: string;
      fromCity: string;
      toCity: string;
      dateText: string;
    },
    priceOverride?: number,
  ) {
    saveFlightBookingDraft({
      flightId: flight.id,
      fareTierId: tier.id,
      fareTierName: tier.name,
      pricePerAdult: priceOverride ?? tier.price,
      adults: Math.max(1, query.travelers),
      fromCode: leg.fromCode,
      toCode: leg.toCode,
      fromCity: leg.fromCity,
      toCity: leg.toCity,
      dateText: leg.dateText,
      departTime: flight.departTime,
      arriveTime: flight.arriveTime,
      duration: flight.duration,
      airlineCode: flight.airlineCode,
      airlineName: flight.airline,
      cabin: query.cabin,
      stops: flight.stops,
      flightCode: flight.code,
      aircraft: flight.aircraft,
      bookingClass: bookingClass.slice(0, 1).toUpperCase(),
      refundable: flight.refundable,
      netRate: flight.netRate,
    });
    router.push("/dashboard/booking");
  }

  // C1-6: the results list never revalidates. Choosing a fare only saves the
  // draft. Checkout asks the airline once, immediately before reserve.
  function goToBooking(
    flight: FlightOption,
    tier: FareTier,
    leg: {
      fromCode: string;
      toCode: string;
      fromCity: string;
      toCity: string;
      dateText: string;
    },
  ) {
    proceedToBooking(flight, tier, leg);
  }

  const sortHints = useMemo(() => {
    if (!flights.length) {
      return { cheapest: "—", earliest: "—", fastest: "—" };
    }
    const cheapest = Math.min(...flights.map((flight) => shownPrice(flight.price, priceMode)));
    const earliest = [...flights].sort(
      (a, b) => timeMinutes(a.departTime) - timeMinutes(b.departTime),
    )[0];
    const fastest = [...flights].sort(
      (a, b) => durationMinutes(a.duration) - durationMinutes(b.duration),
    )[0];
    return {
      cheapest: `BDT ${formatCurrency(cheapest)}`,
      earliest: earliest.departTime,
      fastest: fastest.duration,
    };
  }, [flights, priceMode]);

  const filterFields = (
    <>
        <FilterBlock title="Price Range" defaultOpen>
          <p className="mb-2 text-[11px] leading-4 text-aerotake-muted">
            Starts from ৳ {formatCurrency(shownPrice(priceBounds.min, priceMode))} - ৳{" "}
            {formatCurrency(shownPrice(priceBounds.max, priceMode))} against your search. Price is
            subject to change.
          </p>
          <div className="px-0.5 pt-1">
            <input
              type="range"
              min={priceBounds.min}
              max={priceBounds.max}
              step={100}
              value={Math.min(maxPrice, priceBounds.max)}
              onChange={(event) => setMaxPrice(Number(event.target.value))}
              className="w-full accent-aerotake-coral"
            />
            <div className="mt-1 flex justify-between text-[11px] text-aerotake-muted">
              <span>BDT {formatCurrency(shownPrice(priceBounds.min, priceMode))}</span>
              <span>BDT {formatCurrency(shownPrice(Math.min(maxPrice, priceBounds.max), priceMode))}</span>
            </div>
          </div>
        </FilterBlock>

        <FilterBlock title="Stops" icon={<RouteIcon className="h-4 w-4" />} defaultOpen>
          <div className="space-y-2.5">
            {[
              { id: "all", label: "All flights" },
              { id: "direct", label: "Direct flights" },
              { id: "1stop", label: "1 stop" },
              { id: "2stop", label: "2 or more stops" },
            ].map((option) => (
              <label key={option.id} className="flex cursor-pointer items-center gap-2.5 text-[13px] text-aerotake-navy">
                <input
                  type="radio"
                  name="stops"
                  checked={stops === option.id}
                  onChange={() => setStops(option.id)}
                  className="accent-aerotake-coral"
                />
                {option.label}
              </label>
            ))}
          </div>
        </FilterBlock>

        <FilterBlock title="Airlines" icon={<PlaneTakeoffIcon className="h-4 w-4" />} defaultOpen>
          <div className="space-y-2.5 text-[13px]">
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={allAirlines}
                onChange={(event) => {
                  setSelectedAirlines(
                    event.target.checked ? airlineStats.map((airline) => airline.code) : [],
                  );
                }}
                className="accent-aerotake-coral"
              />
              All Airlines
            </label>
            {airlineStats.map((airline) => (
              <label key={airline.code} className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={activeAirlines.includes(airline.code)}
                  onChange={(event) => {
                    setSelectedAirlines((value) => {
                      const current = value ?? airlineStats.map((item) => item.code);
                      return event.target.checked
                        ? [...current, airline.code]
                        : current.filter((code) => code !== airline.code);
                    });
                  }}
                  className="accent-aerotake-coral"
                />
                <AirlineMark code={airline.code} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-aerotake-navy">
                    {airline.code}({airline.count})
                  </span>
                  <span className="text-[12px] text-aerotake-muted">
                    ৳ {formatCurrency(shownPrice(airline.minPrice, priceMode))}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </FilterBlock>

        <FilterBlock title="Flight Schedules" icon={<ClockIcon className="h-4 w-4" />} defaultOpen>
          <p className="mb-2 text-[12px] text-aerotake-muted">Departure Time in {fromCity}</p>
          <button
            type="button"
            onClick={() => setSchedule("all")}
            className={`mb-2 h-9 w-full rounded-lg text-[13px] font-semibold ${
              schedule === "all"
                ? "border border-aerotake-coral bg-[#ecfdf3] text-aerotake-navy"
                : "border border-aerotake-border bg-white text-aerotake-navy hover:bg-aerotake-canvas"
            }`}
          >
            All
          </button>
          <div className="grid grid-cols-2 gap-2">
            {scheduleSlots.map((slot) => {
              const Icon = slot.icon;
              const active = schedule === slot.id;
              return (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => setSchedule(slot.id)}
                  className={`rounded-lg border px-2 py-2.5 text-left ${
                    active
                      ? "border-aerotake-coral bg-[#fff1f0]"
                      : "border-aerotake-border bg-white hover:bg-aerotake-canvas"
                  }`}
                >
                  <Icon className="h-4 w-4 text-aerotake-coral" />
                  <p className="mt-1.5 text-[12px] font-semibold text-aerotake-navy">{slot.label}</p>
                  <p className="text-[10px] text-aerotake-muted">{slot.range}</p>
                </button>
              );
            })}
          </div>
        </FilterBlock>

        <FilterBlock title="Layover Time" icon={<UndoIcon className="h-4 w-4" />} defaultOpen>
          <DualRange
            min={0}
            max={60}
            start={layoverMin}
            end={layoverMax}
            onChange={(start, end) => {
              setLayoverMin(start);
              setLayoverMax(end);
            }}
          />
          <div className="mt-1 flex justify-between text-[11px] text-aerotake-muted">
            <span>{layoverMin}h</span>
            <span>{layoverMax}h</span>
          </div>
        </FilterBlock>

        <FilterBlock title="Baggage" icon={<SuitcaseIcon className="h-4 w-4" />} defaultOpen>
          <div className="space-y-2.5">
            {[
              { id: "all" as const, label: "All baggage options" },
              { id: "checked" as const, label: "Checked baggage included" },
            ].map((option) => (
              <label key={option.id} className="flex cursor-pointer items-center gap-2.5 text-[13px] text-aerotake-navy">
                <input
                  type="radio"
                  name="baggage"
                  checked={baggage === option.id}
                  onChange={() => setBaggage(option.id)}
                  className="accent-aerotake-coral"
                />
                {option.label}
              </label>
            ))}
          </div>
        </FilterBlock>
    </>
  );

  return (
    <>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="hidden h-fit rounded-2xl bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)] lg:block">
        <div className="rounded-xl bg-[#fff1f0] px-3 py-3 text-center">
          <p className="text-[11px] font-medium tracking-wide text-aerotake-muted uppercase">
            Time Remaining
          </p>
          <p className="mt-1 text-[28px] leading-none font-bold tracking-[0.12em] text-aerotake-coral">
            {minutes} : {seconds}
          </p>
        </div>
        {isDesktopLayout ? filterFields : null}
      </aside>

      {filtersOpen && !isDesktopLayout ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close filters"
            className="absolute inset-0 bg-aerotake-navy/40"
            onClick={() => setFiltersOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            className="absolute inset-x-0 bottom-0 flex max-h-[90vh] flex-col rounded-t-2xl bg-white shadow-[0_-16px_40px_rgba(15,23,42,0.2)]"
          >
            <div className="flex shrink-0 items-center justify-between px-4 pt-4 pb-2">
              <h2 className="text-[18px] font-bold text-aerotake-navy">Filters</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setFiltersOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-aerotake-muted hover:bg-aerotake-canvas"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto px-4 pb-4">
              <FilterBlock title="Sort By" defaultOpen>
                <div className="space-y-1">
                  {(
                    [
                      { id: "cheapest" as const, label: "Cheapest", hint: sortHints.cheapest },
                      { id: "earliest" as const, label: "Earliest", hint: sortHints.earliest },
                      { id: "quickest" as const, label: "Fastest", hint: sortHints.fastest },
                      { id: "departure" as const, label: "Departure", hint: "" },
                    ] as const
                  ).map((option) => {
                    const active = sortBy === option.id;
                    return (
                      <label
                        key={option.id}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-1 py-2.5 text-[13px] text-aerotake-navy"
                      >
                        <span className="inline-flex items-center gap-2.5">
                          <input
                            type="radio"
                            name="mobile-sort"
                            checked={active}
                            onChange={() => setSortBy(option.id)}
                            className="accent-aerotake-coral"
                          />
                          {option.label}
                        </span>
                        {option.hint ? (
                          <span className="text-[12px] text-aerotake-muted">{option.hint}</span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </FilterBlock>
              {filterFields}
            </div>

            <div className="shrink-0 border-t border-aerotake-border bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="flex h-12 w-full items-center justify-center rounded-xl bg-aerotake-coral text-[14px] font-bold tracking-wide text-white uppercase hover:bg-aerotake-coral-dark"
              >
                Show {visibleFlights.length} Flight{visibleFlights.length === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="min-w-0">
        <div className="mb-3 overflow-hidden rounded-xl bg-aerotake-coral px-3 py-2.5 text-white lg:hidden">
          <p className="flex items-center justify-center gap-2 text-[13px] font-semibold tracking-wide">
            <ClockIcon className="h-4 w-4" />
            Remaining {minutes}:{seconds}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[15px] font-bold text-aerotake-navy lg:text-[13px] lg:font-normal lg:text-aerotake-muted">
              <span className="lg:hidden">
                {visibleFlights.length} Available Flight{visibleFlights.length === 1 ? "" : "s"}
              </span>
              <span className="hidden lg:inline">
                Showing {visibleFlights.length} out of {flights.length} Flights | {airlineStats.length}{" "}
                Airline{airlineStats.length === 1 ? "" : "s"}
              </span>
            </p>
            <button
              type="button"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-aerotake-border bg-white px-3.5 py-2 text-[12px] font-semibold text-aerotake-navy shadow-sm hover:bg-aerotake-canvas lg:hidden"
            >
              <FilterIcon className="h-3.5 w-3.5" />
              All Filters
              {activeFilterCount > 0 ? (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-aerotake-coral px-1 text-[9px] font-bold text-white">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
          </div>
          <div className="hidden flex-wrap items-center gap-2 lg:flex">
            <a
              href="https://www.iatatravelcentre.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-aerotake-border bg-white px-3 py-1.5 text-[12px] text-aerotake-navy hover:bg-aerotake-canvas"
            >
              Check Visa Requirements
              <ExternalIcon />
            </a>
            <div className="relative">
              <button
                type="button"
                aria-expanded={priceModeOpen}
                aria-haspopup="listbox"
                onClick={() => {
                  setPriceModeOpen((open) => !open);
                  setSortOpen(false);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-aerotake-border bg-white px-3 py-1.5 text-[12px] text-aerotake-navy hover:bg-aerotake-canvas"
              >
                {priceModes.find((mode) => mode.id === priceMode)?.label}
                <ChevronDownIcon className="h-3.5 w-3.5" />
              </button>
              {priceModeOpen ? (
                <div
                  role="listbox"
                  className="absolute top-full right-0 z-30 mt-1.5 min-w-[168px] overflow-hidden rounded-xl border border-aerotake-border bg-white py-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.12)]"
                >
                  {priceModes.map((option) => {
                    const active = priceMode === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          setPriceMode(option.id);
                          setPriceModeOpen(false);
                        }}
                        className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-[13px] ${
                          active
                            ? "bg-[#fff1f0] font-semibold text-aerotake-coral"
                            : "text-aerotake-navy hover:bg-aerotake-canvas"
                        }`}
                      >
                        {option.label}
                        {active ? <CheckIcon className="h-3.5 w-3.5" /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <div className="relative">
              <button
                type="button"
                aria-expanded={sortOpen}
                aria-haspopup="listbox"
                onClick={() => {
                  setSortOpen((open) => !open);
                  setPriceModeOpen(false);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-aerotake-border bg-white px-3 py-1.5 text-[12px] text-aerotake-navy hover:bg-aerotake-canvas"
              >
                Filter By
                <ChevronDownIcon className="h-3.5 w-3.5" />
              </button>
              {sortOpen ? (
                <div
                  role="listbox"
                  className="absolute top-full right-0 z-30 mt-1.5 min-w-[168px] overflow-hidden rounded-xl border border-aerotake-border bg-white py-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.12)]"
                >
                  {sortOptions.map((option) => {
                    const active = sortBy === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          setSortBy(option.id);
                          setSortOpen(false);
                        }}
                        className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-[13px] ${
                          active
                            ? "bg-[#fff1f0] font-semibold text-aerotake-coral"
                            : "text-aerotake-navy hover:bg-aerotake-canvas"
                        }`}
                      >
                        {option.label}
                        {active ? <CheckIcon className="h-3.5 w-3.5" /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedAirlines(airlineStats.map((airline) => airline.code))}
            className={`rounded-lg px-3 py-2 text-[12px] font-semibold ${
              allAirlines
                ? "bg-aerotake-coral text-white"
                : "border border-aerotake-border bg-white text-aerotake-navy"
            }`}
          >
            All
          </button>
          {airlineStats.map((airline) => (
            <button
              key={airline.code}
              type="button"
              onClick={() => setSelectedAirlines([airline.code])}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] ${
                selectedAirlines?.length === 1 && selectedAirlines[0] === airline.code
                  ? "border-aerotake-coral bg-[#fff1f0]"
                  : "border-aerotake-border bg-white"
              }`}
            >
              <AirlineMark code={airline.code} size="sm" />
              <span>
                <span className="block font-semibold text-aerotake-navy">{airline.name}</span>
                <span className="text-aerotake-coral">
                  BDT {formatCurrency(shownPrice(airline.minPrice, priceMode))}
                </span>
              </span>
            </button>
          ))}
        </div>

        {!searchLoading && !searchError && searchWarnings.length > 0 ? (
          <div
            role="status"
            className="mt-4 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-[12px] font-medium text-[#92400e]"
          >
            {searchWarnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        ) : null}

        {searchLoading ? (
          <div className="mt-4 space-y-3" aria-live="polite" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-2xl bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]"
              />
            ))}
            <p className="text-center text-[12px] text-aerotake-muted">Searching live fares…</p>
          </div>
        ) : searchError ? (
          <div className="mt-4 rounded-2xl bg-white px-6 py-10 text-center shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <p className="text-[15px] font-semibold text-aerotake-navy">{searchError}</p>
            <p className="mt-1 text-[13px] text-aerotake-muted">
              Check your connection and try modifying your search again.
            </p>
          </div>
        ) : (
        <div className="mt-4 space-y-8">
          {legResults.map((group) => {
            const visible = sortFlights(
              group.flights.filter((flight) =>
                visibleFlights.some((item) => item.id === flight.id),
              ),
              sortBy,
            );
            const fromCity = group.fromCity;
            const fromCode = group.fromCode;
            const toCity = group.toCity;
            const toCode = group.toCode;
            const dateText = group.dateText;

            return (
              <div key={`${group.fromCode}-${group.toCode}-${group.index}`} className="space-y-3">
                {searchLegs.length > 1 ? (
                  <h3 className="text-[15px] font-bold text-aerotake-navy">
                    {group.label}
                    <span className="ml-2 text-[13px] font-medium text-aerotake-coral">
                      {group.fromCode} – {group.toCode}
                    </span>
                    <span className="ml-2 text-[12px] font-medium text-aerotake-muted">
                      {group.dateText}
                    </span>
                  </h3>
                ) : null}
          {visible.slice(pageStart, pageStart + FLIGHTS_PER_PAGE).map((flight) => {
            const expanded = openDetails === flight.id;
            const fareOpen = openFare === flight.id;
            const fareId = selectedFare[flight.id] ?? "saver";
            const fareTiers = fareTiersFor(flight.price).map((tier) => ({
              ...tier,
              price: shownPrice(tier.price, priceMode),
            }));
            const fare = fareTiers.find((tier) => tier.id === fareId) ?? fareTiers[0];

            return (
              <article
                key={flight.id}
                className="overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]"
              >
                <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
                  <span className="flex h-4 w-4 items-center justify-center rounded-[3px] border border-aerotake-coral bg-aerotake-coral text-white">
                    <CheckIcon />
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                      flight.refundable
                        ? "bg-[#fff1f0] text-aerotake-coral"
                        : "bg-[#f3f4f6] text-aerotake-muted"
                    }`}
                  >
                    {flight.refundable ? "Refundable" : "Non-refundable"}
                    <InfoIcon />
                  </span>
                  <span className="h-2 w-2 rounded-full bg-[#3b82f6]" />
                </div>

                <div
                  className={`grid grid-cols-1 gap-4 px-4 py-4 lg:items-center ${
                    expanded
                      ? "lg:grid-cols-[180px_minmax(0,1fr)]"
                      : "lg:grid-cols-[180px_minmax(0,1fr)_200px]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <AirlineMark code={flight.airlineCode} size="lg" />
                    <div>
                      <p className="text-[13px] font-semibold text-aerotake-navy">
                        {flight.airline}
                      </p>
                      <p className="mt-0.5 text-[11px] text-aerotake-muted">
                        {flight.aircraft ? `${flight.code} • ${flight.aircraft}` : flight.code}
                        {SHOW_SUPPLIER_TAG && supplierLabel(flight.supplierCode) ? (
                          <span className="ml-1.5 rounded bg-[#f3f4f6] px-1.5 py-0.5 text-[10px] font-medium text-aerotake-muted">
                            via {supplierLabel(flight.supplierCode)}
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-[11px] text-aerotake-muted">
                        {dateText}
                      </p>
                      <p className="mt-0.5 text-[20px] leading-none font-bold text-aerotake-navy">
                        {flight.departTime}
                      </p>
                      <p className="mt-1 text-[12px] text-aerotake-muted">
                        {fromCity} ({fromCode})
                      </p>
                    </div>
                    <div className="min-w-0 flex-1 px-2 text-center">
                      <p className="text-[11px] text-aerotake-muted">{flight.duration}</p>
                      <div className="relative my-2 flex items-center">
                        <span className="h-px flex-1 border-t border-dashed border-[#c5cad3]" />
                        <span className="mx-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-aerotake-coral">
                          <PlaneTakeoffIcon className="h-4 w-4" />
                        </span>
                        <span className="h-px flex-1 border-t border-dashed border-[#c5cad3]" />
                      </div>
                      <p className="text-[11px] text-aerotake-muted">
                        {flight.stops === 0 ? "Non-stop" : `${flight.stops} stop`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-aerotake-muted">
                        {dateText}
                      </p>
                      <p className="mt-0.5 text-[20px] leading-none font-bold text-aerotake-navy">
                        {flight.arriveTime}
                      </p>
                      <p className="mt-1 text-[12px] text-aerotake-muted">
                        {toCity} ({toCode})
                      </p>
                    </div>
                  </div>

                  {expanded ? null : (
                    <div className="flex flex-col items-start gap-2 lg:items-end">
                      <div className="text-left lg:text-right">
                        <p className="text-[20px] leading-none font-bold text-aerotake-coral">
                          BDT {formatCurrency(fare.price)}
                        </p>
                        <p className="mt-1 text-[10px] font-medium tracking-wide text-aerotake-muted uppercase">
                          {flight.returnLeg
                            ? `Round trip ${priceMode === "net" ? "net" : "gross"} fare`
                            : priceMode === "net"
                              ? "Net fare"
                              : "Gross fare"}
                        </p>
                      </div>
                      {flight.seatsLeft ? (
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <span className="rounded-md bg-[#ecfeff] px-2 py-0.5 text-[10px] font-semibold text-[#0f766e]">
                            Baggage
                          </span>
                          <span className="rounded-md bg-[#fff1f0] px-2 py-0.5 text-[10px] font-semibold text-aerotake-coral">
                            {flight.seatsLeft} seats left
                          </span>
                          <span className="rounded-md bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-medium text-aerotake-muted">
                            RBD: N (Economy)
                          </span>
                        </div>
                      ) : null}
                      {fareOpen ? null : (
                        <button
                          type="button"
                          onClick={() => {
                            setOpenDetails(null);
                            setOpenFare(flight.id);
                          }}
                          className="inline-flex h-10 items-center gap-1 rounded-lg bg-aerotake-coral px-4 text-[13px] font-semibold text-white hover:bg-aerotake-coral-dark"
                        >
                          {flight.action === "book" ? "Book Now" : "View Fare"}
                          <ChevronDownIcon className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setClassFlight(flight);
                          setBookingClass("N1");
                        }}
                        className="text-[11px] font-medium text-[#2563eb] hover:underline"
                      >
                        Change Booking class
                      </button>
                    </div>
                  )}
                </div>

                {flight.returnLeg ? (
                  <div className="mx-4 mb-4 rounded-xl border border-dashed border-[#d9dde3] px-3 py-2.5">
                    <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-aerotake-coral uppercase">
                      Return · {flight.returnLeg.code}
                    </p>
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-[15px] leading-none font-bold text-aerotake-navy">
                          {flight.returnLeg.departTime}
                        </p>
                        <p className="mt-1 text-[11px] text-aerotake-muted">{flight.returnLeg.fromCode}</p>
                      </div>
                      <div className="min-w-0 flex-1 px-2 text-center">
                        <p className="text-[10px] text-aerotake-muted">{flight.returnLeg.duration}</p>
                        <div className="relative my-1 flex items-center">
                          <span className="h-px flex-1 border-t border-dashed border-[#c5cad3]" />
                          <span className="mx-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-aerotake-coral">
                            <PlaneTakeoffIcon className="h-3 w-3" />
                          </span>
                          <span className="h-px flex-1 border-t border-dashed border-[#c5cad3]" />
                        </div>
                        <p className="text-[10px] text-aerotake-muted">
                          {flight.returnLeg.stops === 0 ? "Non-stop" : `${flight.returnLeg.stops} stop`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[15px] leading-none font-bold text-aerotake-navy">
                          {flight.returnLeg.arriveTime}
                        </p>
                        <p className="mt-1 text-[11px] text-aerotake-muted">{flight.returnLeg.toCode}</p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {expanded ? (
                  <FlightDetailsPanel
                    flight={flight}
                    query={query}
                    fromCity={fromCity}
                    fromCode={fromCode}
                    toCity={toCity}
                    toCode={toCode}
                    price={fare.price}
                    priceMode={priceMode}
                    tab={detailTab}
                    onTabChange={setDetailTab}
                    onViewFare={() => {
                      setOpenDetails(null);
                      setOpenFare(flight.id);
                    }}
                  />
                ) : null}

                {fareOpen ? (
                  <FareComparison
                    selectedId={fareId}
                    tiers={fareTiers}
                    priceMode={priceMode}
                    onSelect={(id) =>
                      setSelectedFare((value) => ({ ...value, [flight.id]: id }))
                    }
                    onBook={() => {
                      const tier =
                        fareTiers.find((item) => item.id === fareId) ?? fareTiers[0];
                      void goToBooking(flight, tier, {
                        fromCode,
                        toCode,
                        fromCity,
                        toCity,
                        dateText,
                      });
                    }}
                    onHide={() => setOpenFare(null)}
                  />
                ) : null}

                <button
                  type="button"
                  onClick={() => {
                    if (expanded) {
                      setOpenDetails(null);
                    } else {
                      setOpenFare(null);
                      setDetailTab("flight");
                      setOpenDetails(flight.id);
                    }
                  }}
                  className="flex w-full items-center justify-center gap-1 border-t border-[#f1f3f5] py-2.5 text-[12px] font-medium text-aerotake-coral hover:bg-[#fff1f0]"
                >
                  {expanded ? "Hide Details" : "View Details"}
                  {expanded ? (
                    <ChevronUpIcon className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDownIcon className="h-3.5 w-3.5" />
                  )}
                </button>
              </article>
            );
          })}
                {visible.length === 0 ? (
                  <div className="rounded-2xl bg-white px-6 py-10 text-center shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
                    <p className="text-[15px] font-semibold text-aerotake-navy">No flights found</p>
                    <p className="mt-1 text-[13px] text-aerotake-muted">
                      Try another date or destination for this {group.label.toLowerCase()} flight.
                    </p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        )}
        <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <p className="text-[12px] text-aerotake-muted">
            Showing {visibleFlights.length} of {flights.length} Flights
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous page"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-aerotake-coral text-aerotake-coral disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeftIcon />
            </button>
            {pageNumbers.map((entry, index) =>
              entry === "…" ? (
                <span key={`ellipsis-${index}`} className="px-1 text-[13px] text-aerotake-muted">
                  …
                </span>
              ) : (
                <button
                  key={entry}
                  type="button"
                  aria-label={`Page ${entry}`}
                  aria-current={entry === currentPage ? "page" : undefined}
                  onClick={() => setPage(entry)}
                  className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-[13px] font-semibold ${
                    entry === currentPage
                      ? "bg-aerotake-coral text-white"
                      : "border border-aerotake-border text-aerotake-navy hover:bg-aerotake-canvas"
                  }`}
                >
                  {entry}
                </button>
              ),
            )}
            <button
              type="button"
              aria-label="Next page"
              disabled={currentPage >= pageCount}
              onClick={() => setPage(currentPage + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-aerotake-coral text-aerotake-coral disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRightIcon />
            </button>
          </div>
        </div>
      </section>
    </div>

      {classFlight ? (
        <ChangeClassDrawer
          flight={classFlight}
          query={query}
          fromCity={fromCity}
          fromCode={fromCode}
          toCity={toCity}
          toCode={toCode}
          selectedClass={bookingClass}
          onSelectClass={setBookingClass}
          onClose={() => setClassFlight(null)}
          onGetFares={() => {
            setOpenDetails(null);
            setOpenFare(classFlight.id);
            setClassFlight(null);
          }}
        />
      ) : null}
    </>
  );
}

function ChangeClassDrawer({
  flight,
  query,
  fromCity,
  fromCode,
  toCity,
  toCode,
  selectedClass,
  onSelectClass,
  onClose,
  onGetFares,
}: {
  flight: FlightOption;
  query: FlightSearchQuery;
  fromCity: string;
  fromCode: string;
  toCity: string;
  toCode: string;
  selectedClass: string;
  onSelectClass: (value: string) => void;
  onClose: () => void;
  onGetFares: () => void;
}) {
  const classes = ["N1", "U1", "R1", "M1", "H1", "B1", "Y1"];
  const dateInfo = findDate(flight.date);
  const dateLabel = `${dateInfo.short}, ${dateInfo.label}`;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close change booking class"
        className="absolute inset-0 bg-aerotake-navy/40"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full flex-col bg-white shadow-[-12px_0_40px_rgba(15,23,42,0.18)] lg:w-[30vw]">
        <div className="flex items-center justify-between border-b border-[#f1f3f5] px-5 py-4">
          <h2 className="text-[18px] font-bold text-aerotake-navy">
            Change Booking Class
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-aerotake-muted hover:bg-aerotake-canvas hover:text-aerotake-navy"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <p className="text-[13px] font-semibold text-aerotake-coral">
            {fromCode} - {toCode} (Departure)
          </p>

          <div className="mt-4">
            <div className="flex items-center gap-2">
              <AirlineMark code={flight.airlineCode} size="md" />
              <p className="text-[13px] font-semibold text-aerotake-navy">
                {flight.shortName}
              </p>
            </div>
            <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div>
                <p className="text-[12px] text-aerotake-muted">{dateLabel}</p>
                <p className="mt-0.5 text-[18px] font-bold text-aerotake-navy">
                  {flight.departTime}
                </p>
                <p className="mt-0.5 text-[12px] text-aerotake-muted">
                  {fromCity} ({fromCode})
                </p>
              </div>
              <div className="min-w-16 px-1 text-center">
                <p className="text-[11px] text-aerotake-muted">{flight.duration}</p>
                <div className="my-1.5 flex items-center">
                  <span className="h-px flex-1 border-t border-dashed border-[#c5cad3]" />
                  <span className="mx-1 text-aerotake-coral">
                    <PlaneTakeoffIcon className="h-4 w-4" />
                  </span>
                  <span className="h-px flex-1 border-t border-dashed border-[#c5cad3]" />
                </div>
                <p className="text-[11px] text-aerotake-muted">
                  {flight.stops === 0 ? "Non-stop" : `${flight.stops} stop`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[12px] text-aerotake-muted">{dateLabel}</p>
                <p className="mt-0.5 text-[18px] font-bold text-aerotake-navy">
                  {flight.arriveTime}
                </p>
                <p className="mt-0.5 text-[12px] text-aerotake-muted">
                  {toCity} ({toCode})
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-xl bg-[#fff1f0] px-3 py-3">
            <div className="flex flex-wrap gap-2">
              {classes.map((code) => {
                const active = selectedClass === code;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => onSelectClass(code)}
                    className={`h-10 min-w-12 rounded-lg px-3 text-[13px] font-semibold ${
                      active
                        ? "bg-aerotake-coral text-white"
                        : "border border-aerotake-border bg-white text-aerotake-navy hover:border-aerotake-coral"
                    }`}
                  >
                    {code}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-[#f1f3f5] px-5 py-4">
          <button
            type="button"
            onClick={onGetFares}
            className="h-11 rounded-lg bg-aerotake-coral px-6 text-[14px] font-semibold text-white hover:bg-aerotake-coral-dark"
          >
            Get Fares
          </button>
        </div>
      </aside>
    </div>
  );
}

const detailTabs = [
  { id: "flight", label: "Flight Details" },
  { id: "fare", label: "Fare Summary" },
  { id: "baggage", label: "Baggage" },
  { id: "rules", label: "Fare Rules & Policies" },
] as const;

function FlightDetailsPanel({
  flight,
  query,
  fromCity,
  fromCode,
  toCity,
  toCode,
  price,
  priceMode,
  tab,
  onTabChange,
  onViewFare,
}: {
  flight: FlightOption;
  query: FlightSearchQuery;
  fromCity: string;
  fromCode: string;
  toCity: string;
  toCode: string;
  price: number;
  priceMode: PriceMode;
  tab: string;
  onTabChange: (id: string) => void;
  onViewFare: () => void;
}) {
  const dateInfo = findDate(flight.date);
  const dateLabel = `${dateInfo.short}, ${dateInfo.label.replace(",", "")}`;
  const flightCode = flight.code.replace(" ", "-");
  const fromAirport =
    query.from.airport === "Airport / City"
      ? "Hazrat Shahjalal International Airport"
      : query.from.airport.replace("Intl.", "International");
  const toAirport =
    query.to.airport === "Airport / City" ? "Cox's Bazar Airport" : query.to.airport;
  const tax = 1500;
  const grossPrice = priceMode === "net" ? Math.round(price / 0.95) : price;
  const commission = priceMode === "net" ? grossPrice - price : 0;
  const baseFare = Math.max(grossPrice - tax, 0);
  const fareRows = [
    ["Base Fare", `BDT ${formatCurrency(baseFare)}`],
    ["Tax & Fees", `BDT ${formatCurrency(tax)}`],
    ...(priceMode === "net"
      ? [["Agent Commission", `- BDT ${formatCurrency(commission)}`] as [string, string]]
      : []),
    [priceMode === "net" ? "Net Fare" : "Total Fare", `BDT ${formatCurrency(price)}`],
  ];

  return (
    <div className="border-t border-[#f1f3f5]">
      <div className="flex gap-1 overflow-x-auto border-b border-[#f1f3f5] px-3">
        {detailTabs.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={`shrink-0 border-b-2 px-4 py-3 text-[13px] font-semibold whitespace-nowrap ${
                active
                  ? "border-aerotake-coral bg-[#fff1f0] text-aerotake-coral"
                  : "border-transparent text-aerotake-muted hover:text-aerotake-navy"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_200px]">
        <div className="px-4 py-5">
          {tab === "flight" ? (
            <div className="grid grid-cols-1 items-start gap-6 sm:grid-cols-[1fr_auto_1fr]">
              <div>
                <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-[#fff1f0] text-aerotake-coral">
                  <PlaneTakeoffIcon className="h-4 w-4" />
                </span>
                <p className="text-[14px] font-semibold text-aerotake-navy">
                  {fromCity} ({fromCode})
                </p>
                <p className="mt-1 text-[20px] leading-none font-bold text-aerotake-navy">
                  {flight.departTime}
                </p>
                <p className="mt-1.5 text-[12px] text-aerotake-muted">{dateLabel}</p>
                <p className="mt-1 text-[12px] text-aerotake-muted">{fromAirport}</p>
              </div>

              <div className="flex flex-col items-center px-4 text-center">
                <AirlineMark code={flight.airlineCode} size="lg" />
                <p className="mt-2 text-[13px] font-semibold text-aerotake-navy">{flight.shortName}</p>
                <p className="mt-0.5 text-[12px] font-semibold text-aerotake-coral">
                  {flight.aircraft ? `${flightCode} | ${flight.aircraft}` : flightCode}
                </p>
                <span className="mt-4 h-px w-full max-w-[180px] bg-aerotake-coral" />
                <p className="mt-3 text-[12px] text-aerotake-muted">
                  Travel Time: {flight.duration}
                </p>
              </div>

              <div className="sm:text-right">
                <span className="mb-2 ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-[#fff1f0] text-aerotake-coral sm:ml-auto">
                  <PlaneLandingIcon className="h-4 w-4" />
                </span>
                <p className="text-[14px] font-semibold text-aerotake-navy">
                  {toCity} ({toCode})
                </p>
                <p className="mt-1 text-[20px] leading-none font-bold text-aerotake-navy">
                  {flight.arriveTime}
                </p>
                <p className="mt-1.5 text-[12px] text-aerotake-muted">{dateLabel}</p>
                <p className="mt-1 text-[12px] text-aerotake-muted">{toAirport}</p>
              </div>
            </div>
          ) : null}

          {tab === "fare" ? (
            <div className="mx-auto max-w-md space-y-2 text-[13px]">
              {fareRows.map(([label, value], index) => (
                <div
                  key={label}
                  className={`flex items-center justify-between py-2 ${
                    index === fareRows.length - 1
                      ? "border-t border-[#e5e7eb] font-bold text-aerotake-coral"
                      : "text-aerotake-navy"
                  }`}
                >
                  <span>{label}</span>
                  <span>{value}</span>
                </div>
              ))}
            </div>
          ) : null}

          {tab === "baggage" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[#f1f3f5] px-4 py-3">
                <p className="flex items-center gap-2 text-[12px] font-semibold text-aerotake-muted">
                  <HandBagIcon />
                  Hand Baggage
                </p>
                <p className="mt-1 text-[16px] font-bold text-aerotake-navy">7 Kg</p>
              </div>
              <div className="rounded-xl border border-[#f1f3f5] px-4 py-3">
                <p className="flex items-center gap-2 text-[12px] font-semibold text-aerotake-muted">
                  <SuitcaseIcon />
                  Checked Baggage
                </p>
                <p className="mt-1 text-[16px] font-bold text-aerotake-navy">
                  {flight.checkedBaggageIncluded
                    ? flight.checkedBaggageWeightKg
                      ? `${flight.checkedBaggageWeightKg} Kg`
                      : "Included"
                    : "—"}
                </p>
              </div>
            </div>
          ) : null}

          {tab === "rules" ? (
            <ul className="space-y-2 text-[13px] leading-6 text-aerotake-muted">
              <li>Refundable fare. Cancellation is allowed with an airline penalty.</li>
              <li>Date change is permitted before departure, subject to fare difference and fees.</li>
              <li>No-show and unused tickets follow the airline’s published fare rules.</li>
              <li>Baggage allowance applies per adult passenger unless stated otherwise.</li>
            </ul>
          ) : null}
        </div>

        <div className="flex flex-col items-center justify-center gap-3 border-t border-dashed border-[#d7dbe3] px-5 py-6 lg:border-t-0 lg:border-l">
          <div className="text-center">
            <p className="inline-flex items-center gap-1.5 text-[18px] font-bold text-aerotake-coral">
              <span className="text-aerotake-muted">
                <CopyIcon />
              </span>
              BDT {formatCurrency(price)}
            </p>
            <p className="mt-1 text-[10px] font-medium tracking-wide text-aerotake-muted uppercase">
              {priceMode === "net" ? "Net fare" : "Gross fare"}
            </p>
          </div>
          <button
            type="button"
            onClick={onViewFare}
            className="inline-flex h-11 w-full items-center justify-center gap-1 rounded-lg bg-aerotake-coral text-[13px] font-semibold text-white hover:bg-aerotake-coral-dark"
          >
            View Fare
            <ChevronDownIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function FareComparison({
  selectedId,
  tiers,
  priceMode,
  busy = false,
  onSelect,
  onBook,
  onHide,
}: {
  selectedId: string;
  tiers: FareTier[];
  priceMode: PriceMode;
  busy?: boolean;
  onSelect: (id: string) => void;
  onBook: () => void;
  onHide: () => void;
}) {
  const selected = tiers.find((tier) => tier.id === selectedId) ?? tiers[0];
  const rows = [
    { key: "hand", label: "Hand Baggage", icon: HandBagIcon },
    { key: "checked", label: "Checked Baggage", icon: SuitcaseIcon },
    { key: "rebook", label: "Rebooking", icon: CalendarIcon },
    { key: "cancel", label: "Cancellation", icon: UndoIcon },
    { key: "class", label: "Booking Class", icon: SeatIcon },
  ] as const;

  return (
    <div className="border-t border-[#f1f3f5] bg-[#f4f5f7] px-3 py-4 sm:px-4">
      <div className="flex flex-col gap-3 xl:flex-row">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="grid min-w-[720px] grid-cols-[140px_1fr_1fr_1fr] gap-3">
            <div className="pt-8">
              <p className="pb-3 text-[13px] font-bold text-aerotake-coral">Fare Type</p>
              {rows.map((row) => (
                <div
                  key={row.key}
                  className="flex h-[52px] items-center gap-2 border-t border-[#e5e7eb] text-[12px] font-medium text-aerotake-navy"
                >
                  <span className="text-aerotake-navy">
                    <row.icon />
                  </span>
                  {row.label}
                </div>
              ))}
            </div>

            {tiers.map((tier) => {
              const isSelected = tier.id === selectedId;
              return (
                <div
                  key={tier.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(tier.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(tier.id);
                    }
                  }}
                  className={`relative cursor-pointer rounded-xl border bg-white px-3 pt-8 pb-3 text-left ${
                    isSelected
                      ? "border-aerotake-coral shadow-[0_8px_20px_rgba(249,115,96,0.12)]"
                      : "border-[#e5e7eb]"
                  }`}
                >
                  {isSelected ? (
                    <span className="absolute top-2 left-2 rounded-full bg-aerotake-coral px-2 py-0.5 text-[10px] font-semibold text-white">
                      Selected
                    </span>
                  ) : null}
                  <p className="pb-3 text-[13px] font-bold text-aerotake-coral">{tier.name}</p>
                  <div className="flex h-[52px] items-center border-t border-[#f1f3f5] text-[12px] text-aerotake-navy">
                    7 Kg
                  </div>
                  <div className="flex h-[52px] items-center gap-1.5 border-t border-[#f1f3f5] text-[12px] font-medium text-[#0f766e]">
                    <SuitcaseIcon />
                    Baggages
                  </div>
                  <div className="flex h-[52px] items-center gap-1.5 border-t border-[#f1f3f5] text-[12px] font-medium text-[#0f766e]">
                    <span className="text-[#0f766e]">
                      <DollarIcon />
                    </span>
                    Penalty Applies
                  </div>
                  <div className="flex h-[52px] items-center gap-1.5 border-t border-[#f1f3f5] text-[12px] text-aerotake-navy">
                    <span className="text-aerotake-success">
                      <CheckIcon />
                    </span>
                    Refundable
                    <span className="text-aerotake-coral">
                      <InfoIcon />
                    </span>
                  </div>
                  <div className="flex h-[52px] items-center gap-1.5 border-t border-[#f1f3f5] text-[12px] font-medium text-[#0f766e]">
                    <SeatIcon />
                    Class Details
                  </div>
                  <p className="mt-3 text-[12px] font-semibold text-aerotake-coral">
                    {priceMode === "net" ? "Net Fare" : "Total Fare"}: BDT{" "}
                    {formatCurrency(tier.price)}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    aria-busy={busy && tier.id === selectedId}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(tier.id);
                      onBook();
                    }}
                    className="mt-2 flex h-9 w-full items-center justify-center rounded-lg bg-aerotake-coral text-[12px] font-semibold text-white hover:bg-aerotake-coral-dark disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busy && tier.id === selectedId ? <ButtonSpinner className="h-3.5 w-3.5" /> : null}
                    {busy && tier.id === selectedId ? "Confirming price…" : "Book Now"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center justify-center gap-3 rounded-xl bg-white px-5 py-6 xl:w-[180px]">
          <p className="inline-flex items-center gap-1.5 text-[18px] font-bold text-aerotake-coral">
            <span className="text-aerotake-muted">
              <CopyIcon />
            </span>
            BDT {formatCurrency(selected.price)}
          </p>
          <button
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={onBook}
            className="inline-flex h-11 w-full items-center justify-center gap-1 rounded-lg bg-aerotake-coral text-[13px] font-semibold text-white hover:bg-aerotake-coral-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <ButtonSpinner className="h-3.5 w-3.5" /> : null}
            {busy ? "Confirming price…" : "Book Now"}
            {busy ? null : <ChevronDownIcon className="h-3.5 w-3.5 rotate-[-90deg]" />}
          </button>
          <button
            type="button"
            onClick={onHide}
            className="inline-flex h-11 w-full items-center justify-center gap-1 rounded-lg border border-aerotake-border bg-white text-[13px] font-semibold text-aerotake-navy hover:bg-aerotake-canvas"
          >
            Hide Fare
            <ChevronUpIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterBlock({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mt-3 border-t border-[#f1f3f5] pt-3 first:mt-0 first:border-t-0 first:pt-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between text-[14px] font-semibold text-aerotake-navy"
      >
        <span className="inline-flex items-center gap-2">
          {icon ? <span className="text-aerotake-coral">{icon}</span> : null}
          {title}
        </span>
        {open ? (
          <ChevronUpIcon className="h-3.5 w-3.5 text-aerotake-muted" />
        ) : (
          <ChevronDownIcon className="h-3.5 w-3.5 text-aerotake-muted" />
        )}
      </button>
      {open && children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}


function durationMinutes(value: string) {
  const hours = Number(value.match(/(\d+)\s*h/)?.[1] ?? 0);
  const mins = Number(value.match(/(\d+)\s*m/)?.[1] ?? 0);
  return hours * 60 + mins;
}

function timeMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function sortFlights<
  T extends { price: number; duration: string; arriveTime: string; departTime: string },
>(list: T[], sortBy: SortOption) {
  return [...list].sort((a, b) => {
    if (sortBy === "quickest") {
      return durationMinutes(a.duration) - durationMinutes(b.duration);
    }
    if (sortBy === "earliest") {
      return timeMinutes(a.arriveTime) - timeMinutes(b.arriveTime);
    }
    if (sortBy === "departure") {
      return timeMinutes(a.departTime) - timeMinutes(b.departTime);
    }
    return a.price - b.price;
  });
}

function shownPrice(price: number, mode: PriceMode) {
  if (mode === "net") {
    return Math.round(price * 0.95);
  }
  return price;
}

/** Dummy fares were always whole numbers, so `${n.toLocaleString()}.00`
 * happened to work — real Sabre fares (percentage markup on a supplier net
 * rate) usually aren't, and that pattern renders e.g. "910.4.00". Always
 * format to exactly two decimal places instead. */
function formatCurrency(amount: number) {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function departureSlot(departTime: string): Exclude<ScheduleSlot, "all"> {
  const minutes = timeMinutes(departTime);
  if (minutes >= 6 * 60 && minutes < 12 * 60) return "morning";
  if (minutes >= 12 * 60 && minutes < 18 * 60) return "afternoon";
  if (minutes >= 18 * 60) return "evening";
  return "night";
}

function flightLayoverHours(flight: { stops: number; duration: string }) {
  if (flight.stops === 0) {
    return 0;
  }
  const extra = durationMinutes(flight.duration) - 70 * (flight.stops + 1);
  return Math.max(1, extra / 60);
}

/** Was piggybacking on `refundable` (never real baggage data, just a proxy
 * that happened to exist) — now reads the real allowance live suppliers
 * report. Dummy/Intelli-Bestbuy flights and any future supplier that
 * doesn't report baggage leave this `undefined`, which reads as "not
 * included" here rather than faking a match. */
function hasCheckedBaggage(flight: { checkedBaggageIncluded?: boolean }) {
  return flight.checkedBaggageIncluded === true;
}

function DualRange({
  min,
  max,
  start,
  end,
  onChange,
}: {
  min: number;
  max: number;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
}) {
  const span = max - min || 1;
  const left = ((start - min) / span) * 100;
  const right = ((end - min) / span) * 100;

  return (
    <div className="relative h-6">
      <div className="absolute top-1/2 right-0 left-0 h-1.5 -translate-y-1/2 rounded-full bg-[#e5e7eb]" />
      <div
        className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-aerotake-coral"
        style={{ left: `${left}%`, width: `${Math.max(0, right - left)}%` }}
      />
      <input
        type="range"
        min={min}
        max={max}
        value={start}
        onChange={(event) => onChange(Math.min(Number(event.target.value), end), end)}
        className="pointer-events-none absolute inset-0 w-full appearance-none bg-transparent accent-aerotake-coral [&::-moz-range-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:pointer-events-auto"
      />
      <input
        type="range"
        min={min}
        max={max}
        value={end}
        onChange={(event) => onChange(start, Math.max(Number(event.target.value), start))}
        className="pointer-events-none absolute inset-0 w-full appearance-none bg-transparent accent-aerotake-coral [&::-moz-range-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:pointer-events-auto"
      />
    </div>
  );
}
