/** The flights a multi-city search picked, one offer per leg. Written when the last leg is chosen. */

export type MultiPick = {
  from: string;
  to: string;
  date: string;
  offerId: string | null;
  price: number | null;
  airline: string | null;
};

const KEY = "aerotake-multi-picks";

export function readMultiPicks(): MultiPick[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MultiPick[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p) => p && typeof p.from === "string" && typeof p.to === "string");
  } catch {
    return [];
  }
}

export function writeMultiPicks(picks: MultiPick[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(picks));
    window.dispatchEvent(new Event(KEY));
  } catch {
    /* private mode */
  }
}

/** Offer ids and the total the customer was shown, when every leg has both. */
export function multiTripOffers(picks: MultiPick[]): { offerIds: string[]; total: number } | null {
  if (picks.length < 2) return null;
  if (picks.some((p) => !p.offerId || p.price == null)) return null;
  return {
    offerIds: picks.map((p) => p.offerId as string),
    total: picks.reduce((sum, p) => sum + (p.price ?? 0), 0),
  };
}
