/** Local take-off / landing windows. Empty selection means that clock is not filtered. */
export const TIME_WINDOWS = [
  { id: "0006", label: "12 AM–06 AM", icon: "moon" },
  { id: "0612", label: "06 AM–12 PM", icon: "sun" },
  { id: "1218", label: "12 PM–06 PM", icon: "sun" },
  { id: "1824", label: "06 PM–12 AM", icon: "moon" },
] as const;

export type TimeWindowId = (typeof TIME_WINDOWS)[number]["id"];

export type SchedulePick = {
  outboundDepart: Set<TimeWindowId>;
  outboundArrive: Set<TimeWindowId>;
  returnDepart: Set<TimeWindowId>;
  returnArrive: Set<TimeWindowId>;
};

export function emptySchedule(): SchedulePick {
  return {
    outboundDepart: new Set(),
    outboundArrive: new Set(),
    returnDepart: new Set(),
    returnArrive: new Set(),
  };
}

/** `hhmm` is a local wall-clock "HH:mm". */
export function windowForTime(hhmm: string): TimeWindowId {
  const hour = Number(hhmm.slice(0, 2));
  if (!Number.isFinite(hour) || hour < 6) return "0006";
  if (hour < 12) return "0612";
  if (hour < 18) return "1218";
  return "1824";
}

export function matchesWindows(hhmm: string, selected: Set<TimeWindowId>): boolean {
  if (selected.size === 0) return true;
  return selected.has(windowForTime(hhmm));
}
