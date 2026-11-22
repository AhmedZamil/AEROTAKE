"use client";

import { format as formatDate, parseISO, startOfDay } from "date-fns";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DayPicker, type DateRange } from "react-day-picker";
import { nextTripRange } from "@/lib/dates";
import "react-day-picker/style.css";

type Appearance = "labeled" | "inline" | "big";

type Props = {
  departId: string;
  returnId: string;
  depart: string;
  returnDate: string;
  min?: string;
  /** Hidden departure input. May also move the return (the search form's existing rule). */
  onDepartChange: (iso: string) => void;
  onReturnChange: (iso: string) => void;
  /** Both dates at once, from a calendar click. */
  onRangeChange: (depart: string, returnDate: string) => void;
  appearance: Appearance;
  className?: string;
};

type PanelPos = { top: number; left: number; width: number };

const THEME = {
  "--rdp-accent-color": "#fd573c",
  "--rdp-accent-background-color": "#fff4f1",
  "--rdp-today-color": "#fd573c",
  "--rdp-day-width": "38px",
  "--rdp-day-height": "38px",
  "--rdp-day_button-width": "34px",
  "--rdp-day_button-height": "34px",
} as React.CSSProperties;

const CLASS_NAMES = {
  months: "flex flex-col gap-3 md:flex-row md:gap-6",
  month_caption: "flex items-center justify-center h-8 text-[13px] font-semibold text-navy",
  nav: "absolute inset-x-1 top-0 flex h-8 items-center justify-between",
  button_previous:
    "flex h-7 w-7 items-center justify-center rounded-lg text-slate hover:bg-bg disabled:opacity-30",
  button_next:
    "flex h-7 w-7 items-center justify-center rounded-lg text-slate hover:bg-bg disabled:opacity-30",
  weekday: "text-[11px] font-medium text-slate",
};

function isoToDate(iso: string): Date | undefined {
  if (!iso) return undefined;
  try {
    return parseISO(iso);
  } catch {
    return undefined;
  }
}

function dateToIso(d: Date): string {
  return formatDate(d, "yyyy-MM-dd");
}

function parts(iso: string): { day: string; month: string; sub: string } | null {
  if (!iso) return null;
  try {
    const d = parseISO(iso);
    return {
      day: formatDate(d, "d"),
      month: formatDate(d, "MMMM"),
      sub: formatDate(d, "EEEE, yyyy"),
    };
  } catch {
    return null;
  }
}

function DateReadout({ iso, size }: { iso: string; size: "field" | "big" }) {
  const p = parts(iso);
  const dayClass = size === "big" ? "text-[32px]" : "text-[22px]";
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className={`${dayClass} font-bold leading-none tabular-nums text-navy`}>
        {p?.day ?? "—"}
      </span>
      <span className="h-8 w-px shrink-0 bg-border" aria-hidden />
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-navy">{p?.month ?? "Select"}</span>
        <span className="block truncate text-xs text-slate">{p?.sub ?? "date"}</span>
      </span>
    </span>
  );
}

/**
 * One calendar for a round trip. Either date opens it. The first click sets the departure
 * and the second sets the return, shades the days between, and closes. One month on a phone,
 * two from the tablet breakpoint up. Values stay yyyy-MM-dd.
 */
export default function TripDateRangeField({
  departId,
  returnId,
  depart,
  returnDate,
  min,
  onDepartChange,
  onReturnChange,
  onRangeChange,
  appearance,
  className = "",
}: Props) {
  const dialogId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const [months, setMonths] = useState(1);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setMonths(mq.matches ? 2 : 1);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const updatePos = () => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(months === 2 ? 640 : 320, window.innerWidth - 16);
    let left = r.left;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    if (left < 8) left = 8;
    const estimated = 340;
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    let top = r.bottom + 4;
    if (spaceBelow < estimated && spaceAbove > spaceBelow) top = Math.max(8, r.top - estimated - 4);
    setPos({ top, left, width });
  };

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePos();
    const onScroll = () => updatePos();
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, months]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const departDate = isoToDate(depart);
  const returnAsDate = isoToDate(returnDate);
  const minDate = min ? startOfDay(isoToDate(min) ?? new Date()) : undefined;
  const selected: DateRange | undefined = departDate
    ? { from: departDate, to: returnAsDate }
    : undefined;
  const waitingForReturn = Boolean(depart) && !returnDate;
  const active: "depart" | "return" = waitingForReturn ? "return" : "depart";

  const pick = (_range: DateRange | undefined, triggerDate: Date) => {
    const next = nextTripRange(depart, returnDate, dateToIso(triggerDate));
    onRangeChange(next.depart, next.returnDate);
    if (next.complete) setOpen(false);
  };

  const panel =
    open && pos
      ? createPortal(
          <div
            ref={panelRef}
            id={dialogId}
            role="dialog"
            aria-label="Choose departure and return"
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 80 }}
            className="overflow-hidden rounded-xl border border-border bg-card py-1 shadow-[0_12px_32px_rgba(16,24,40,0.18)]"
          >
            <div className="px-2 py-2">
              <DayPicker
                mode="range"
                style={THEME}
                selected={selected}
                defaultMonth={departDate ?? returnAsDate ?? minDate ?? new Date()}
                numberOfMonths={months}
                disabled={minDate ? { before: minDate } : undefined}
                onSelect={pick}
                classNames={CLASS_NAMES}
              />
            </div>
            <p className="border-t border-border px-3 py-2 text-center text-xs text-slate">
              {waitingForReturn ? "Now choose your return date" : "Choose your departure date"}
            </p>
          </div>,
          document.body,
        )
      : null;

  const trigger = (which: "depart" | "return", label: string, iso: string) => {
    const focused = open && active === which;
    const big = appearance === "big";
    return (
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={() => setOpen((v) => !v)}
        className={
          big
            ? `flex min-h-[72px] w-full min-w-0 flex-1 cursor-pointer items-center rounded-xl border bg-card px-3 py-2 text-left transition ${
                focused ? "border-primary-strong" : "border-border hover:border-primary-strong/40"
              }`
            : appearance === "inline"
              ? `flex min-h-[72px] w-full cursor-pointer flex-col justify-center px-3.5 py-3 text-left ${
                  focused ? "bg-[#fff4f1]" : "hover:bg-bg/60"
                }`
              : `flex h-[72px] w-full items-center rounded-xl border bg-card px-3.5 text-left transition ${
                  focused ? "border-primary-strong" : "border-border hover:border-primary-strong/40"
                }`
        }
      >
        {appearance === "inline" ? (
          <span className="block w-full">
            <span className="block text-xs font-medium text-slate">{label}</span>
            <span className="mt-1 block">
              <DateReadout iso={iso} size="field" />
            </span>
          </span>
        ) : (
          <DateReadout iso={iso} size={big ? "big" : "field"} />
        )}
      </button>
    );
  };

  const inputs = (
    <>
      <input
        id={departId}
        type="date"
        value={depart}
        min={min || undefined}
        data-date-iso={depart}
        onChange={(e) => onDepartChange(e.target.value)}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
      />
      <input
        id={returnId}
        type="date"
        value={returnDate}
        min={depart || min || undefined}
        data-date-iso={returnDate}
        onChange={(e) => onReturnChange(e.target.value)}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
      />
    </>
  );

  if (appearance === "labeled") {
    return (
      <div ref={rootRef} className={`relative grid min-w-0 grid-cols-2 gap-3 ${className}`}>
        {inputs}
        <div className="min-w-0">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate">
            Departure
          </span>
          {trigger("depart", "Departure", depart)}
        </div>
        <div className="min-w-0">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate">
            Return
          </span>
          {trigger("return", "Return", returnDate)}
        </div>
        {panel}
      </div>
    );
  }

  if (appearance === "inline") {
    return (
      <div
        ref={rootRef}
        className={`relative col-span-2 grid grid-cols-2 rounded-2xl border border-border ${className}`}
      >
        {inputs}
        {trigger("depart", "Departure", depart)}
        <div className="border-l border-border">{trigger("return", "Return", returnDate)}</div>
        {panel}
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`relative flex min-w-0 flex-1 flex-col gap-2 sm:flex-row ${className}`}>
      {inputs}
      {trigger("depart", "Departure", depart)}
      {trigger("return", "Return", returnDate)}
      {panel}
    </div>
  );
}
