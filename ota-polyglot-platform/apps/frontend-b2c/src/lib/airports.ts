"use client";

import { useEffect, useState } from "react";

export type Airport = { code: string; name: string; city: string; country: string };

const cache = new Map<string, Promise<Airport[]>>();

/** Airports matching a city, name or IATA code, from core-engine's directory (cached per query for the life of the page). */
export function searchAirports(query: string): Promise<Airport[]> {
  const q = query.trim();
  if (!q) return Promise.resolve([]);
  const key = q.toLowerCase();
  let hit = cache.get(key);
  if (!hit) {
    hit = fetch(`/api/airports?q=${encodeURIComponent(q)}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((b: { items?: Airport[] }) => b.items ?? [])
      .catch(() => {
        cache.delete(key); // a failed lookup must not be remembered
        return [] as Airport[];
      });
    cache.set(key, hit);
  }
  return hit;
}

/** The airport for an IATA code, or undefined while loading / if unknown. Callers fall back to showing the code itself. */
export function useAirport(code: string): Airport | undefined {
  const [found, setFound] = useState<{ code: string; airport?: Airport } | null>(null);
  useEffect(() => {
    let live = true;
    if (!/^[A-Za-z]{3}$/.test(code)) return;
    void searchAirports(code).then((list) => {
      if (live) setFound({ code, airport: list.find((a) => a.code.toUpperCase() === code.toUpperCase()) });
    });
    return () => {
      live = false;
    };
  }, [code]);
  return found?.code === code ? found.airport : undefined;
}

/** Suggestions shown before the visitor types: major airports for this site's markets (Bangladesh, the Gulf, Europe, South-East Asia). */
export const SUGGESTED_CODES = ["DAC", "CGP", "CXB", "DXB", "DOH", "JED", "LHR", "SIN", "KUL", "BKK"];
