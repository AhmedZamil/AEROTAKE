/** Today as yyyy-MM-dd in the visitor's own timezone (what a date input's `min` needs). */
export function todayIso(): string {
  return offsetIso(0);
}

/** Calendar date `days` from today as yyyy-MM-dd in the visitor's timezone. */
export function offsetIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Next round-trip selection after a calendar click.
 * A finished range (or an empty one) starts again at the clicked day and waits for a return.
 * While waiting for the return, a later day completes the trip; an earlier day becomes the departure and the previous departure becomes the return.
 */
export function nextTripRange(
  depart: string,
  returnDate: string,
  picked: string,
): { depart: string; returnDate: string; complete: boolean } {
  if (depart && !returnDate) {
    if (picked < depart) return { depart: picked, returnDate: depart, complete: true };
    return { depart, returnDate: picked, complete: true };
  }
  return { depart: picked, returnDate: "", complete: false };
}

/** The return date to use after the departure changes: kept if still valid, otherwise a week after the new departure (never before it). */
export function returnAfterDeparture(depart: string, returnDate: string): string {
  if (!returnDate || returnDate >= depart) return returnDate;
  const [y, m, d] = depart.split("-").map(Number);
  if (!y || !m || !d) return depart;
  const week = new Date(y, m - 1, d + 7);
  return `${week.getFullYear()}-${String(week.getMonth() + 1).padStart(2, "0")}-${String(week.getDate()).padStart(2, "0")}`;
}

/** Age in whole years on a reference date (defaults to today in the visitor timezone). */
export function ageInYears(dobIso: string, onIso: string = todayIso()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dobIso) || !/^\d{4}-\d{2}-\d{2}$/.test(onIso)) return null;
  const [y, m, d] = dobIso.split("-").map(Number);
  const [oy, om, od] = onIso.split("-").map(Number);
  if (!y || !m || !d || !oy || !om || !od) return null;
  let age = oy - y;
  if (om < m || (om === m && od < d)) age -= 1;
  return age;
}

export type TravellerBand = "adult" | "child" | "infant";

/** Airline age bands used at checkout (infant under 2, child 2–11, adult 12+). */
export function travellerBand(dobIso: string, onIso: string = todayIso()): TravellerBand | null {
  const age = ageInYears(dobIso, onIso);
  if (age === null || age < 0) return null;
  if (age < 2) return "infant";
  if (age < 12) return "child";
  return "adult";
}

/** Latest DOB (yyyy-MM-dd) that still counts as under `maxAgeYears` on `onIso`. */
export function maxDobForAgeUnder(maxAgeYears: number, onIso: string = todayIso()): string {
  const [y, m, d] = onIso.split("-").map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1);
  dt.setFullYear(dt.getFullYear() - maxAgeYears);
  dt.setDate(dt.getDate() + 1); // birthday that day turns that age — day before is still under
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** Earliest DOB that still counts as at least `minAgeYears` on `onIso`. */
export function minDobForAgeAtLeast(minAgeYears: number, onIso: string = todayIso()): string {
  const [y, m, d] = onIso.split("-").map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1);
  dt.setFullYear(dt.getFullYear() - minAgeYears);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
