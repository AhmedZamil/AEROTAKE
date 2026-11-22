import data from "./flight-search.json";
import { addDays, dateFromId, dateOptionFromDate, startOfToday } from "@/lib/date-options";

export type AirportOption = {
  code: string;
  city: string;
  airport: string;
};

export type AirlineOption = {
  code: string;
  name: string;
  shortName?: string;
};

export type DateOption = {
  id: string;
  label: string;
  hint: string;
  short: string;
};

export type TravelerOption = {
  id: string;
  label: string;
  hint: string;
  count: number;
  cabin: "economy" | "business";
};

export type DummyFlight = {
  id: string;
  from: string;
  to: string;
  date: string;
  airlineCode: string;
  code: string;
  aircraft: string;
  departTime: string;
  arriveTime: string;
  duration: string;
  price: number;
  stops: number;
  refundable: boolean;
  seatsLeft?: number;
  action: "view" | "book";
};

export const airports = data.airports as AirportOption[];
export const airlines = data.airlines as AirlineOption[];
export const searchDates = data.dates as DateOption[];
export const travelerOptions = data.travelers as TravelerOption[];

// The JSON's flight dates are a fixed historical range (Aug 2026) that only
// ever lined up with real searches because the old date picker was limited
// to that same tiny static range. Now that the search panel's date picker
// is a real calendar (any date, any year), a raw string-equality match in
// searchFlights() below would return zero results for virtually every real
// search. Re-anchor the dummy dataset's relative day spacing onto "today"
// at load time instead, so the demo data always covers whatever the
// nearest few days happen to be.
const rawDummyFlights = data.flights as DummyFlight[];
const dummyDateOffsets = new Map(
  Array.from(new Set(rawDummyFlights.map((flight) => flight.date)))
    .sort()
    .map((id, index) => [id, index]),
);
export const dummyFlights: DummyFlight[] = rawDummyFlights.map((flight) => ({
  ...flight,
  date: dateOptionFromDate(addDays(startOfToday(), dummyDateOffsets.get(flight.date) ?? 0)).id,
}));

export function airportLabel(airport: AirportOption) {
  return `${airport.city} (${airport.code})`;
}

export function findAirport(code: string) {
  return airports.find((airport) => airport.code === code);
}

export function findAirline(code: string) {
  return airlines.find((airline) => airline.code === code);
}

export function findDate(id: string) {
  const known = searchDates.find((date) => date.id === id);
  if (known) return known;
  // Most ids passed in now come from the real calendar picker (or the
  // re-anchored dummy flights above) and were never in searchDates to begin
  // with — derive the DateOption straight from the id instead of silently
  // returning an unrelated fallback date.
  return dateOptionFromDate(dateFromId(id));
}

export function findTraveler(id: string) {
  return travelerOptions.find((option) => option.id === id) ?? travelerOptions[0];
}

const gdsMonths: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

// GDS itinerary lines carry a day+month but no year (e.g. "26SEP"). Resolve
// it to the next real occurrence of that day/month from today, the way GDS
// tooling conventionally interprets a yearless date — rather than the old
// behavior of only matching within a fixed Aug 2026 static list (any other
// month/day silently fell back to a wrong default date).
function resolveGdsDate(day: number, monthIndex: number): DateOption {
  const today = startOfToday();
  let candidate = new Date(today.getFullYear(), monthIndex, day);
  if (candidate < today) {
    candidate = new Date(today.getFullYear() + 1, monthIndex, day);
  }
  return dateOptionFromDate(candidate);
}

export type ParsedGdsLeg = {
  from: AirportOption;
  to: AirportOption;
  date: DateOption;
};

export function parseGdsItinerary(text: string): ParsedGdsLeg[] {
  const knownCodes = airports.map((airport) => airport.code);
  const gluedPairs = knownCodes.flatMap((fromCode) =>
    knownCodes
      .filter((toCode) => toCode !== fromCode)
      .map((toCode) => `${fromCode}${toCode}`),
  );
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const legs: ParsedGdsLeg[] = [];

  for (const line of lines) {
    const upper = line.toUpperCase();
    let from: AirportOption | undefined;
    let to: AirportOption | undefined;

    const spaced = upper.match(/\b([A-Z]{3})\s*[-/]\s*([A-Z]{3})\b/);
    if (spaced) {
      from = findAirport(spaced[1]);
      to = findAirport(spaced[2]);
    }

    if (!from || !to) {
      const glued = gluedPairs.find((pair) => upper.includes(pair));
      if (glued) {
        from = findAirport(glued.slice(0, 3));
        to = findAirport(glued.slice(3));
      }
    }

    if (!from || !to) {
      const ordered: string[] = [];
      let cursor = 0;
      while (cursor < upper.length) {
        let next: { code: string; at: number } | null = null;
        for (const code of knownCodes) {
          const at = upper.indexOf(code, cursor);
          if (at !== -1 && (next === null || at < next.at)) {
            next = { code, at };
          }
        }
        if (!next) {
          break;
        }
        ordered.push(next.code);
        cursor = next.at + 3;
      }
      if (ordered.length >= 2) {
        from = findAirport(ordered[0]);
        to = findAirport(ordered[1]);
      }
    }

    const dateMatch = upper.match(
      /\b(\d{1,2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/,
    );
    let date = dateOptionFromDate(addDays(startOfToday(), 1));
    if (dateMatch) {
      date = resolveGdsDate(Number(dateMatch[1]), gdsMonths[dateMatch[2]]);
    }

    if (from && to && from.code !== to.code) {
      legs.push({ from, to, date });
    }
  }

  if (!legs.length) {
    return [
      { from: airports[0], to: airports[1], date: dateOptionFromDate(addDays(startOfToday(), 1)) },
    ];
  }

  return legs;
}

export function searchFlights({
  fromCode,
  toCode,
  date,
  airlineCode,
}: {
  fromCode: string;
  toCode: string;
  date: string;
  airlineCode?: string;
}) {
  return dummyFlights.filter((flight) => {
    const routeMatch = flight.from === fromCode && flight.to === toCode && flight.date === date;
    if (!routeMatch) {
      return false;
    }
    if (!airlineCode || airlineCode === "ALL") {
      return true;
    }
    return flight.airlineCode === airlineCode;
  });
}

export function fareTiersFor(price: number) {
  return [
    { id: "saver", name: "Economy saver", price },
    { id: "value", name: "Economy value", price: price + 500 },
    { id: "flex", name: "Economy flex", price: Math.round(price * 1.44375) },
  ];
}

export function pricedFlight(flight: DummyFlight, fareType: string, cabin: string) {
  let price = flight.price;
  if (fareType === "student") {
    price = Math.round(price * 0.9);
  }
  if (cabin === "business") {
    price = Math.round(price * 1.85);
  }
  return { ...flight, price };
}
