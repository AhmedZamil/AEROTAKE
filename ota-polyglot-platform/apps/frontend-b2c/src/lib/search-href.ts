import type { SearchParamsState } from "@/context/AppProviders";

/**
 * Rebuild the results URL from the last search the visitor ran.
 * Labeled "Back to results" actions must use this — never history.back(),
 * which can land on login or an earlier booking step after redirects.
 */
export function flightsResultsHref(search: SearchParamsState): string {
  const q = new URLSearchParams();
  if (search.from) q.set("from", search.from);
  if (search.to) q.set("to", search.to);
  if (search.depart) q.set("depart", search.depart);
  q.set("trip", search.trip === "round" ? "round" : search.trip === "multi" ? "multi" : "oneway");
  if (search.trip === "round" && search.returnDate) q.set("return", search.returnDate);
  q.set("adults", String(Math.max(1, search.passengers.adults)));
  q.set("children", String(Math.max(0, search.passengers.children)));
  q.set("infants", String(Math.max(0, search.passengers.infants)));
  q.set("cabin", search.cabin || "economy");
  const qs = q.toString();
  return qs ? `/flights?${qs}` : "/";
}
