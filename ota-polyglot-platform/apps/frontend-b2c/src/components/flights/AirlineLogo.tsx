"use client";

import { useState } from "react";
import type { Airline } from "@/lib/flight-types";

const SIZES = {
  xs: { box: "h-6 w-6", text: "text-[9px]", pad: "p-0.5" },
  sm: { box: "h-9 w-9", text: "text-[10px]", pad: "p-1" },
  md: { box: "h-10 w-10", text: "text-[11px]", pad: "p-1" },
} as const;

/** Airline logo from core's catalogue; falls back to the coloured code badge when there is no logo or it fails to load. */
export function AirlineLogo({
  airline,
  size = "md",
}: {
  airline: Pick<Airline, "code" | "name" | "color" | "logoUrl">;
  size?: keyof typeof SIZES;
}) {
  const [failed, setFailed] = useState(false);
  const s = SIZES[size];

  if (airline.logoUrl && !failed) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-border ${s.box}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- external CDN logo, skip the image optimiser */}
        <img
          src={airline.logoUrl}
          alt={airline.name}
          loading="lazy"
          referrerPolicy="no-referrer"
          className={`h-full w-full object-contain ${s.pad}`}
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold leading-none text-white ${s.box} ${s.text}`}
      style={{ backgroundColor: airline.color }}
      aria-hidden
    >
      {airline.code}
    </span>
  );
}
