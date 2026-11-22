"use client";

import BottomSheet from "@/components/ui/BottomSheet";
import { useEffect, useState } from "react";
import { LuChevronDown } from "react-icons/lu";
import type { CabinClass } from "@/lib/flight-types";
import type { PassengerCounts } from "@/context/AppProviders";

type Props = {
  passengers: PassengerCounts;
  cabin: CabinClass;
  onChange: (passengers: PassengerCounts, cabin: CabinClass) => void;
  variant?: "pill" | "field";
};

const cabins: { id: CabinClass; label: string }[] = [
  { id: "economy", label: "Economy" },
  { id: "premium", label: "Premium Economy" },
  { id: "business", label: "Business" },
  { id: "first", label: "First" },
];

const MAX_SEATED = 9;

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}

function summarise(p: PassengerCounts): string {
  const parts: string[] = [];
  parts.push(`${p.adults} adult${p.adults === 1 ? "" : "s"}`);
  if (p.children > 0) parts.push(`${p.children} child${p.children === 1 ? "" : "ren"}`);
  if (p.infants > 0) parts.push(`${p.infants} infant${p.infants === 1 ? "" : "s"}`);
  return parts.join(", ");
}

export default function PassengerSelector({
  passengers,
  cabin,
  onChange,
  variant = "pill",
}: Props) {
  const [open, setOpen] = useState(false);
  const [draftPax, setDraftPax] = useState(passengers);
  const [draftCabin, setDraftCabin] = useState(cabin);
  const isMobile = useIsMobile();
  const seated = passengers.adults + passengers.children;
  const total = seated + passengers.infants;

  const openEditor = () => {
    setDraftPax(passengers);
    setDraftCabin(cabin);
    setOpen(true);
  };

  const apply = () => {
    onChange(draftPax, draftCabin);
    setOpen(false);
  };

  const bump = (key: keyof PassengerCounts, delta: number) => {
    setDraftPax((prev) => {
      const next = { ...prev, [key]: Math.max(0, prev[key] + delta) };
      if (key === "adults") next.adults = Math.max(1, next.adults);
      // Seated travellers (adults + children) share the 9-seat cap; infants sit on a lap.
      if (key === "adults" || key === "children") {
        while (next.adults + next.children > MAX_SEATED) {
          if (key === "adults") next.adults -= 1;
          else next.children -= 1;
        }
      }
      if (next.infants > next.adults) next.infants = next.adults;
      return next;
    });
  };

  const canIncrease = (key: keyof PassengerCounts) => {
    if (key === "adults") return draftPax.adults + draftPax.children < MAX_SEATED;
    if (key === "children") return draftPax.adults + draftPax.children < MAX_SEATED;
    return draftPax.infants < draftPax.adults;
  };

  const cabinLabel = cabins.find((c) => c.id === cabin)?.label ?? "Economy";

  const editor = (
    <div className="space-y-5">
      {(
        [
          ["adults", "Adults", "12+ years · needs a seat"],
          ["children", "Children", "2–11 years · needs a seat"],
          ["infants", "Infants", "Under 2 · sits on an adult’s lap"],
        ] as const
      ).map(([key, title, hint]) => (
        <div key={key} className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-navy">{title}</p>
            <p className="text-xs text-slate">{hint}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-lg disabled:opacity-40"
              onClick={() => bump(key, -1)}
              disabled={key === "adults" ? draftPax.adults <= 1 : draftPax[key] <= 0}
              aria-label={`Decrease ${title}`}
            >
              −
            </button>
            <span className="w-6 text-center font-semibold">{draftPax[key]}</span>
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-lg disabled:opacity-40"
              onClick={() => bump(key, 1)}
              disabled={!canIncrease(key)}
              aria-label={`Increase ${title}`}
            >
              +
            </button>
          </div>
        </div>
      ))}
      <p className="rounded-xl bg-bg px-3 py-2 text-xs text-slate">
        Infants travel on a lap (one per adult). Fares include infant charges when the airline prices them.
      </p>
      <div>
        <p className="mb-2 font-semibold text-navy">Cabin</p>
        <div className="grid grid-cols-1 gap-2">
          {cabins.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setDraftCabin(c.id)}
              className={`min-h-11 rounded-xl border px-4 text-left text-sm font-semibold ${
                draftCabin === c.id
                  ? "border-primary-strong bg-primary-tint text-primary-strong"
                  : "border-border text-navy"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <button type="button" className="btn-primary w-full min-h-11 rounded-xl" onClick={apply}>
        Apply
      </button>
    </div>
  );

  return (
    <div className="relative">
      {variant === "field" ? (
        <button
          type="button"
          onClick={openEditor}
          className="flex min-h-[72px] w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left"
        >
          <span className="min-w-0">
            <span className="block text-xs font-medium text-slate">Travellers & class</span>
            <span className="mt-1 block truncate text-[15px] font-semibold text-navy">
              {summarise(passengers)} · {cabinLabel}
            </span>
          </span>
          <LuChevronDown className="h-5 w-5 shrink-0 text-slate" aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          onClick={openEditor}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary-tint px-3.5 py-2 text-sm font-semibold text-primary-strong"
        >
          {total} traveller{total === 1 ? "" : "s"}
          {passengers.infants > 0 ? ` · ${passengers.infants} infant${passengers.infants === 1 ? "" : "s"}` : ""}
          {" · "}
          {cabinLabel}
          <span aria-hidden="true">▾</span>
        </button>
      )}

      {isMobile ? (
        <BottomSheet open={open} onClose={() => setOpen(false)} title="Passengers & cabin">
          {editor}
        </BottomSheet>
      ) : open ? (
        <div className="absolute right-0 top-full z-30 mt-2 w-[320px] rounded-2xl border border-border bg-card p-4 shadow-xl">
          {editor}
        </div>
      ) : null}
    </div>
  );
}
