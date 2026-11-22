"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { searchAirports, SUGGESTED_CODES, useAirport, type Airport } from "@/lib/airports";

type Props = {
  label: string;
  value: string;
  onChange: (code: string) => void;
  exclude?: string;
  flush?: boolean;
};

type PanelPos = { top: number; left: number; width: number };

export default function AirportPicker({ label, value, onChange, exclude, flush = false }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selected = useAirport(value);
  const [found, setFound] = useState<{ q: string; list: Airport[] }>({ q: "\u0000", list: [] });
  const results = found.list.filter((a) => a.code !== exclude);

  const updatePos = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 280) });
  };

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePos();
    const onScroll = () => updatePos();
    window.addEventListener("resize", onScroll);
    // capture scroll from any scrollable ancestor (modals, pages)
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  // What the list shows: matches for what is typed (from core's directory), or suggestions before anything is typed.
  useEffect(() => {
    if (!open) return;
    let live = true;
    const term = query.trim();
    const timer = window.setTimeout(
      () => {
        void (term
          ? searchAirports(term)
          : Promise.all(
              SUGGESTED_CODES.map((c) => searchAirports(c).then((l) => l.find((a) => a.code === c))),
            ).then((l) => l.filter((a): a is Airport => Boolean(a)))
        ).then((list) => {
          if (live) setFound({ q: term, list });
        });
      },
      term ? 200 : 0,
    );
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const pick = (airport: Airport) => {
    onChange(airport.code);
    setQuery("");
    setOpen(false);
  };

  const panel =
    open && pos
      ? createPortal(
          <div
            ref={panelRef}
            id={listId}
            role="listbox"
            style={{
              position: "fixed",
              top: pos.top,
              left: Math.min(pos.left, window.innerWidth - pos.width - 8),
              width: Math.min(pos.width, window.innerWidth - 16),
              zIndex: 80,
            }}
            className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_12px_32px_rgba(16,24,40,0.18)]"
          >
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, results.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter" && results[active]) {
                  e.preventDefault();
                  pick(results[active]!);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setOpen(false);
                }
              }}
              placeholder="Search city or code"
              className="input-field h-12 w-full rounded-none border-0 border-b border-border px-4 text-base"
              aria-autocomplete="list"
              aria-controls={listId}
            />
            <ul className="max-h-56 overflow-y-auto py-1">
              {results.length === 0 ? (
                <li className="px-4 py-3 text-sm text-slate">No airports found</li>
              ) : (
                results.map((airport, index) => (
                  <li key={airport.code} role="option" aria-selected={index === active}>
                    <button
                      type="button"
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left ${
                        index === active ? "bg-primary-tint" : "hover:bg-bg"
                      }`}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => pick(airport)}
                    >
                      <span className="w-10 font-bold text-navy">{airport.code}</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-navy">{airport.city}</span>
                        <span className="block truncate text-xs text-slate">
                          {airport.name}, {airport.country}
                        </span>
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={`relative min-w-0 flex-1 ${open ? "z-50" : ""}`}>
      {flush ? null : (
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate">
          {label}
        </label>
      )}
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={flush ? label : undefined}
        onClick={() => {
          setOpen((v) => !v);
          setQuery("");
          setActive(0);
        }}
        className={
          flush
            ? "flex min-h-[76px] w-full items-start gap-2.5 bg-transparent px-4 py-3 pr-14 text-left"
            : "flex h-[72px] w-full items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 text-left transition hover:border-primary-strong/40"
        }
      >
        {flush ? (
          <span className="min-w-0">
            <span className="mb-1 block text-xs font-medium text-slate">{label}</span>
            <span className="flex items-start gap-2.5">
              <span className="shrink-0 text-[26px] font-bold leading-none text-navy">
                {selected?.code ?? (value || "—")}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold leading-tight text-navy">
                  {selected?.city ?? "Select airport"}
                </span>
                <span className="mt-0.5 block truncate text-xs text-slate">
                  {selected ? `${selected.country}, ${selected.name}` : "City or IATA code"}
                </span>
              </span>
            </span>
          </span>
        ) : (
          <>
            <span className="shrink-0 text-[24px] font-bold leading-none text-navy sm:text-[26px]">
              {selected?.code ?? (value || "—")}
            </span>
            <span className="h-9 w-px shrink-0 bg-border" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold text-navy">
                {selected?.city ?? "Select airport"}
              </span>
              <span className="block truncate text-xs text-slate">
                {selected ? `${selected.country}, ${selected.name}` : "City or IATA code"}
              </span>
            </span>
          </>
        )}
      </button>
      {panel}
    </div>
  );
}
