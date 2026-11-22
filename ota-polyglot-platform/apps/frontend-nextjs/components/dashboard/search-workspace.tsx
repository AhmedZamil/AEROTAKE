"use client";

import { useEffect, useState } from "react";
import BookingSearch, { type FlightSearchQuery } from "./booking-search";
import { useDashboardSidebar } from "./dashboard-shell";
import FlightSearchResults from "./flight-search-results";
import PromoBannerSlider from "./promo-banner-slider";

// The last search is kept for the browser tab so coming Back from the booking
// page shows the results again instead of an empty search page. Results are
// re-fetched (not stored), so prices and offer ids are always fresh.
const LAST_QUERY_KEY = "ota:last-flight-search";

function readLastQuery(): FlightSearchQuery | null {
  try {
    const raw = sessionStorage.getItem(LAST_QUERY_KEY);
    return raw ? (JSON.parse(raw) as FlightSearchQuery) : null;
  } catch {
    return null;
  }
}

export default function SearchWorkspace() {
  const [query, setQuery] = useState<FlightSearchQuery | null>(null);

  // Restored after mount (not in the initial state) to keep server and client
  // first renders identical — but only when this mount is the SPA popping
  // back to this route (Back button / Book Now → back). A literal browser
  // refresh must land on a blank search page, not the last results; the
  // Navigation Timing API is what tells the two apart, since Next's
  // client-side router never creates a new "navigate" entry — the entry's
  // type only changes to "reload" for an actual F5/refresh.
  useEffect(() => {
    const navType = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (navType?.type === "reload") return;
    setQuery((current) => current ?? readLastQuery());
  }, []);

  function handleSearch(next: FlightSearchQuery) {
    try {
      sessionStorage.setItem(LAST_QUERY_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable (private mode etc.) — just no restore on Back.
    }
    setQuery(next);
  }
  const collapse = useDashboardSidebar()?.collapse;
  const hasResults = Boolean(query);

  useEffect(() => {
    if (hasResults) {
      collapse?.();
    }
  }, [hasResults, collapse]);

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-5 px-4 py-4 pb-24 sm:px-6 sm:py-5">
      <BookingSearch
        hasResults={Boolean(query)}
        onSearch={handleSearch}
      />
      {query ? <FlightSearchResults query={query} /> : <PromoBannerSlider />}
    </div>
  );
}
