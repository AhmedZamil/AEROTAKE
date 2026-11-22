"use client";

import { format as formatDate, parseISO, startOfDay } from "date-fns";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DayPicker } from "react-day-picker";
import { LuCalendar } from "react-icons/lu";
import "react-day-picker/style.css";

type Variant = "field" | "big";

type Props = {
  id?: string;
  label: string;
  value: string; // yyyy-MM-dd
  onChange: (iso: string) => void;
  min?: string; // yyyy-MM-dd
  disabled?: boolean;
  /** `field` = search form row; `big` = modify-overlay day+month display. */
  variant?: Variant;
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
  month_caption: "flex items-center justify-center h-8 text-[13px] font-semibold text-navy",
  nav: "absolute inset-x-1 top-0 flex h-8 items-center justify-between",
  button_previous:
    "flex h-7 w-7 items-center justify-center rounded-lg text-slate hover:bg-bg disabled:opacity-30",
  button_next:
    "flex h-7 w-7 items-center justify-center rounded-lg text-slate hover:bg-bg disabled:opacity-30",
  weekday: "text-[11px] font-medium text-slate",
  day_button:
    "text-[13px] font-medium text-navy rounded-full transition-colors hover:bg-bg",
  selected: "[&_button]:bg-primary [&_button]:text-white [&_button]:hover:bg-primary-strong",
  today: "[&_button]:font-bold [&_button]:text-primary",
  outside: "opacity-40",
  disabled: "opacity-30",
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

function formatPrimary(iso: string, variant: Variant): string {
  if (!iso) return variant === "big" ? "—" : "Select date";
  try {
    const d = parseISO(iso);
    return variant === "big" ? formatDate(d, "d") : formatDate(d, "dd/MM/yyyy");
  } catch {
    return iso;
  }
}

function formatSecondary(iso: string, variant: Variant): { title: string; sub: string } | null {
  if (!iso) {
    return variant === "big" ? { title: "Select", sub: "date" } : null;
  }
  try {
    const d = parseISO(iso);
    if (variant === "big") {
      return { title: formatDate(d, "MMMM"), sub: formatDate(d, "EEEE, yyyy") };
    }
    return { title: formatDate(d, "EEE, d MMM yyyy"), sub: "" };
  } catch {
    return null;
  }
}

/**
 * OTA-style calendar panel (react-day-picker). The panel is portaled to document.body
 * so it is never clipped by overflow-hidden parents (search card, mobile date grid, modals).
 * Value stays yyyy-MM-dd so search URL params and validation are unchanged.
 */
export default function DatePickerField({
  id,
  label,
  value,
  onChange,
  min,
  disabled = false,
  variant = "field",
  className = "",
}: Props) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PanelPos | null>(null);

  const updatePos = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(Math.max(r.width, 300), window.innerWidth - 16);
    let left = r.left;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    if (left < 8) left = 8;
    setPos({ top: r.bottom + 4, left, width });
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
  }, [open]);

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

  const selected = isoToDate(value);
  const minDate = min ? startOfDay(isoToDate(min) ?? new Date()) : undefined;
  const secondary = formatSecondary(value, variant);

  const toggle = () => {
    if (disabled) return;
    setOpen((v) => !v);
  };

  const panel =
    open && !disabled && pos
      ? createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={`Choose ${label.toLowerCase()}`}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              zIndex: 80,
            }}
            className="overflow-hidden rounded-xl border border-border bg-card py-1 shadow-[0_12px_32px_rgba(16,24,40,0.18)]"
          >
            <div className="px-2 py-2" style={THEME}>
              <DayPicker
                mode="single"
                selected={selected}
                defaultMonth={selected ?? minDate ?? new Date()}
                disabled={minDate ? { before: minDate } : undefined}
                onSelect={(day) => {
                  if (!day) return;
                  onChange(dateToIso(day));
                  setOpen(false);
                }}
                classNames={CLASS_NAMES}
              />
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={`relative min-w-0 ${open ? "z-40" : ""} ${className}`}>
      {/* Native date input stays in the DOM (visually hidden) so Playwright can still fill/read
          ISO values and `min`, while the visible control is the calendar panel. */}
      <input
        id={fieldId}
        type="date"
        value={value}
        min={min || undefined}
        disabled={disabled}
        data-date-iso={value}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
      />

      {variant === "big" ? (
        <button
          ref={triggerRef}
          type="button"
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={disabled}
          onClick={toggle}
          className={`flex min-h-[72px] w-full min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 text-left transition ${
            disabled
              ? "pointer-events-none opacity-45"
              : "hover:border-primary-strong/40"
          }`}
        >
          <span className="text-[32px] font-bold leading-none tabular-nums text-navy">
            {formatPrimary(value, "big")}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-navy">
              {secondary?.title ?? "Select"}
            </span>
            <span className="block truncate text-xs text-slate">{secondary?.sub ?? "date"}</span>
          </span>
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={disabled}
          onClick={toggle}
          className={`relative flex min-h-[72px] w-full cursor-pointer flex-col justify-center px-3.5 py-3 text-left ${
            disabled ? "cursor-not-allowed opacity-50" : "hover:bg-bg/60"
          }`}
        >
          <span className="block text-xs font-medium text-slate">{label}</span>
          <span className="mt-1 flex items-center justify-between gap-2">
            <span className="text-[15px] font-semibold text-navy">
              {formatPrimary(value, "field")}
            </span>
            <LuCalendar className="h-5 w-5 shrink-0 text-slate" aria-hidden />
          </span>
        </button>
      )}

      {panel}
    </div>
  );
}

/** Desktop search-form variant with an external uppercase label above the trigger. */
export function LabeledDatePickerField({
  id,
  label,
  value,
  onChange,
  min,
  disabled,
}: Omit<Props, "variant" | "className">) {
  return (
    <div className="min-w-0">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate">
        {label}
      </span>
      <DatePickerField
        id={id}
        label={label}
        value={value}
        onChange={onChange}
        min={min}
        disabled={disabled}
        variant="field"
        className="rounded-xl border border-border bg-card"
      />
    </div>
  );
}
