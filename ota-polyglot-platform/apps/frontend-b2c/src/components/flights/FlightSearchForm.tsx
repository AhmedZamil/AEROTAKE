"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { offsetIso, returnAfterDeparture, todayIso } from "@/lib/dates";
import { LuArrowLeftRight, LuArrowUpDown, LuPlus, LuSearch, LuX } from "react-icons/lu";
import AirportPicker from "@/components/flights/AirportPicker";
import DatePickerField, { LabeledDatePickerField } from "@/components/flights/DatePickerField";
import TripDateRangeField from "@/components/flights/TripDateRangeField";
import PassengerSelector from "@/components/flights/PassengerSelector";
import type { PassengerCounts, TripType } from "@/context/AppProviders";
import { useApp } from "@/context/AppProviders";
import type { CabinClass } from "@/lib/flight-types";

const tripTypes: { id: TripType; label: string; mobileLabel: string }[] = [
  { id: "oneway", label: "One Way", mobileLabel: "One way" },
  { id: "round", label: "Round Trip", mobileLabel: "Round trip" },
  { id: "multi", label: "Multi City", mobileLabel: "Multi city" },
];

const fareTypes = [
  { id: "regular", label: "Regular Fare" },
  { id: "student", label: "Student Fare" },
  { id: "umrah", label: "Umrah Fare" },
] as const;

const MAX_LEGS = 5;

type FareType = (typeof fareTypes)[number]["id"];
type Leg = { from: string; to: string; date: string };

type Props = {
  compact?: boolean;
};

function emptyLeg(seed?: Partial<Leg>): Leg {
  return {
    from: seed?.from ?? "",
    to: seed?.to ?? "",
    date: seed?.date ?? "",
  };
}

export default function FlightSearchForm({ compact = false }: Props) {
  const router = useRouter();
  const { search, setSearch } = useApp();
  const [from, setFrom] = useState(search.from);
  const [to, setTo] = useState(search.to);
  const [depart, setDepart] = useState(search.depart);
  const [returnDate, setReturnDate] = useState(search.returnDate);
  const [trip, setTrip] = useState<TripType>(search.trip);
  const [cabin, setCabin] = useState<CabinClass>(search.cabin);
  const [passengers, setPassengers] = useState<PassengerCounts>(search.passengers);
  const [fareType, setFareType] = useState<FareType>("regular");
  const [legs, setLegs] = useState<Leg[]>([
    emptyLeg({ from: search.from, to: search.to, date: search.depart }),
    emptyLeg({
      from: search.to,
      to: "LHR",
      date: search.returnDate || search.depart,
    }),
  ]);
  const [errors, setErrors] = useState<string[]>([]);

  // The shared default dates arrive after the page loads (they are relative to today, so they are computed in the browser): adopt them
  // into an empty form, but never overwrite a date the visitor already chose.
  useEffect(() => {
    if (!search.depart) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setDepart((prev) => prev || search.depart);
    setReturnDate((prev) => prev || search.returnDate);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [search.depart, search.returnDate]);

  // `min` for the date fields: nothing before today (set after load so the server and browser never disagree about "today").
  const [minDate, setMinDate] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => setMinDate(todayIso()), 0);
    return () => window.clearTimeout(id);
  }, []);

  // Moving the departure past the return date moves the return with it, instead of leaving a return before the departure that fails the search.
  const changeDepart = (value: string) => {
    setDepart(value);
    setReturnDate((prev) => returnAfterDeparture(value, prev));
  };

  const setTripDates = (nextDepart: string, nextReturn: string) => {
    setDepart(nextDepart);
    setReturnDate(nextReturn);
  };

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  const setTripType = (next: TripType) => {
    setTrip(next);
    if (next === "multi") {
      setLegs((prev) => {
        if (prev.length >= 2) return prev;
        return [
          emptyLeg({ from, to, date: depart }),
          emptyLeg({ from: to, to: "LHR", date: returnDate || depart }),
        ];
      });
    }
  };

  const updateLeg = (index: number, patch: Partial<Leg>) => {
    setLegs((prev) => prev.map((leg, i) => (i === index ? { ...leg, ...patch } : leg)));
  };

  const swapLeg = (index: number) => {
    setLegs((prev) =>
      prev.map((leg, i) => (i === index ? { ...leg, from: leg.to, to: leg.from } : leg)),
    );
  };

  const addLeg = () => {
    setLegs((prev) => {
      if (prev.length >= MAX_LEGS) return prev;
      const last = prev[prev.length - 1];
      return [
        ...prev,
        emptyLeg({
          from: last?.to ?? "",
          to: "",
          date: last?.date ?? depart,
        }),
      ];
    });
  };

  const removeLeg = (index: number) => {
    setLegs((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== index)));
  };

  const submit = () => {
    const nextErrors: string[] = [];
    // Default dates hydrate after paint; if Search is hit first, use the same +30/+37 day defaults.
    const effectiveDepart = depart || search.depart || offsetIso(30);
    const effectiveReturn = returnDate || search.returnDate || offsetIso(37);

    if (trip === "multi") {
      legs.forEach((leg, i) => {
        const n = i + 1;
        if (!leg.from || !leg.to) nextErrors.push(`Select airports for flight ${n}.`);
        else if (leg.from === leg.to) {
          nextErrors.push(`Flight ${n} origin and destination must be different.`);
        }
        if (!leg.date) nextErrors.push(`Select a date for flight ${n}.`);
        if (i > 0 && legs[i - 1]?.date && leg.date && leg.date < legs[i - 1]!.date) {
          nextErrors.push(`Flight ${n} date must be on or after the previous flight.`);
        }
      });
    } else {
      if (!from || !to) nextErrors.push("Select origin and destination airports.");
      if (from && to && from === to) nextErrors.push("Origin and destination must be different.");
      if (!effectiveDepart) nextErrors.push("Departure date is required.");
      if (trip === "round" && !effectiveReturn) nextErrors.push("Return date is required for round trips.");
      if (trip === "round" && effectiveDepart && effectiveReturn && effectiveReturn < effectiveDepart) {
        nextErrors.push("Return date must be on or after departure.");
      }
    }

    setErrors(nextErrors);
    if (nextErrors.length) return;

    const primary = trip === "multi" ? legs[0]! : { from, to, date: effectiveDepart };

    setSearch({
      from: primary.from,
      to: primary.to,
      depart: primary.date,
      returnDate: trip === "round" ? effectiveReturn : "",
      trip,
      cabin,
      passengers,
    });

    const params = new URLSearchParams({
      from: primary.from,
      to: primary.to,
      depart: primary.date,
      adults: String(passengers.adults),
      children: String(passengers.children),
      infants: String(passengers.infants),
      cabin,
      trip,
      fare: fareType,
    });
    if (trip === "round" && effectiveReturn) params.set("return", effectiveReturn);
    if (trip === "multi") {
      params.set("legs", String(legs.length));
      legs.forEach((leg, i) => {
        params.set(`leg${i + 1}From`, leg.from);
        params.set(`leg${i + 1}To`, leg.to);
        params.set(`leg${i + 1}Date`, leg.date);
      });
    }
    router.push(`/flights?${params.toString()}`);
  };

  const onPassengersChange = (p: PassengerCounts, c: CabinClass) => {
    setPassengers(p);
    setCabin(c);
  };

  const isMulti = trip === "multi";

  return (
    <form
      className={compact ? "space-y-3" : "space-y-4 max-md:space-y-3"}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
    >
      <div className="hidden flex-col gap-3 md:flex md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Trip type">
          {tripTypes.map((type) => {
            const active = trip === type.id;
            return (
              <button
                key={type.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTripType(type.id)}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition ${
                  active
                    ? "bg-primary-strong text-white"
                    : "bg-bg text-slate hover:bg-primary-tint hover:text-primary-strong"
                }`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                    active ? "border-white" : "border-slate/40"
                  }`}
                  aria-hidden="true"
                >
                  {active ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                </span>
                {type.label}
              </button>
            );
          })}
        </div>
        <PassengerSelector passengers={passengers} cabin={cabin} onChange={onPassengersChange} />
      </div>

      <div className="grid grid-cols-3 gap-2 md:hidden" role="radiogroup" aria-label="Trip type">
        {tripTypes.map((type) => {
          const active = trip === type.id;
          return (
            <button
              key={type.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTripType(type.id)}
              className={`inline-flex min-h-10 items-center justify-center rounded-full px-2 text-[13px] font-semibold transition ${
                active
                  ? "bg-primary-strong text-white"
                  : "border border-border bg-transparent text-slate"
              }`}
            >
              {type.mobileLabel}
            </button>
          );
        })}
      </div>

      {!isMulti ? (
        <>
          <div className="relative rounded-2xl border border-border md:hidden">
            <AirportPicker label="From" value={from} onChange={setFrom} exclude={to} flush />
            <div className="mx-4 border-t border-border" />
            <AirportPicker label="To" value={to} onChange={setTo} exclude={from} flush />
            <button
              type="button"
              aria-label="Swap airports"
              onClick={swap}
              className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-primary-strong shadow-sm"
            >
              <LuArrowUpDown className="h-4 w-4" aria-hidden />
            </button>
          </div>

          {trip === "round" ? (
            <div className="md:hidden">
              <TripDateRangeField
                departId="depart-date-mobile"
                returnId="return-date-mobile"
                depart={depart}
                returnDate={returnDate}
                min={minDate}
                onDepartChange={changeDepart}
                onReturnChange={setReturnDate}
                onRangeChange={setTripDates}
                appearance="inline"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 rounded-2xl border border-border md:hidden">
              <DatePickerField
                id="depart-date-mobile"
                label="Departure"
                value={depart}
                min={minDate}
                onChange={changeDepart}
              />
              <div className="border-l border-border">
                <DatePickerField
                  id="return-date-mobile"
                  label="Return"
                  value={returnDate}
                  min={depart || minDate}
                  onChange={setReturnDate}
                  disabled={trip === "oneway"}
                />
              </div>
            </div>
          )}

          <div className="md:hidden">
            <PassengerSelector
              variant="field"
              passengers={passengers}
              cabin={cabin}
              onChange={onPassengersChange}
            />
          </div>

          <div className="hidden flex-col gap-3 md:flex lg:flex-row lg:items-end">
            <div className="relative grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr]">
              <AirportPicker label="From" value={from} onChange={setFrom} exclude={to} />
              <button
                type="button"
                aria-label="Swap airports"
                onClick={swap}
                className="absolute left-1/2 top-[calc(1.25rem+36px)] z-10 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-navy shadow-sm transition hover:border-primary-strong hover:text-primary-strong xl:left-[calc(25%-0.375rem)]"
              >
                <LuArrowLeftRight className="h-4 w-4" aria-hidden />
              </button>
              <AirportPicker label="To" value={to} onChange={setTo} exclude={from} />

              {trip === "round" ? (
                <TripDateRangeField
                  departId="depart-date"
                  returnId="return-date"
                  depart={depart}
                  returnDate={returnDate}
                  min={minDate}
                  onDepartChange={changeDepart}
                  onReturnChange={setReturnDate}
                  onRangeChange={setTripDates}
                  appearance="labeled"
                  className="sm:col-span-2"
                />
              ) : (
                <>
                  <LabeledDatePickerField
                    id="depart-date"
                    label="Departure"
                    value={depart}
                    min={minDate}
                    onChange={changeDepart}
                  />
                  <LabeledDatePickerField
                    id="return-date"
                    label="Return"
                    value={returnDate}
                    min={depart || minDate}
                    onChange={setReturnDate}
                    disabled={trip === "oneway"}
                  />
                </>
              )}
            </div>

            <div className="w-full shrink-0 lg:w-auto">
              <span
                className="mb-1 block select-none text-xs font-semibold uppercase tracking-wide text-transparent"
                aria-hidden
              >
                Search
              </span>
              <button
                type="submit"
                className="btn-primary flex h-[72px] w-full items-center justify-center gap-2 rounded-xl px-6 lg:min-w-[132px]"
              >
                <LuSearch className="h-5 w-5" aria-hidden />
                Search
              </button>
            </div>
          </div>

          <div className="md:hidden">
            <button
              type="submit"
              className="btn-primary flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px]"
            >
              <LuSearch className="h-5 w-5" aria-hidden />
              Search flights
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="md:hidden">
            <PassengerSelector
              variant="field"
              passengers={passengers}
              cabin={cabin}
              onChange={onPassengersChange}
            />
          </div>

          <div className="space-y-3">
            {legs.map((leg, index) => (
              <div
                key={index}
                className="relative rounded-2xl border border-border p-3 sm:p-0 sm:border-0"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="relative grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_minmax(160px,0.85fr)]">
                    <AirportPicker
                      label={index === 0 ? "From" : `Flight ${index + 1} from`}
                      value={leg.from}
                      onChange={(code) => updateLeg(index, { from: code })}
                      exclude={leg.to}
                    />
                    <button
                      type="button"
                      aria-label={`Swap flight ${index + 1} airports`}
                      onClick={() => swapLeg(index)}
                      className="absolute left-1/2 top-[calc(1.25rem+36px)] z-10 hidden h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-navy shadow-sm transition hover:border-primary-strong hover:text-primary-strong sm:flex sm:left-[calc(33.333%-0.375rem)]"
                    >
                      <LuArrowLeftRight className="h-4 w-4" aria-hidden />
                    </button>
                    <AirportPicker
                      label={index === 0 ? "To" : `Flight ${index + 1} to`}
                      value={leg.to}
                      onChange={(code) => updateLeg(index, { to: code })}
                      exclude={leg.from}
                    />
                    <LabeledDatePickerField
                      id={`multi-date-${index}`}
                      label="Date"
                      value={leg.date}
                      min={index === 0 ? minDate : legs[index - 1]?.date || minDate}
                      onChange={(v) => updateLeg(index, { date: v })}
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 sm:pb-3">
                    <button
                      type="button"
                      aria-label={`Swap flight ${index + 1} airports`}
                      onClick={() => swapLeg(index)}
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-navy sm:hidden"
                    >
                      <LuArrowUpDown className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove flight ${index + 1}`}
                      title={
                        legs.length <= 2
                          ? "At least 2 flights are required"
                          : `Remove flight ${index + 1}`
                      }
                      disabled={legs.length <= 2}
                      onClick={() => removeLeg(index)}
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-bg text-slate transition hover:border-error hover:text-error-text disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-border disabled:hover:text-slate"
                    >
                      <LuX className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={addLeg}
              disabled={legs.length >= MAX_LEGS}
              className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-primary-strong disabled:cursor-not-allowed disabled:opacity-40"
            >
              <LuPlus className="h-4 w-4" aria-hidden />
              Add More Flight
            </button>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div
                className="flex flex-wrap items-center gap-1"
                role="radiogroup"
                aria-label="Fare type"
              >
                {fareTypes.map((type) => {
                  const active = fareType === type.id;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setFareType(type.id)}
                      className={`inline-flex min-h-9 items-center gap-2 rounded-full px-2.5 text-sm font-medium transition ${
                        active ? "text-primary-strong" : "text-slate hover:text-navy"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                          active ? "border-primary-strong" : "border-slate/35"
                        }`}
                        aria-hidden
                      >
                        {active ? (
                          <span className="h-2 w-2 rounded-full bg-primary-strong" />
                        ) : null}
                      </span>
                      {type.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="submit"
                className="btn-primary inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold sm:h-[52px] sm:rounded-xl sm:px-7"
              >
                <LuSearch className="h-5 w-5" aria-hidden />
                Search
              </button>
            </div>
          </div>
        </>
      )}

      {!isMulti ? (
        <div
          className="hidden flex-wrap items-center gap-1 md:flex"
          role="radiogroup"
          aria-label="Fare type"
        >
          {fareTypes.map((type) => {
            const active = fareType === type.id;
            return (
              <button
                key={type.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setFareType(type.id)}
                className={`inline-flex min-h-9 items-center gap-2 rounded-full px-2.5 text-sm font-medium transition ${
                  active ? "text-primary-strong" : "text-slate hover:text-navy"
                }`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                    active ? "border-primary-strong" : "border-slate/35"
                  }`}
                  aria-hidden
                >
                  {active ? <span className="h-2 w-2 rounded-full bg-primary-strong" /> : null}
                </span>
                {type.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {errors.length ? (
        <ul className="space-y-1" role="alert">
          {errors.map((err) => (
            <li key={err} className="form-error text-sm">
              {err}
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
