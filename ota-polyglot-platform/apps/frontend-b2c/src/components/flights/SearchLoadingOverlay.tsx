"use client";

import { format, parseISO } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { useAirport } from "@/lib/airports";

const MESSAGES = [
  "Asking the airlines for their fares...",
  "Comparing what comes back...",
  "Pricing every option for you...",
];

type Props = {
  from: string;
  to: string;
  depart: string;
  returnDate?: string;
  trip: string;
  travellers: number;
};

function formatShortDate(iso: string) {
  try {
    return format(parseISO(iso), "MMM d");
  } catch {
    return iso;
  }
}

export default function SearchLoadingOverlay({
  from,
  to,
  depart,
  returnDate = "",
  trip,
  travellers,
}: Props) {
  const [progress, setProgress] = useState(8);
  const [messageIndex, setMessageIndex] = useState(0);

  const fromCity = useAirport(from)?.city ?? from;
  const toCity = useAirport(to)?.city ?? to;
  const isRound = trip === "round";

  const dateLine = useMemo(() => {
    const start = formatShortDate(depart);
    const end = isRound && returnDate ? formatShortDate(returnDate) : "";
    const range = end ? `${start} – ${end}` : start;
    const people = travellers === 1 ? "1 person" : `${travellers} people`;
    return `${range} | ${people}`;
  }, [depart, returnDate, isRound, travellers]);

  useEffect(() => {
    const msgTimer = window.setInterval(() => {
      setMessageIndex((i) => (i + 1) % MESSAGES.length);
    }, 1800);
    return () => window.clearInterval(msgTimer);
  }, []);

  useEffect(() => {
    setProgress(8);
    const start = performance.now();
    const duration = 2400;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) * (1 - t);
      setProgress(8 + eased * 86);
      if (t < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [from, to, depart, returnDate, trip]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-navy/40 px-4 backdrop-blur-[2px]"
      role="alertdialog"
      aria-busy="true"
      aria-live="polite"
      aria-label="Searching flights"
    >
      <div className="relative w-full max-w-[420px] overflow-hidden rounded-2xl border border-primary-strong/10 bg-card shadow-[0_20px_60px_rgba(214,58,32,0.18)]">
        <div className="px-6 pb-7 pt-8 text-center sm:px-8">
          <h2 className="text-[22px] font-bold tracking-tight text-navy sm:text-[24px]">
            {fromCity} {isRound ? "⇌" : "→"} {toCity}
          </h2>
          <p className="mt-1.5 text-sm text-slate">{dateLine}</p>

          <div className="mt-8 mb-5 flex items-center justify-center gap-2.5" aria-hidden>
            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-primary [animation-delay:-0.2s]" />
            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-primary-strong" />
          </div>

          <p className="min-h-[1.5rem] text-[15px] font-medium text-navy">{MESSAGES[messageIndex]}</p>
        </div>

        <div className="h-1 w-full bg-primary-tint" aria-hidden>
          <div
            className="h-full bg-primary-strong transition-[width] duration-150 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
