import type { DateOption } from "@/data/flight-search";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

/** Builds a DateOption (id/label/hint/short) from a real calendar date. */
export function dateOptionFromDate(date: Date): DateOption {
  const id = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  return {
    id,
    label: `${date.getDate()} ${MONTH_SHORT[date.getMonth()]}, ${date.getFullYear()}`,
    hint: WEEKDAY_LONG[date.getDay()],
    short: WEEKDAY_SHORT[date.getDay()],
  };
}

/** Parses a DateOption's "YYYY-MM-DD" id back into a local Date. */
export function dateFromId(id: string): Date {
  const [year, month, day] = id.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
