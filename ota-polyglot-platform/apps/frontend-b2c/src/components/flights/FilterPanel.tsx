"use client";

import type { ReactNode } from "react";
import { useId, useState } from "react";
import { LuChevronDown, LuMoon, LuSun } from "react-icons/lu";
import { useApp } from "@/context/AppProviders";
import { TIME_WINDOWS, type SchedulePick, type TimeWindowId } from "@/lib/schedule-windows";
import { AirlineLogo } from "./AirlineLogo";

export type AirlineOption = {
  code: string;
  name: string;
  color: string;
  logoUrl?: string;
  min: number;
  count: number;
};

type Props = {
  maxPrice: number;
  priceCeiling: number;
  onMaxPrice: (n: number) => void;
  stops: Set<number>;
  onToggleStop: (n: number) => void;
  availableAirlines: AirlineOption[];
  selectedAirlines: Set<string>;
  onToggleAirline: (code: string) => void;
  layovers: string[];
  selectedLayovers: Set<string>;
  onToggleLayover: (code: string) => void;
  /** City names for the leg currently listed. Round trip adds the return clocks. */
  originCity: string;
  destinationCity: string;
  roundTrip: boolean;
  schedule: SchedulePick;
  onToggleWindow: (key: keyof SchedulePick, id: TimeWindowId) => void;
  cabins: Set<string>;
  onToggleCabin: (c: string) => void;
  /** Checked-bag weights (kg) ticked; none ticked = any. */
  bagKgs: Set<number>;
  onToggleBagKg: (kg: number) => void;
  /** Checked-bag weights present in these results, with how many fares carry exactly that much. */
  bagOptions: { kg: number; count: number }[];
  fareFlex: "any" | "flexible" | "saver";
  onFareFlex: (v: "any" | "flexible" | "saver") => void;
  /** Only offer the fare-flexibility filter when the airlines actually said which fares are refundable (most do not). */
  hasRefundData?: boolean;
  onClear: () => void;
  /** Resets the hold countdown when the search changes */
  holdKey?: string;
};

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-9 w-full items-center justify-between gap-2 text-left"
      >
        <h3 className="text-sm font-bold text-navy">{title}</h3>
        <LuChevronDown
          className={`h-4 w-4 shrink-0 text-slate transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>
      {open ? (
        <div id={panelId} className="mt-2">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function windowSummary(selected: Set<TimeWindowId>): string {
  if (selected.size === 0) return "Anytime";
  return TIME_WINDOWS.filter((w) => selected.has(w.id))
    .map((w) => w.label)
    .join(", ");
}

function WindowGrid({
  selected,
  onToggle,
}: {
  selected: Set<TimeWindowId>;
  onToggle: (id: TimeWindowId) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {TIME_WINDOWS.map((window) => {
        const on = selected.has(window.id);
        const Icon = window.icon === "sun" ? LuSun : LuMoon;
        return (
          <button
            key={window.id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(window.id)}
            className={`flex min-h-12 items-center gap-1.5 rounded-xl border px-2 py-2 text-left text-[11px] font-semibold leading-tight transition ${
              on
                ? "border-primary-strong bg-primary-tint text-primary-strong"
                : "border-border bg-bg text-navy hover:border-primary-strong/40"
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {window.label}
          </button>
        );
      })}
    </div>
  );
}

function FlightSchedules({
  originCity,
  destinationCity,
  roundTrip,
  schedule,
  onToggle,
}: {
  originCity: string;
  destinationCity: string;
  roundTrip: boolean;
  schedule: SchedulePick;
  onToggle: (key: keyof SchedulePick, id: TimeWindowId) => void;
}) {
  const [clock, setClock] = useState<"depart" | "arrive">("depart");
  const departGroups = roundTrip
    ? [
        { key: "outboundDepart" as const, city: originCity },
        { key: "returnDepart" as const, city: destinationCity },
      ]
    : [{ key: "outboundDepart" as const, city: originCity }];
  const arriveGroups = roundTrip
    ? [
        { key: "outboundArrive" as const, city: destinationCity },
        { key: "returnArrive" as const, city: originCity },
      ]
    : [{ key: "outboundArrive" as const, city: destinationCity }];
  const groups = clock === "depart" ? departGroups : arriveGroups;
  const heading = clock === "depart" ? "Departure" : "Arrival";

  return (
    <Section title="Flight Schedules">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-bg p-1">
        {(
          [
            ["depart", "Departure"],
            ["arrive", "Arrival"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={clock === id}
            onClick={() => setClock(id)}
            className={`min-h-9 rounded-md text-sm font-semibold ${
              clock === id ? "bg-primary-tint text-primary-strong" : "text-slate hover:text-navy"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3 space-y-3">
        {groups.map((group) => (
          <div key={group.key}>
            <p className="mb-2 text-sm font-semibold text-navy">
              {heading} {group.city}:{" "}
              <span className="font-medium text-slate">{windowSummary(schedule[group.key])}</span>
            </p>
            <WindowGrid
              selected={schedule[group.key]}
              onToggle={(id) => onToggle(group.key, id)}
            />
          </div>
        ))}
      </div>
    </Section>
  );
}

export default function FilterPanel(props: Props) {
  const { format } = useApp();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-navy">Refine results</h2>
        <button
          type="button"
          onClick={props.onClear}
          className="min-h-9 text-sm font-semibold text-primary-strong"
        >
          Reset
        </button>
      </div>

      <Section title="Budget">
        <label htmlFor="price-range" className="mb-2 block text-sm text-slate">
          Up to <span className="font-semibold text-navy">{format(props.maxPrice)}</span>
        </label>
        <input
          id="price-range"
          type="range"
          min={100}
          max={props.priceCeiling}
          step={10}
          value={props.maxPrice}
          onChange={(e) => props.onMaxPrice(Number(e.target.value))}
          className="w-full accent-[var(--color-primary-strong)]"
        />
      </Section>

      <Section title="Connections">
        <div className="space-y-1">
          {(
            [
              [0, "Non-stop"],
              [1, "1 connection"],
              [2, "2+ connections"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex min-h-10 items-center gap-2.5 text-sm text-navy">
              <input
                type="checkbox"
                checked={props.stops.has(value)}
                onChange={() => props.onToggleStop(value)}
                className="h-4 w-4 rounded border-border accent-[var(--color-primary-strong)]"
              />
              {label}
            </label>
          ))}
        </div>
      </Section>

      <FlightSchedules
        originCity={props.originCity}
        destinationCity={props.destinationCity}
        roundTrip={props.roundTrip}
        schedule={props.schedule}
        onToggle={props.onToggleWindow}
      />

      <Section title="Airlines">
        <div className="space-y-1">
          {props.availableAirlines.length === 0 ? (
            <p className="text-xs text-slate">No airlines in this search yet.</p>
          ) : (
            props.availableAirlines.map((airline) => (
              <label
                key={airline.code}
                className="grid min-h-10 grid-cols-[16px_24px_minmax(0,1fr)_auto] items-center gap-2 text-sm text-navy"
              >
                <input
                  type="checkbox"
                  checked={props.selectedAirlines.has(airline.code)}
                  onChange={() => props.onToggleAirline(airline.code)}
                  className="h-4 w-4 rounded border-border accent-[var(--color-primary-strong)]"
                />
                <AirlineLogo airline={airline} size="xs" />
                <span className="truncate leading-tight">{airline.name}</span>
                <span className="tabular-nums text-xs leading-none text-slate">
                  {format(airline.min)}
                </span>
              </label>
            ))
          )}
        </div>
      </Section>

      {props.layovers.length > 0 ? (
        <Section title="Via (layover)" defaultOpen={false}>
          <div className="space-y-1">
            {props.layovers.map((code) => (
              <label key={code} className="flex min-h-10 items-center gap-2.5 text-sm text-navy">
                <input
                  type="checkbox"
                  checked={props.selectedLayovers.has(code)}
                  onChange={() => props.onToggleLayover(code)}
                  className="h-4 w-4 rounded border-border accent-[var(--color-primary-strong)]"
                />
                {code}
              </label>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Bags" defaultOpen={false}>
        <div className="space-y-1">
          {props.bagOptions.map(({ kg, count }) => (
            <label key={kg} className="flex min-h-10 items-center gap-2.5 text-sm text-navy">
              <input
                type="checkbox"
                checked={props.bagKgs.has(kg)}
                onChange={() => props.onToggleBagKg(kg)}
                className="h-4 w-4 rounded border-border accent-[var(--color-primary-strong)]"
              />
              <span className="flex-1">{kg} kg checked bag</span>
              <span className="tabular-nums text-xs leading-none text-slate">{count}</span>
            </label>
          ))}
          {props.bagOptions.length === 0 ? (
            <p className="text-xs text-slate">These fares do not list a checked-bag weight.</p>
          ) : null}
        </div>
      </Section>

      {/* No "Cabin" filter: an offer carries no cabin of its own, so every result would be the cabin that was searched. */}

      {props.hasRefundData ? (
      <Section title="Fare flexibility" defaultOpen={false}>
          <div className="space-y-1">
            {(
              [
                ["any", "All fares"],
                ["flexible", "Change-friendly"],
                ["saver", "Lowest / locked"],
              ] as const
            ).map(([id, label]) => (
              <label key={id} className="flex min-h-10 items-center gap-2.5 text-sm text-navy">
                <input
                  type="radio"
                  name="fare-flex-filter"
                  checked={props.fareFlex === id}
                  onChange={() => props.onFareFlex(id)}
                  className="h-4 w-4 border-border accent-[var(--color-primary-strong)]"
                />
                {label}
              </label>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
