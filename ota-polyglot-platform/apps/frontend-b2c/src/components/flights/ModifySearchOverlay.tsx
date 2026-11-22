"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { returnAfterDeparture, todayIso } from "@/lib/dates";
import { LuArrowLeftRight, LuPlus, LuSearch, LuX } from "react-icons/lu";
import AirportPicker from "@/components/flights/AirportPicker";
import DatePickerField from "@/components/flights/DatePickerField";
import TripDateRangeField from "@/components/flights/TripDateRangeField";
import PassengerSelector from "@/components/flights/PassengerSelector";
import type { PassengerCounts, TripType } from "@/context/AppProviders";
import { useApp } from "@/context/AppProviders";
import type { CabinClass } from "@/lib/flight-types";

type Props = {
  open: boolean;
  onClose: () => void;
};

const tripTypes: { id: TripType; label: string }[] = [
  { id: "oneway", label: "One Way" },
  { id: "round", label: "Round Trip" },
  { id: "multi", label: "Multi City" },
];

const fareTypes = [
  { id: "regular", label: "Regular Fare" },
  { id: "student", label: "Student Fare" },
  { id: "umrah", label: "Umrah Fare" },
] as const;

const MAX_LEGS = 5;

type FareType = (typeof fareTypes)[number]["id"];
type Leg = { from: string; to: string; date: string };

function emptyLeg(seed?: Partial<Leg>): Leg {
  return {
    from: seed?.from ?? "",
    to: seed?.to ?? "",
    date: seed?.date ?? "",
  };
}

export default function ModifySearchOverlay({ open, onClose }: Props) {
  const router = useRouter();
  const { search, setSearch } = useApp();
  const titleId = useId();
  const [minDate, setMinDate] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => setMinDate(todayIso()), 0);
    return () => window.clearTimeout(id);
  }, []);
  const [from, setFrom] = useState(search.from);
  const [to, setTo] = useState(search.to);
  const [depart, setDepart] = useState(search.depart);
  const [returnDate, setReturnDate] = useState(search.returnDate);
  const [trip, setTrip] = useState<TripType>(search.trip);
  const [cabin, setCabin] = useState<CabinClass>(search.cabin);
  const [passengers, setPassengers] = useState<PassengerCounts>(search.passengers);
  const [fare, setFare] = useState<FareType>("regular");
  const [legs, setLegs] = useState<Leg[]>([
    emptyLeg({ from: search.from, to: search.to, date: search.depart }),
    emptyLeg({
      from: search.to,
      to: "LHR",
      date: search.returnDate || search.depart,
    }),
  ]);
  const [errors, setErrors] = useState<string[]>([]);

  // Seed fields only when the dialog opens. Re-running on every `search` update (results page
  // keeps syncing URL → context) wiped From/To mid-edit so Search looked broken.
  useEffect(() => {
    if (!open) return;
    setFrom(search.from);
    setTo(search.to);
    setDepart(search.depart);
    setReturnDate(search.returnDate);
    setTrip(search.trip);
    setCabin(search.cabin);
    setPassengers(search.passengers);
    setLegs([
      emptyLeg({ from: search.from, to: search.to, date: search.depart }),
      emptyLeg({
        from: search.to,
        to: "LHR",
        date: search.returnDate || search.depart,
      }),
    ]);
    setErrors([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally seed once per open
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const isMulti = trip === "multi";

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

  const setTripDates = (nextDepart: string, nextReturn: string) => {
    setDepart(nextDepart);
    setReturnDate(nextReturn);
  };

  const swap = () => {
    setFrom(to);
    setTo(from);
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

    if (isMulti) {
      legs.forEach((leg, i) => {
        const n = i + 1;
        if (!leg.from || !leg.to) nextErrors.push(`Select airports for flight ${n}.`);
        else if (leg.from === leg.to) {
          nextErrors.push(`Flight ${n} origin and destination must differ.`);
        }
        if (!leg.date) nextErrors.push(`Select a date for flight ${n}.`);
        if (i > 0 && legs[i - 1]?.date && leg.date && leg.date < legs[i - 1]!.date) {
          nextErrors.push(`Flight ${n} date must be on or after the previous flight.`);
        }
      });
    } else {
      if (!from || !to) nextErrors.push("Select origin and destination.");
      if (from && to && from === to) nextErrors.push("Origin and destination must differ.");
      if (!depart) nextErrors.push("Departure date is required.");
      if (trip === "round" && !returnDate) nextErrors.push("Return date is required.");
      if (trip === "round" && depart && returnDate && returnDate < depart) {
        nextErrors.push("Return must be on or after departure.");
      }
    }

    setErrors(nextErrors);
    if (nextErrors.length) return;

    const primary = isMulti ? legs[0]! : { from, to, date: depart };

    setSearch({
      from: primary.from,
      to: primary.to,
      depart: primary.date,
      returnDate: trip === "round" ? returnDate : "",
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
      fare,
    });
    if (trip === "round" && returnDate) params.set("return", returnDate);
    if (isMulti) {
      params.set("legs", String(legs.length));
      legs.forEach((leg, i) => {
        params.set(`leg${i + 1}From`, leg.from);
        params.set(`leg${i + 1}To`, leg.to);
        params.set(`leg${i + 1}Date`, leg.date);
      });
    }
    onClose();
    router.push(`/flights?${params.toString()}`);
  };

  const totalPax = passengers.adults + passengers.children + passengers.infants;

  return (
    <div className="fixed inset-0 z-[65] flex flex-col">
      <button
        type="button"
        aria-label="Close modify search"
        className="absolute inset-0 bg-navy/55 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <div className="relative z-10 pt-16">
        <div className="relative mx-auto w-full max-w-[1320px] px-3 sm:px-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="overflow-visible rounded-2xl border border-border bg-card p-4 shadow-[0_16px_48px_rgba(16,24,40,0.18)] sm:p-5"
          >
            <h2 id={titleId} className="sr-only">
              Modify search
            </h2>

            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              noValidate
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div
                  className="flex flex-wrap items-center gap-1.5"
                  role="radiogroup"
                  aria-label="Trip type"
                >
                  {tripTypes.map((type) => {
                    const active = trip === type.id;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setTripType(type.id)}
                        className={`inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold transition ${
                          active
                            ? "bg-primary-tint text-primary-strong ring-1 ring-primary-strong/30"
                            : "text-slate hover:bg-bg hover:text-navy"
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

                <div className="flex flex-wrap items-center gap-2">
                  <PassengerSelector
                    passengers={passengers}
                    cabin={cabin}
                    onChange={(p, c) => {
                      setPassengers(p);
                      setCabin(c);
                    }}
                  />
                </div>
              </div>

              {!isMulti ? (
                <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
                  <div className="relative z-20 grid min-w-0 flex-1 grid-cols-1 overflow-visible rounded-xl border border-border sm:grid-cols-2">
                    <AirportPicker
                      label="From"
                      value={from}
                      onChange={setFrom}
                      exclude={to}
                      flush
                    />
                    <div className="border-t border-border sm:border-l sm:border-t-0">
                      <AirportPicker
                        label="To"
                        value={to}
                        onChange={setTo}
                        exclude={from}
                        flush
                      />
                    </div>
                    <button
                      type="button"
                      aria-label="Swap airports"
                      onClick={swap}
                      className="absolute left-1/2 top-1/2 z-30 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-navy shadow-sm transition hover:border-primary-strong hover:text-primary-strong"
                    >
                      <LuArrowLeftRight className="h-4 w-4 rotate-90 sm:rotate-0" aria-hidden />
                    </button>
                  </div>

                  <div className="relative z-10 flex min-w-0 flex-[0.95] flex-col gap-2 sm:flex-row">
                    {trip === "round" ? (
                      <TripDateRangeField
                        departId="modify-depart"
                        returnId="modify-return"
                        depart={depart}
                        returnDate={returnDate}
                        min={minDate}
                        onDepartChange={(v) => {
                          setDepart(v);
                          setReturnDate((prev) => returnAfterDeparture(v, prev));
                        }}
                        onReturnChange={setReturnDate}
                        onRangeChange={setTripDates}
                        appearance="big"
                      />
                    ) : (
                      <>
                        <DatePickerField
                          id="modify-depart"
                          label="Departure"
                          value={depart}
                          min={minDate}
                          variant="big"
                          className="flex-1"
                          onChange={(v) => {
                            setDepart(v);
                            setReturnDate((prev) => returnAfterDeparture(v, prev));
                          }}
                        />
                        <DatePickerField
                          id="modify-return"
                          label="Return"
                          value={returnDate}
                          min={depart || minDate}
                          variant="big"
                          className="flex-1"
                          onChange={setReturnDate}
                          disabled={trip === "oneway"}
                        />
                      </>
                    )}
                    <button
                      type="submit"
                      aria-label={`Search flights · ${totalPax} traveller${totalPax === 1 ? "" : "s"}`}
                      className="btn-primary flex h-[72px] w-full shrink-0 items-center justify-center gap-2 rounded-xl px-5 sm:w-[72px] sm:px-4"
                    >
                      <LuSearch className="h-6 w-6" aria-hidden />
                      <span className="text-sm font-semibold sm:sr-only">Search</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {legs.map((leg, index) => (
                    <div key={index} className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                      <div className="relative z-20 grid min-w-0 flex-1 grid-cols-1 overflow-visible rounded-xl border border-border sm:grid-cols-2">
                        <AirportPicker
                          label={`Flight ${index + 1} from`}
                          value={leg.from}
                          onChange={(code) => updateLeg(index, { from: code })}
                          exclude={leg.to}
                          flush
                        />
                        <div className="border-t border-border sm:border-l sm:border-t-0">
                          <AirportPicker
                            label={`Flight ${index + 1} to`}
                            value={leg.to}
                            onChange={(code) => updateLeg(index, { to: code })}
                            exclude={leg.from}
                            flush
                          />
                        </div>
                        <button
                          type="button"
                          aria-label={`Swap flight ${index + 1} airports`}
                          onClick={() => swapLeg(index)}
                          className="absolute left-1/2 top-1/2 z-30 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-navy shadow-sm transition hover:border-primary-strong hover:text-primary-strong"
                        >
                          <LuArrowLeftRight
                            className="h-4 w-4 rotate-90 sm:rotate-0"
                            aria-hidden
                          />
                        </button>
                      </div>

                      <div className="relative z-10 flex min-w-0 items-stretch gap-2 sm:w-[280px] sm:shrink-0">
                        <DatePickerField
                          id={`modify-multi-date-${index}`}
                          label={`Flight ${index + 1} date`}
                          value={leg.date}
                          min={index === 0 ? minDate : legs[index - 1]?.date || minDate}
                          variant="big"
                          className="flex-1"
                          onChange={(v) => updateLeg(index, { date: v })}
                        />
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
                          className="flex h-[72px] w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-bg text-slate transition hover:border-error hover:text-error-text disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-border disabled:hover:text-slate"
                        >
                          <LuX className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </div>
                  ))}

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

                    <button
                      type="submit"
                      aria-label={`Search flights · ${totalPax} traveller${totalPax === 1 ? "" : "s"}`}
                      className="btn-primary inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold sm:h-[52px]"
                    >
                      <LuSearch className="h-5 w-5" aria-hidden />
                      Search
                    </button>
                  </div>
                </div>
              )}

              <div
                className="flex flex-wrap items-center gap-1.5"
                role="radiogroup"
                aria-label="Fare type"
              >
                {fareTypes.map((type) => {
                  const active = fare === type.id;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setFare(type.id)}
                      className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-sm font-medium transition ${
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
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute -bottom-14 left-1/2 z-20 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-card text-slate shadow-md transition hover:text-navy sm:left-auto sm:right-6 sm:top-3 sm:translate-x-0"
          >
            <LuX className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
