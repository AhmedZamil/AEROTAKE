"use client";

import { useEffect, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { useDebounce } from "@/hooks/use-debounce";
import { addDays, dateFromId, dateOptionFromDate, startOfToday } from "@/lib/date-options";
import {
  airlines,
  airportLabel,
  airports,
  parseGdsItinerary,
  type AirlineOption,
  type AirportOption,
  type DateOption,
} from "@/data/flight-search";
import {
  CalendarIcon,
  ChevronDownIcon,
  CloseIcon,
  ExternalIcon,
  HotelIcon,
  MinusIcon,
  PlaneTakeoffIcon,
  PlusIcon,
  RouteIcon,
  SearchIcon,
  SeatIcon,
  SwapIcon,
  TourIcon,
  UserIcon,
} from "./icons";

const defaultFrom = airports[0];
const defaultTo = airports[1];
const bookingClasses = [
  { id: "economy", label: "Economy" },
  { id: "premium-economy", label: "Premium Economy" },
  { id: "business", label: "Business" },
  { id: "first", label: "First Class" },
] as const;

type BookingClassId = (typeof bookingClasses)[number]["id"];

type TravelerState = {
  adults: number;
  children: number;
  infants: number;
  childAges: number[];
  bookingClass: BookingClassId;
};

const defaultTravelers: TravelerState = {
  adults: 1,
  children: 0,
  infants: 0,
  childAges: [],
  bookingClass: "economy",
};

function classLabel(id: BookingClassId) {
  return bookingClasses.find((item) => item.id === id)?.label ?? "Economy";
}

function travelerSummary(state: TravelerState) {
  const total = state.adults + state.children + state.infants;
  return {
    total,
    label: `${total} Traveller${total === 1 ? "" : "s"}`,
    hint: classLabel(state.bookingClass),
    cabin:
      state.bookingClass === "business" || state.bookingClass === "first"
        ? "business"
        : "economy",
  };
}

export type SearchLeg = {
  from: { city: string; airport: string; code: string };
  to: { city: string; airport: string; code: string };
  date: string;
  dateLabel: string;
  dateHint: string;
  dateShort: string;
};

export type FlightSearchQuery = {
  from: { city: string; airport: string; code: string };
  to: { city: string; airport: string; code: string };
  tripType: string;
  fareType: string;
  preferredAirline: string;
  departureDate: string;
  departureLabel: string;
  departureHint: string;
  departureShort: string;
  returnDate?: string;
  returnLabel?: string;
  returnHint?: string;
  returnShort?: string;
  travelers: number;
  travelerLabel: string;
  cabin: string;
  flightType: string;
  legs: SearchLeg[];
};

function toLocation(airport: AirportOption) {
  return {
    city: airportLabel(airport),
    airport: airport.airport,
    code: airport.code,
  };
}

function toLeg(from: AirportOption, to: AirportOption, date: DateOption): SearchLeg {
  return {
    from: toLocation(from),
    to: toLocation(to),
    date: date.id,
    dateLabel: date.label,
    dateHint: date.hint,
    dateShort: date.short,
  };
}

function nextDateAfter(current: DateOption) {
  return dateOptionFromDate(addDays(dateFromId(current.id), 1));
}

type CityLeg = {
  from: AirportOption;
  to: AirportOption | null;
  date: DateOption;
};

export default function BookingSearch({
  onSearch,
  hasResults = false,
}: {
  onSearch?: (query: FlightSearchQuery) => void;
  hasResults?: boolean;
}) {
  const [alertOpen, setAlertOpen] = useState(true);
  const [service, setService] = useState<"flight" | "hotel" | "tour">("flight");
  const [tripType, setTripType] = useState("one-way");
  const [fareType, setFareType] = useState("regular");
  const [preferred, setPreferred] = useState("ALL");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState<AirportOption | null>(null);
  const [date, setDate] = useState(() => dateOptionFromDate(addDays(startOfToday(), 1)));
  // "Tomorrow" depends on the viewer's local calendar day, which the server
  // can't know — computing it eagerly on both sides caused a hydration
  // mismatch whenever the server and the agent's browser disagreed on the
  // date (different timezones, or a render landing right at local
  // midnight). The Departure field renders a blank/placeholder state until
  // this flips true right after mount, so the very first paint is identical
  // on the server and the client; the real date then appears immediately.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [returnDate, setReturnDate] = useState<DateOption | null>(() =>
    dateOptionFromDate(addDays(startOfToday(), 2)),
  );
  const [cityLegs, setCityLegs] = useState<CityLeg[]>(() => [
    { from: defaultFrom, to: defaultTo, date: dateOptionFromDate(addDays(startOfToday(), 1)) },
    { from: defaultTo, to: defaultFrom, date: dateOptionFromDate(addDays(startOfToday(), 2)) },
  ]);
  const [travelers, setTravelers] = useState<TravelerState>(defaultTravelers);
  const [travelerDraft, setTravelerDraft] = useState<TravelerState>(defaultTravelers);
  const [openPicker, setOpenPicker] = useState<string | null>(null);
  const [itinerary, setItinerary] = useState("");
  const [itineraryError, setItineraryError] = useState(false);
  const [flightType, setFlightType] = useState("all");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Seeded with the small static fallback (has "All Airlines" + the 3 demo
  // carriers) so the dropdown is never empty, then replaced with the live
  // ~1,150-airline directory once /api/airlines resolves. This is a plain
  // fetch-on-mount (not a typeahead), so a single request covers the whole
  // form's lifetime.
  const [preferredAirlines, setPreferredAirlines] = useState<AirlineOption[]>(airlines);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/airlines")
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data: { items?: { code: string; name: string }[] }) => {
        if (cancelled || !data.items?.length) return;
        setPreferredAirlines([
          { code: "ALL", name: "All Airlines" },
          ...data.items.map((item) => ({ code: item.code, name: item.name })),
        ]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const travelerView = travelerSummary(travelers);

  function swapAirports() {
    setFrom((currentFrom) => {
      const nextFrom = to ?? defaultFrom;
      setTo(currentFrom);
      return nextFrom;
    });
    setOpenPicker(null);
  }

  function buildQuery(
    nextDate = date,
    nextTo = to ?? defaultTo,
    nextReturn = returnDate,
    nextTrip = tripType,
    nextLegs = cityLegs,
  ): FlightSearchQuery {
    const destination = nextTo;
    const outbound = toLeg(from, destination, nextDate);
    const comingBack = nextReturn
      ? toLeg(destination, from, nextReturn)
      : undefined;
    const multiLegs = nextLegs.map((leg) =>
      toLeg(leg.from, leg.to ?? defaultTo, leg.date),
    );

    return {
      from: outbound.from,
      to: outbound.to,
      tripType: nextTrip,
      fareType,
      preferredAirline: preferred,
      departureDate: nextDate.id,
      departureLabel: nextDate.label,
      departureHint: nextDate.hint,
      departureShort: nextDate.short,
      returnDate: nextTrip === "round-trip" ? nextReturn?.id : undefined,
      returnLabel: nextTrip === "round-trip" ? nextReturn?.label : undefined,
      returnHint: nextTrip === "round-trip" ? nextReturn?.hint : undefined,
      returnShort: nextTrip === "round-trip" ? nextReturn?.short : undefined,
      travelers: travelerView.total,
      travelerLabel: travelerView.label,
      cabin: travelerView.cabin,
      flightType,
      legs:
        nextTrip === "multi-city" || nextTrip === "intelli-bestbuy"
          ? multiLegs
          : nextTrip === "round-trip" && comingBack
            ? [outbound, comingBack]
            : [outbound],
    };
  }

  function handleTripType(next: string) {
    setTripType(next);
    setOpenPicker(null);
    setItineraryError(false);
    if (next !== "intelli-bestbuy") {
      setFlightType("all");
    }
    if (next === "round-trip") {
      const nextReturn = returnDate && returnDate.id > date.id ? returnDate : nextDateAfter(date);
      setReturnDate(nextReturn);
    }
    if (next === "multi-city") {
      const dest = to ?? defaultTo;
      setCityLegs([
        { from, to: dest, date },
        {
          from: dest,
          to: dest.code === from.code ? airports[2] : from,
          date: nextDateAfter(date),
        },
      ]);
    }
  }

  function setPassengerCount(key: "adults" | "children" | "infants", count: number) {
    setTravelers((current) => ({
      ...current,
      [key]: count,
      childAges:
        key === "children"
          ? count > current.childAges.length
            ? [
                ...current.childAges,
                ...Array.from({ length: count - current.childAges.length }, () => 2),
              ]
            : current.childAges.slice(0, count)
          : current.childAges,
      infants: key === "adults" ? Math.min(current.infants, count) : key === "infants" ? count : current.infants,
    }));
  }

  function handleSearch() {
    if (tripType === "intelli-bestbuy") {
      if (!itinerary.trim()) {
        setItineraryError(true);
        return;
      }
      const parsed = parseGdsItinerary(itinerary);
      const first = parsed[0];
      onSearch?.(
        buildQuery(
          first.date,
          first.to,
          returnDate,
          "intelli-bestbuy",
          parsed.map((leg) => ({ from: leg.from, to: leg.to, date: leg.date })),
        ),
      );
      setOpenPicker(null);
      return;
    }

    const destination = to ?? defaultTo;
    if (!to) {
      setTo(destination);
    }
    if (tripType === "round-trip" && !returnDate) {
      setReturnDate(nextDateAfter(date));
    }
    onSearch?.(buildQuery(date, destination));
    setOpenPicker(null);
  }

  function selectDate(next: DateOption) {
    setDate(next);
    setOpenPicker(null);
    let nextReturn = returnDate;
    if (returnDate && next.id >= returnDate.id) {
      nextReturn = nextDateAfter(next);
      setReturnDate(nextReturn);
    }
    if (hasResults && tripType !== "multi-city") {
      onSearch?.(buildQuery(next, to ?? defaultTo, nextReturn));
    }
  }

  function selectReturnDate(next: DateOption) {
    setReturnDate(next);
    setOpenPicker(null);
    if (hasResults) {
      onSearch?.(buildQuery(date, to ?? defaultTo, next, "round-trip"));
    }
  }

  function updateCityLeg(index: number, patch: Partial<CityLeg>) {
    setCityLegs((current) => {
      const next = current.map((leg, legIndex) =>
        legIndex === index ? { ...leg, ...patch } : leg,
      );
      if (patch.to && next[index + 1]) {
        next[index + 1] = { ...next[index + 1], from: patch.to };
      }
      // A multi-city itinerary can't fly an earlier leg after a later one —
      // if this edit pushed the leg's date past (or onto) a downstream
      // leg's date, bump each affected downstream leg forward in turn,
      // mirroring the departure->return cascade in selectDate below.
      if (patch.date) {
        for (let i = index + 1; i < next.length; i++) {
          if (next[i].date.id > next[i - 1].date.id) break;
          next[i] = { ...next[i], date: nextDateAfter(next[i - 1].date) };
        }
      }
      return next;
    });
  }

  function shiftDate(step: number) {
    const next = dateOptionFromDate(addDays(dateFromId(date.id), step));
    if (dateFromId(next.id) < startOfToday()) return;
    selectDate(next);
  }

  return (
    <div className="flex flex-col gap-4">
      {alertOpen && !hasResults ? (
        <div className="flex items-start gap-3 rounded-xl bg-[#fff1f0] px-4 py-3 text-[13px] leading-5 text-[#c2413b] sm:items-center">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-aerotake-coral/15 text-aerotake-coral sm:mt-0">
            <span className="text-[11px] font-bold">i</span>
          </span>
          <p className="min-w-0 flex-1">
            <span className="font-semibold">Important:</span> For all passengers
            traveling for UMRAH, it is mandatory to issue roundtrip tickets
            under the same PNR.{" "}
            <a
              href="#umrah"
              className="inline-flex items-center gap-1 font-semibold text-aerotake-coral hover:underline"
            >
              Read More
              <ExternalIcon />
            </a>
          </p>
          <button
            type="button"
            aria-label="Dismiss alert"
            onClick={() => setAlertOpen(false)}
            className="mt-0.5 shrink-0 text-[#c2413b]/70 hover:text-[#c2413b] sm:mt-0"
          >
            <CloseIcon />
          </button>
        </div>
      ) : null}

      <section className="rounded-2xl bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.05)] sm:p-5">
        <div className="flex justify-center">
          <div className="flex items-end gap-8">
            {(
              [
                { id: "flight", label: "Flight", icon: PlaneTakeoffIcon },
                { id: "hotel", label: "Hotel", icon: HotelIcon },
                { id: "tour", label: "Tour", icon: TourIcon },
              ] as const
            ).map((tab) => {
              const active = service === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setService(tab.id)}
                  className={`relative flex items-center gap-2 pb-2.5 text-sm font-medium ${
                    active
                      ? "text-aerotake-coral"
                      : "text-aerotake-muted hover:text-aerotake-navy"
                  }`}
                >
                  <tab.icon />
                  {tab.label}
                  <span
                    className={`absolute inset-x-0 -bottom-px h-[2px] rounded-full ${
                      active ? "bg-aerotake-coral" : "bg-transparent"
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {service === "flight" ? (
          <>
            <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-5">
                {[
                  { id: "one-way", label: "One Way" },
                  { id: "round-trip", label: "Round Trip" },
                  { id: "multi-city", label: "Multi City" },
                  { id: "intelli-bestbuy", label: "Intelli-Bestbuy" },
                ].map((option) => (
                  <Radio
                    key={option.id}
                    name="trip-type"
                    checked={tripType === option.id}
                    onChange={() => handleTripType(option.id)}
                    label={option.label}
                  />
                ))}
              </div>

              {tripType !== "intelli-bestbuy" ? (
              <div className="flex items-center gap-2 text-[13px] text-aerotake-muted">
                Preferred Airline
                <AirlineSelect
                  airlines={preferredAirlines}
                  value={preferred}
                  open={openPicker === "preferred-airline"}
                  onToggle={() =>
                    setOpenPicker((current) => (current === "preferred-airline" ? null : "preferred-airline"))
                  }
                  onSelect={setPreferred}
                />
              </div>
              ) : null}
            </div>

            {tripType === "intelli-bestbuy" ? (
              <div className="mt-4 space-y-4">
                <div className="relative">
                  <label
                    htmlFor="gds-itinerary"
                    className="mb-2 block text-[13px] font-medium text-aerotake-navy"
                  >
                    Paste your GDS itinerary
                  </label>
                  <textarea
                    id="gds-itinerary"
                    required
                    value={itinerary}
                    onChange={(event) => {
                      setItinerary(event.target.value);
                      setItineraryError(false);
                    }}
                    placeholder="paste each itinerary on new line Example : 1 EK 202X 26SEP 6 JFKDXB..."
                    className={`h-[124px] w-full resize-y rounded-xl border bg-white px-4 py-3 text-[13px] leading-6 text-aerotake-navy outline-none placeholder:text-aerotake-muted/75 focus:border-aerotake-coral ${
                      itineraryError ? "border-aerotake-coral" : "border-aerotake-border"
                    }`}
                  />
                  {itineraryError ? (
                    <span
                      role="alert"
                      className="absolute top-[calc(100%-8px)] left-4 z-10 rounded bg-aerotake-navy px-2.5 py-1 text-[11px] text-white shadow-sm"
                    >
                      Please fill out this field
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <IntelliCountSelect
                    label="ADT"
                    icon={<UserIcon className="h-5 w-5" />}
                    value={travelers.adults}
                    min={1}
                    max={9}
                    onChange={(value) => setPassengerCount("adults", value)}
                  />
                  <IntelliCountSelect
                    label="CHD"
                    icon={<UserIcon className="h-5 w-5" />}
                    value={travelers.children}
                    min={0}
                    max={8}
                    onChange={(value) => setPassengerCount("children", value)}
                  />
                  <IntelliCountSelect
                    label="INF"
                    icon={<UserIcon className="h-5 w-5" />}
                    value={travelers.infants}
                    min={0}
                    max={travelers.adults}
                    onChange={(value) => setPassengerCount("infants", value)}
                  />
                  <IntelliChoiceSelect
                    label="Class"
                    icon={<SeatIcon className="h-5 w-5" />}
                    value={travelers.bookingClass}
                    options={bookingClasses.map((item) => ({
                      value: item.id,
                      label: item.label,
                    }))}
                    onChange={(value) =>
                      setTravelers((current) => ({
                        ...current,
                        bookingClass: value as BookingClassId,
                      }))
                    }
                  />
                  <IntelliChoiceSelect
                    label="Flight Type"
                    icon={<RouteIcon className="h-5 w-5" />}
                    value={flightType}
                    options={[
                      { value: "all", label: "All Flights" },
                      { value: "direct", label: "Direct" },
                      { value: "connecting", label: "Connecting" },
                    ]}
                    onChange={setFlightType}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleSearch}
                    className="inline-flex h-12 min-w-[168px] items-center justify-center rounded-lg bg-aerotake-coral px-6 text-[14px] font-semibold text-white shadow-[0_10px_20px_rgba(249,115,96,0.28)] hover:bg-aerotake-coral-dark"
                  >
                    {hasResults ? "Modify Search" : "Search Flights"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen((open) => !open)}
                    className="text-[13px] font-semibold text-aerotake-coral hover:underline"
                  >
                    {advancedOpen ? "Hide Advanced Options" : "Show Advanced Options"}
                  </button>
                </div>
              </div>
            ) : tripType === "multi-city" ? (
              <div className="mt-4 space-y-3">
                {cityLegs.map((leg, index) => (
                  <div key={`leg-${index}`} className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
                    <div className="relative grid min-w-0 flex-1 grid-cols-1 rounded-xl border border-dashed border-[#d9dde3] sm:grid-cols-2 min-[1100px]:flex min-[1100px]:flex-row">
                      <div className="flex items-center px-3.5 pt-3 text-[11px] font-semibold text-aerotake-coral min-[1100px]:hidden sm:col-span-2">
                        Flight {index + 1}
                      </div>
                      <AirportPickerField
                        icon={<PlaneTakeoffIcon className="h-5 w-5" />}
                        label={index === 0 ? "From" : `Flight ${index + 1} From`}
                        value={leg.from}
                        excludeCode={leg.to?.code}
                        open={openPicker === `leg-${index}-from`}
                        onToggle={() =>
                          setOpenPicker((value) =>
                            value === `leg-${index}-from` ? null : `leg-${index}-from`,
                          )
                        }
                        onSelect={(airport) => {
                          updateCityLeg(index, { from: airport });
                          setOpenPicker(null);
                        }}
                      />
                      <AirportPickerField
                        icon={<PlaneTakeoffIcon className="h-5 w-5" />}
                        label="To"
                        value={leg.to}
                        excludeCode={leg.from.code}
                        open={openPicker === `leg-${index}-to`}
                        onToggle={() =>
                          setOpenPicker((value) =>
                            value === `leg-${index}-to` ? null : `leg-${index}-to`,
                          )
                        }
                        onSelect={(airport) => {
                          updateCityLeg(index, { to: airport });
                          setOpenPicker(null);
                        }}
                      />
                      <div className="sm:col-span-2 min-[1100px]:contents">
                        <DatePickerField
                          icon={<CalendarIcon />}
                          label="Departure"
                          value={leg.date}
                          minDate={index === 0 ? startOfToday() : dateFromId(cityLegs[index - 1].date.id)}
                          last
                          open={openPicker === `leg-${index}-date`}
                          onToggle={() =>
                            setOpenPicker((value) =>
                              value === `leg-${index}-date` ? null : `leg-${index}-date`,
                            )
                          }
                          onSelect={(picked) => {
                            updateCityLeg(index, { date: dateOptionFromDate(picked) });
                            setOpenPicker(null);
                          }}
                        />
                      </div>
                    </div>
                    {cityLegs.length > 2 ? (
                      <button
                        type="button"
                        aria-label={`Remove flight ${index + 1}`}
                        onClick={() =>
                          setCityLegs((current) => current.filter((_, legIndex) => legIndex !== index))
                        }
                        className="flex h-11 items-center justify-center rounded-xl border border-aerotake-border px-3 text-[12px] text-aerotake-muted hover:bg-aerotake-canvas lg:h-auto"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ))}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    disabled={cityLegs.length >= 4}
                    onClick={() => {
                      const last = cityLegs[cityLegs.length - 1];
                      setCityLegs((current) => [
                        ...current,
                        {
                          from: last.to ?? last.from,
                          to: last.from,
                          date: nextDateAfter(last.date),
                        },
                      ]);
                    }}
                    className="inline-flex items-center gap-1 text-[13px] font-semibold text-aerotake-coral disabled:opacity-40"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Add another city
                  </button>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                    <div className="min-w-[180px] rounded-xl border border-dashed border-[#d9dde3]">
                      <TravelersClassField
                        summary={travelerView}
                        open={openPicker === "travelers"}
                        draft={travelerDraft}
                        onDraftChange={setTravelerDraft}
                        onToggle={() => {
                          setOpenPicker((value) => {
                            if (value === "travelers") {
                              return null;
                            }
                            setTravelerDraft(travelers);
                            return "travelers";
                          });
                        }}
                        onApply={() => {
                          setTravelers({
                            ...travelerDraft,
                            childAges: travelerDraft.childAges.slice(0, travelerDraft.children),
                            infants: Math.min(travelerDraft.infants, travelerDraft.adults),
                          });
                          setOpenPicker(null);
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      aria-label={hasResults ? "Modify search" : "Search flights"}
                      onClick={handleSearch}
                      className="flex h-14 items-center justify-center rounded-xl bg-aerotake-coral px-5 text-[13px] font-semibold text-white shadow-[0_10px_20px_rgba(249,115,96,0.28)] hover:bg-aerotake-coral-dark sm:min-w-[132px]"
                    >
                      {hasResults ? "Modify Search" : <SearchIcon className="h-6 w-6" />}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-stretch">
              {/* Below sm (640px): single column, unchanged. sm-1099px: a 2-up
                  grid so a resized-but-not-mobile browser window doesn't get
                  the same fully-stacked treatment as a phone. 1100px+: back
                  to the original flat single-row layout, unchanged — the
                  "display: contents" wrappers below exist only to make the
                  From/swap/To trio and the Travelers field disappear from the
                  box model at that point, restoring the exact original DOM
                  participation (direct flex children) with zero visual diff. */}
              <div className="relative grid min-w-0 flex-1 grid-cols-1 rounded-xl border border-dashed border-[#d9dde3] sm:grid-cols-2 min-[1100px]:flex min-[1100px]:flex-row">
                <div className="relative flex min-w-0 flex-col sm:col-span-2 sm:flex-row min-[1100px]:contents">
                  <AirportPickerField
                    icon={<PlaneTakeoffIcon className="h-5 w-5" />}
                    label="From"
                    value={from}
                    excludeCode={to?.code}
                    open={openPicker === "from"}
                    onToggle={() => setOpenPicker((value) => (value === "from" ? null : "from"))}
                    onSelect={(airport) => {
                      setFrom(airport);
                      setOpenPicker(null);
                    }}
                  />
                  <div className="relative z-10 flex items-center justify-center sm:w-0">
                    <button
                      type="button"
                      aria-label="Swap airports"
                      onClick={swapAirports}
                      // Sits centered on the From/To boundary once overlaid
                      // (see the wrapper's sm:w-0 above) — 36px is right for
                      // a standalone mobile tap target, but at that size the
                      // circle intrudes 18px into each field, past the 14px
                      // (px-3.5) icon inset, clipping the field's own icon.
                      // Shrinking to 24px at sm:+ (where it becomes an
                      // overlay, not a flow element) keeps it clear.
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-aerotake-border bg-white text-aerotake-coral shadow-sm hover:bg-aerotake-peach-mist sm:absolute sm:top-1/2 sm:left-0 sm:h-6 sm:w-6 sm:-translate-x-1/2 sm:-translate-y-1/2"
                    >
                      <SwapIcon />
                    </button>
                  </div>
                  <AirportPickerField
                    icon={<PlaneTakeoffIcon className="h-5 w-5" />}
                    label="To"
                    value={to}
                    excludeCode={from.code}
                    open={openPicker === "to"}
                    onToggle={() => setOpenPicker((value) => (value === "to" ? null : "to"))}
                    onSelect={(airport) => {
                      setTo(airport);
                      setOpenPicker(null);
                    }}
                  />
                </div>
                <DatePickerField
                  icon={<CalendarIcon />}
                  label="Departure"
                  value={mounted ? date : null}
                  minDate={startOfToday()}
                  open={openPicker === "date"}
                  onToggle={() => setOpenPicker((value) => (value === "date" ? null : "date"))}
                  onSelect={(picked) => selectDate(dateOptionFromDate(picked))}
                />
                <DatePickerField
                  icon={<CalendarIcon />}
                  label="Return"
                  value={tripType === "round-trip" ? returnDate : null}
                  placeholder="Select return date"
                  minDate={dateFromId(date.id)}
                  muted={tripType === "one-way"}
                  open={openPicker === "return"}
                  onToggle={() => {
                    if (tripType === "one-way") {
                      handleTripType("round-trip");
                    }
                    setOpenPicker((value) => (value === "return" ? null : "return"));
                  }}
                  onSelect={(picked) => selectReturnDate(dateOptionFromDate(picked))}
                />
                <div className="sm:col-span-2 min-[1100px]:contents">
                  <TravelersClassField
                    summary={travelerView}
                    open={openPicker === "travelers"}
                    draft={travelerDraft}
                    onDraftChange={setTravelerDraft}
                    onToggle={() => {
                      setOpenPicker((value) => {
                        if (value === "travelers") {
                          return null;
                        }
                        setTravelerDraft(travelers);
                        return "travelers";
                      });
                    }}
                    onApply={() => {
                      const next = {
                        ...travelerDraft,
                        childAges: travelerDraft.childAges.slice(0, travelerDraft.children),
                        infants: Math.min(travelerDraft.infants, travelerDraft.adults),
                      };
                      setTravelers(next);
                      setOpenPicker(null);
                    }}
                  />
                </div>
              </div>

              <button
                type="button"
                aria-label={hasResults ? "Modify search" : "Search flights"}
                onClick={handleSearch}
                className={`flex items-center justify-center rounded-xl bg-aerotake-coral text-[13px] font-semibold text-white shadow-[0_10px_20px_rgba(249,115,96,0.28)] hover:bg-aerotake-coral-dark ${
                  hasResults
                    ? "h-14 px-5 lg:h-auto lg:min-w-[132px] lg:shrink-0"
                    : "h-14 lg:h-auto lg:w-[72px] lg:shrink-0"
                }`}
              >
                {hasResults ? "Modify Search" : <SearchIcon className="h-6 w-6" />}
              </button>
            </div>
            )}

            {tripType !== "intelli-bestbuy" || advancedOpen ? (
            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-5">
                {tripType === "intelli-bestbuy" ? (
                  <div className="flex items-center gap-2 text-[13px] text-aerotake-muted">
                    Preferred Airline
                    <AirlineSelect
                      airlines={preferredAirlines}
                      value={preferred}
                      open={openPicker === "preferred-airline"}
                      onToggle={() =>
                        setOpenPicker((current) => (current === "preferred-airline" ? null : "preferred-airline"))
                      }
                      onSelect={setPreferred}
                    />
                  </div>
                ) : null}
                {[
                  { id: "regular", label: "Regular Fare" },
                  { id: "student", label: "Student Fare" },
                  { id: "umrah", label: "Umrah Fare" },
                ].map((option) => (
                  <Radio
                    key={option.id}
                    name="fare-type"
                    checked={fareType === option.id}
                    onChange={() => setFareType(option.id)}
                    label={option.label}
                  />
                ))}
              </div>
              {hasResults && tripType !== "intelli-bestbuy" && tripType !== "multi-city" ? (
                <div className="flex items-center gap-2 text-[13px]">
                  <button
                    type="button"
                    onClick={() => shiftDate(-1)}
                    disabled={dateFromId(date.id) <= startOfToday()}
                    className="rounded-lg border border-aerotake-border px-3 py-1.5 text-aerotake-muted hover:bg-aerotake-canvas disabled:opacity-40"
                  >
                    Previous Day
                  </button>
                  <span className="px-2 font-semibold text-aerotake-navy">{date.label}</span>
                  <button
                    type="button"
                    onClick={() => shiftDate(1)}
                    className="rounded-lg border border-aerotake-border px-3 py-1.5 text-aerotake-muted hover:bg-aerotake-canvas disabled:opacity-40"
                  >
                    Next Day
                  </button>
                </div>
              ) : null}
            </div>
            ) : null}
          </>
        ) : (
          <p className="mt-8 mb-4 text-center text-sm text-aerotake-muted">
            {service === "hotel" ? "Hotel" : "Tour"} search is coming soon.
          </p>
        )}
      </section>
    </div>
  );
}

function Radio({
  name,
  checked,
  onChange,
  label,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px] text-aerotake-navy">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        className={`flex h-[16px] w-[16px] items-center justify-center rounded-full border ${
          checked
            ? "border-aerotake-coral"
            : "border-[#c5cad3] peer-hover:border-aerotake-coral/60"
        }`}
      >
        {checked ? (
          <span className="h-2 w-2 rounded-full bg-aerotake-coral" />
        ) : null}
      </span>
      {label}
    </label>
  );
}

function IntelliCountSelect({
  label,
  icon,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const options = Array.from({ length: Math.max(0, max - min + 1) }, (_, index) => min + index);

  return (
    <div className="min-w-[118px]">
      <span className="mb-1.5 block text-[11px] font-semibold tracking-wide text-aerotake-muted">
        {label}
      </span>
      <label className="relative flex h-12 items-center gap-2 rounded-lg border border-[#c5d4f0] bg-white px-3">
        <span className="shrink-0 text-aerotake-coral">{icon}</span>
        <select
          aria-label={label}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-full w-full appearance-none bg-transparent pr-5 text-[13px] font-semibold text-aerotake-navy outline-none"
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2 text-aerotake-muted">
          <ChevronDownIcon className="h-3.5 w-3.5" />
        </span>
      </label>
    </div>
  );
}

function IntelliChoiceSelect({
  label,
  icon,
  value,
  options,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-[148px]">
      <span className="mb-1.5 block text-[11px] font-semibold tracking-wide text-aerotake-muted">
        {label}
      </span>
      <label className="relative flex h-12 items-center gap-2 rounded-lg border border-[#c5d4f0] bg-white px-3">
        <span className="shrink-0 text-aerotake-coral">{icon}</span>
        <select
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-full w-full appearance-none bg-transparent pr-5 text-[13px] font-semibold text-aerotake-navy outline-none"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2 text-aerotake-muted">
          <ChevronDownIcon className="h-3.5 w-3.5" />
        </span>
      </label>
    </div>
  );
}

function PickerField({
  icon,
  label,
  value,
  hint,
  last = false,
  muted = false,
  open,
  onToggle,
  children,
  panelClassName = "w-[min(280px,80vw)]",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  last?: boolean;
  muted?: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  panelClassName?: string;
}) {
  return (
    <div
      className={`relative min-w-[150px] flex-1 min-[1100px]:border-[#d9dde3] ${
        last ? "" : "min-[1100px]:border-r min-[1100px]:border-dashed"
      } ${muted ? "opacity-55" : ""}`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-[82px] w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-[#fafafa]"
      >
        <span className="shrink-0 text-aerotake-coral">{icon}</span>
        <span className="min-w-0">
          <span className="block text-[11px] text-aerotake-muted">{label}</span>
          <span
            className={`mt-0.5 block truncate text-[13px] font-semibold ${
              value ? "text-aerotake-navy" : "font-medium text-aerotake-muted"
            }`}
          >
            {value || hint}
          </span>
          {value ? (
            <span className="mt-0.5 block truncate text-[11px] text-aerotake-muted">
              {hint}
            </span>
          ) : null}
        </span>
      </button>
      {open ? (
        <div
          className={`absolute top-full left-0 z-30 mt-1 ${panelClassName} overflow-hidden rounded-xl border border-aerotake-border bg-white py-1 shadow-[0_12px_32px_rgba(15,23,42,0.12)]`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function PickerOption({
  title,
  subtitle,
  active,
  onClick,
}: {
  title: string;
  subtitle: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full flex-col px-3.5 py-2.5 text-left ${
        active ? "bg-[#fff1f0]" : "hover:bg-aerotake-canvas"
      }`}
    >
      <span className="text-[13px] font-semibold text-aerotake-navy">{title}</span>
      <span className="text-[11px] text-aerotake-muted">{subtitle}</span>
    </button>
  );
}

type AirportSearchItem = { code: string; name: string; city: string; country: string };

/**
 * Typeahead wrapper around PickerField/PickerOption (both left generic and
 * unchanged): owns its own query/results state and debounces a fetch to
 * /api/airports. A standalone component (not inline JSX in a .map) so a
 * useState/useEffect instance can safely be created per city-leg row without
 * violating the rules of hooks as legs are added/removed.
 */
function AirportPickerField({
  icon,
  label,
  value,
  excludeCode,
  open,
  onToggle,
  onSelect,
  last = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: AirportOption | null;
  excludeCode?: string;
  open: boolean;
  onToggle: () => void;
  onSelect: (airport: AirportOption) => void;
  last?: boolean;
}) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 250);
  const [results, setResults] = useState<AirportOption[]>(airports);
  const [loading, setLoading] = useState(false);

  // Reset synchronously on close (rather than waiting for the query debounce
  // to settle) so a quick close-then-reopen never briefly fetches or shows a
  // stale search term.
  useEffect(() => {
    if (open) return;
    setQuery("");
    setResults(airports);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = debouncedQuery.trim();
    if (!trimmed) {
      setResults(airports);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/airports?query=${encodeURIComponent(trimmed)}`)
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data: { items?: AirportSearchItem[] }) => {
        if (cancelled) return;
        setResults(
          (data.items ?? []).map((item) => ({
            code: item.code,
            city: item.city,
            airport: item.name,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, open]);

  const visible = results.filter((airport) => airport.code !== excludeCode);

  return (
    <PickerField
      icon={icon}
      label={label}
      value={value ? airportLabel(value) : ""}
      hint={value ? value.airport : "Airport / City"}
      open={open}
      onToggle={onToggle}
      last={last}
    >
      <div className="border-b border-aerotake-border px-3 py-2">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search city or airport"
          autoFocus
          className="w-full rounded-lg border border-aerotake-border px-2.5 py-1.5 text-[13px] outline-none focus:border-aerotake-coral"
        />
      </div>
      <div className="max-h-64 overflow-y-auto">
        {loading ? (
          <div className="px-3.5 py-2.5 text-[12px] text-aerotake-muted">Searching…</div>
        ) : null}
        {!loading && query.trim() && visible.length === 0 ? (
          <div className="px-3.5 py-2.5 text-[12px] text-aerotake-muted">No airports found.</div>
        ) : null}
        {visible.map((airport) => (
          <PickerOption
            key={airport.code}
            title={airportLabel(airport)}
            subtitle={airport.airport}
            active={airport.code === value?.code}
            onClick={() => onSelect(airport)}
          />
        ))}
      </div>
    </PickerField>
  );
}

/**
 * Compact searchable dropdown for "Preferred Airline" — a native <select>
 * with ~1,150 options rendered its browser-default popup, which is both
 * untheme-able (breaks the app's look) and unusably long to scroll with no
 * search. Same PickerOption rows as the other pickers, but the trigger stays
 * the original small inline pill (not the big stacked PickerField box) since
 * that's the existing layout this sits in next to the trip-type radios.
 * Filtering is a plain in-memory array filter (the full list is already
 * fetched once on mount) — no debounce needed for ~1,150 rows.
 */
function AirlineSelect({
  airlines: options,
  value,
  open,
  onToggle,
  onSelect,
}: {
  airlines: AirlineOption[];
  value: string;
  open: boolean;
  onToggle: () => void;
  onSelect: (code: string) => void;
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const selected = options.find((airline) => airline.code === value);
  const label = selected
    ? selected.code === "ALL"
      ? selected.name
      : `${selected.code} · ${selected.name}`
    : "All Airlines";

  const trimmed = query.trim().toLowerCase();
  const visible = trimmed
    ? options.filter(
        (airline) =>
          airline.name.toLowerCase().includes(trimmed) || airline.code.toLowerCase().includes(trimmed),
      )
    : options;

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={onToggle}
        className="flex h-9 max-w-[220px] items-center rounded-lg border border-aerotake-border bg-white py-0 pr-8 pl-3 text-left text-[13px] font-medium text-aerotake-navy outline-none focus:border-aerotake-coral"
      >
        <span className="truncate">{label}</span>
      </button>
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-aerotake-muted">
        <ChevronDownIcon className="h-3.5 w-3.5" />
      </span>
      {open ? (
        <div className="absolute top-full right-0 z-30 mt-1 w-[min(280px,85vw)] overflow-hidden rounded-xl border border-aerotake-border bg-white py-1 shadow-[0_12px_32px_rgba(15,23,42,0.12)]">
          <div className="border-b border-aerotake-border px-3 py-2">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search airline"
              autoFocus
              className="w-full rounded-lg border border-aerotake-border px-2.5 py-1.5 text-[13px] outline-none focus:border-aerotake-coral"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {visible.length === 0 ? (
              <div className="px-3.5 py-2.5 text-[12px] text-aerotake-muted">No airlines found.</div>
            ) : (
              visible.map((airline) => (
                <PickerOption
                  key={airline.code}
                  title={airline.code === "ALL" ? airline.name : `${airline.code} · ${airline.name}`}
                  subtitle={airline.code === "ALL" ? "Reset the filter" : airline.code}
                  active={airline.code === value}
                  onClick={() => {
                    onSelect(airline.code);
                    onToggle();
                  }}
                />
              ))
            )}
          </div>
        </div>
      ) : null}
    </span>
  );
}

// CSS custom properties react-day-picker's default stylesheet reads for
// theming (see node_modules/react-day-picker/src/style.css) — kept out of
// the per-render classNames object below since these are static.
const DATE_PICKER_THEME_STYLE = {
  "--rdp-accent-color": "#fa573a",
  "--rdp-accent-background-color": "#fff1ec",
  "--rdp-today-color": "#fa573a",
  "--rdp-day-width": "38px",
  "--rdp-day-height": "38px",
  "--rdp-day_button-width": "34px",
  "--rdp-day_button-height": "34px",
} as React.CSSProperties;

const DATE_PICKER_CLASS_NAMES = {
  month_caption: "flex items-center justify-center h-8 text-[13px] font-semibold text-aerotake-navy",
  nav: "absolute inset-x-1 top-0 flex h-8 items-center justify-between",
  button_previous:
    "flex h-7 w-7 items-center justify-center rounded-lg text-aerotake-muted hover:bg-aerotake-canvas disabled:opacity-30",
  button_next:
    "flex h-7 w-7 items-center justify-center rounded-lg text-aerotake-muted hover:bg-aerotake-canvas disabled:opacity-30",
  weekday: "text-[11px] font-medium text-aerotake-muted",
  day_button: "text-[13px] font-medium text-aerotake-navy rounded-full transition-colors hover:bg-aerotake-canvas",
  selected: "[&_button]:bg-aerotake-coral [&_button]:text-white [&_button]:hover:bg-aerotake-coral-dark",
  today: "[&_button]:font-bold [&_button]:text-aerotake-coral",
  outside: "opacity-40",
  disabled: "opacity-30",
};

/**
 * Calendar-based replacement for the old static searchDates list — wraps
 * PickerField/react-day-picker. Still outputs a DateOption (id/label/hint/
 * short) via dateOptionFromDate so FlightSearchQuery/SearchLeg's shape, and
 * every existing consumer of that shape, stay unchanged.
 */
function DatePickerField({
  icon,
  label,
  value,
  placeholder = "Select date",
  minDate,
  open,
  onToggle,
  onSelect,
  muted = false,
  last = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: DateOption | null;
  placeholder?: string;
  minDate?: Date;
  open: boolean;
  onToggle: () => void;
  onSelect: (date: Date) => void;
  muted?: boolean;
  last?: boolean;
}) {
  const selected = value ? dateFromId(value.id) : undefined;

  return (
    <PickerField
      icon={icon}
      label={label}
      value={value ? value.label : ""}
      hint={value ? value.hint : placeholder}
      open={open}
      onToggle={onToggle}
      muted={muted}
      last={last}
      panelClassName="w-[min(320px,92vw)]"
    >
      <div className="px-2 py-2" style={DATE_PICKER_THEME_STYLE}>
        <DayPicker
          mode="single"
          selected={selected}
          defaultMonth={selected ?? minDate ?? new Date()}
          disabled={minDate ? { before: minDate } : undefined}
          onSelect={(day) => {
            if (day) onSelect(day);
          }}
          classNames={DATE_PICKER_CLASS_NAMES}
        />
      </div>
    </PickerField>
  );
}

function TravelersClassField({
  summary,
  open,
  draft,
  onDraftChange,
  onToggle,
  onApply,
}: {
  summary: { label: string; hint: string };
  open: boolean;
  draft: TravelerState;
  onDraftChange: (next: TravelerState) => void;
  onToggle: () => void;
  onApply: () => void;
}) {
  const total = draft.adults + draft.children + draft.infants;

  function setCount(key: "adults" | "children" | "infants", next: number) {
    onDraftChange({
      ...draft,
      [key]: next,
      childAges:
        key === "children"
          ? next > draft.childAges.length
            ? [...draft.childAges, ...Array.from({ length: next - draft.childAges.length }, () => 2)]
            : draft.childAges.slice(0, next)
          : draft.childAges,
      infants: key === "adults" ? Math.min(draft.infants, next) : key === "infants" ? next : draft.infants,
    });
  }

  return (
    <div className="relative min-w-[150px] flex-1">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-[82px] w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-[#fafafa]"
      >
        <span className="shrink-0 text-aerotake-coral">
          <UserIcon />
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] text-aerotake-muted">Travelers / Class</span>
          <span className="mt-0.5 block truncate text-[13px] font-semibold text-aerotake-navy">
            {summary.label}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-aerotake-muted">
            {summary.hint}
          </span>
        </span>
      </button>

      {open ? (
        <div className="absolute top-full right-0 z-40 mt-1 w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-aerotake-border bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.14)]">
          <div className="space-y-4">
            <TravelerRow
              title="Adult"
              hint="12 years and above"
              value={draft.adults}
              min={1}
              max={9 - draft.children - draft.infants}
              onChange={(value) => setCount("adults", value)}
            />
            <div>
              <TravelerRow
                title="Child"
                hint="2 years - under 12 years"
                value={draft.children}
                min={0}
                max={9 - draft.adults - draft.infants}
                onChange={(value) => setCount("children", value)}
              />
              {draft.children > 0 ? (
                <div className="mt-2 ml-8 space-y-2">
                  {draft.childAges.slice(0, draft.children).map((age, index) => (
                    <label
                      key={`child-age-${index}`}
                      className="flex items-center justify-between gap-3 text-[13px] text-aerotake-navy"
                    >
                      Child {index + 1} Age
                      <input
                        type="number"
                        min={2}
                        max={11}
                        value={age}
                        onChange={(event) => {
                          const nextAge = Math.min(11, Math.max(2, Number(event.target.value) || 2));
                          const nextAges = [...draft.childAges];
                          nextAges[index] = nextAge;
                          onDraftChange({ ...draft, childAges: nextAges });
                        }}
                        className="h-8 w-12 rounded-md border border-aerotake-border text-center text-[13px] font-semibold text-aerotake-navy outline-none focus:border-aerotake-coral"
                      />
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
            <TravelerRow
              title="Infant"
              hint="Below 2 years"
              value={draft.infants}
              min={0}
              max={Math.min(draft.adults, 9 - draft.adults - draft.children)}
              onChange={(value) => setCount("infants", value)}
            />
          </div>

          <div className="mt-5 border-t border-[#f1f3f5] pt-4">
            <p className="mb-3 text-[13px] font-semibold text-aerotake-navy">Booking Class</p>
            <div className="space-y-2.5">
              {bookingClasses.map((option) => (
                <Radio
                  key={option.id}
                  name="booking-class"
                  checked={draft.bookingClass === option.id}
                  onChange={() => onDraftChange({ ...draft, bookingClass: option.id })}
                  label={option.label}
                />
              ))}
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={onApply}
              className="h-10 rounded-lg bg-aerotake-coral px-5 text-[13px] font-semibold text-white hover:bg-aerotake-coral-dark"
            >
              Apply
            </button>
          </div>
          <p className="sr-only">{total} travellers selected</p>
        </div>
      ) : null}
    </div>
  );
}

function TravelerRow({
  title,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  title: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const minusDisabled = value <= min;
  const plusDisabled = value >= max;

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 text-aerotake-coral">
          <UserIcon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[13px] font-semibold text-aerotake-navy">{title}</p>
          <p className="text-[11px] text-aerotake-muted">{hint}</p>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          aria-label={`Decrease ${title}`}
          disabled={minusDisabled}
          onClick={() => onChange(value - 1)}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-aerotake-coral text-aerotake-coral disabled:border-[#d7dbe3] disabled:text-[#c5cad3]"
        >
          <MinusIcon className="h-3.5 w-3.5" />
        </button>
        <span className="w-4 text-center text-[14px] font-semibold text-aerotake-navy">
          {value}
        </span>
        <button
          type="button"
          aria-label={`Increase ${title}`}
          disabled={plusDisabled}
          onClick={() => onChange(value + 1)}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-aerotake-coral text-aerotake-coral disabled:border-[#d7dbe3] disabled:text-[#c5cad3]"
        >
          <PlusIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
