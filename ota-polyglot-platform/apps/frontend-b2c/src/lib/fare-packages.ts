import type { Flight } from "@/lib/flight-types";

/**
 * Same flight schedule (ignores baggage / refund / price). Used to find other
 * priced offers for the same itinerary so the visitor can pick a package.
 * Matches core OfferMerger's schedule idea, without the bag suffix — bag
 * differences stay separate packages on purpose.
 */
export function itineraryScheduleKey(flight: Flight): string {
  const legs = flight.returnLeg ? [flight, flight.returnLeg] : [flight];
  return legs
    .map((leg) => {
      if (leg.segments.length > 0) {
        return leg.segments
          .map((s) => `${s.airline.code}${s.flightNumber}@${s.departLocal.slice(0, 16)}`)
          .join(">");
      }
      return `${leg.airline.code}${leg.flightNumber}@${leg.date}T${leg.departTime}`;
    })
    .join("|");
}

/** Other offers from this search that share the selected flight's schedule. Always includes the selected offer. */
export function packageOptionsFor(selected: Flight, fromSearch: Flight[]): Flight[] {
  const key = itineraryScheduleKey(selected);
  const siblings = fromSearch.filter((f) => itineraryScheduleKey(f) === key);
  const byId = new Map<string, Flight>();
  for (const f of siblings) byId.set(f.id, f);
  if (!byId.has(selected.id)) byId.set(selected.id, selected);
  return [...byId.values()].sort((a, b) => a.price - b.price);
}

/** Short label from what we actually know — never invents "Light/Flex" brand names. */
export function packageLabel(flight: Flight): string {
  const bag =
    flight.baggage.checkedKg > 0
      ? `${flight.baggage.checkedKg} kg checked bag`
      : "Checked bag not stated";
  if (flight.refundable === true) return `Flexible · ${bag}`;
  if (flight.refundable === false) return `Saver · ${bag}`;
  return bag;
}

export function packageHighlights(flight: Flight): string[] {
  const lines: string[] = [];
  if (flight.baggage.checkedKg > 0) {
    lines.push(`Up to ${flight.baggage.checkedKg} kg checked baggage included`);
  } else {
    lines.push("Checked baggage not stated for this fare — confirm with the airline before you pay");
  }
  if (flight.baggage.cabinKg > 0) {
    lines.push(`Cabin bag about ${flight.baggage.cabinKg} kg`);
  }
  if (flight.refundable === true) lines.push("Partially refundable (airline rules apply)");
  else if (flight.refundable === false) lines.push("Non-refundable");
  else lines.push("Refund and change rules are set by the airline and are not shown here");
  lines.push(`${flight.cabin.charAt(0).toUpperCase()}${flight.cabin.slice(1)} cabin`);
  return lines;
}
