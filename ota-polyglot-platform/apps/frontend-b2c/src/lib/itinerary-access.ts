import type { BookingView } from "@/lib/booking-types";

const cacheKey = (id: string) => `aerotake-itinerary:${id}`;

/** Href to the print-ready e-ticket. Claim token rides in the fragment (same as manage-booking). */
export function itineraryHref(bookingId: string, claimToken?: string | null): string {
  const path = `/booking/itinerary/${bookingId}`;
  return claimToken ? `${path}#claim=${encodeURIComponent(claimToken)}` : path;
}

/** Cache a booking already proven in this tab (e.g. manage-booking lookup) so the itinerary page can open without re-proving. */
export function cacheItineraryBooking(booking: BookingView): void {
  try {
    sessionStorage.setItem(cacheKey(booking.id), JSON.stringify(booking));
  } catch {
    /* private mode / quota — page can still load via session or claim */
  }
}

export function readCachedItineraryBooking(bookingId: string): BookingView | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(bookingId));
    if (!raw) return null;
    return JSON.parse(raw) as BookingView;
  } catch {
    return null;
  }
}

export function claimTokenFromHash(): string | null {
  if (typeof window === "undefined") return null;
  const m = /(?:^|[#&])claim=([^&]+)/.exec(window.location.hash);
  return m ? decodeURIComponent(m[1]!) : null;
}
