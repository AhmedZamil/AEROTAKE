export type FlightBookingDraft = {
  flightId: string;
  fareTierId: string;
  fareTierName: string;
  pricePerAdult: number;
  adults: number;
  fromCode: string;
  toCode: string;
  fromCity: string;
  toCity: string;
  dateText: string;
  departTime: string;
  arriveTime: string;
  duration: string;
  airlineCode: string;
  airlineName: string;
  cabin: string;
  stops: number;
  flightCode: string;
  aircraft: string;
  bookingClass: string;
  refundable: boolean;
  /** Supplier net from search. Present for a live offer so checkout can revalidate once, just before reserve. */
  netRate?: number;
};

export const FLIGHT_BOOKING_STORAGE_KEY = "aerotake-flight-booking-draft";

export function saveFlightBookingDraft(draft: FlightBookingDraft) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(FLIGHT_BOOKING_STORAGE_KEY, JSON.stringify(draft));
}

export function loadFlightBookingDraft(): FlightBookingDraft | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(FLIGHT_BOOKING_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FlightBookingDraft;
  } catch {
    return null;
  }
}

export function clearFlightBookingDraft() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(FLIGHT_BOOKING_STORAGE_KEY);
}

export function bookingFareBreakdown(pricePerAdult: number, adults: number) {
  const subtotal = pricePerAdult * adults;
  const baseFare = Math.round(subtotal * 0.78);
  const tax = Math.round(subtotal * 0.3);
  const ait = 0;
  const discount = Math.round(subtotal * 0.038);
  const grandTotal = baseFare + tax + ait - discount;
  return { baseFare, tax, ait, discount, grandTotal, subtotal };
}

export type ConfirmedPassenger = {
  title: string;
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  passportNumber: string;
};

export type ConfirmedBooking = {
  bookingId: string;
  pnr: string;
  airlinePnr: string;
  bookingDate: string;
  issueBefore: string;
  // "Booked" for dummy/Intelli-Bestbuy data (unchanged) — a live Sabre
  // booking is reserved but not yet ticketed, so it carries the backend's
  // real status (e.g. "Pending Ticketing") instead. Plain string since this
  // is display-only here; nothing branches on the exact value.
  status: string;
  bookedBy: string;
  agencyName: string;
  agencyReg: string;
  flight: FlightBookingDraft;
  passengers: ConfirmedPassenger[];
  contact: {
    country: string;
    phone: string;
    email: string;
  };
  fare: ReturnType<typeof bookingFareBreakdown>;
};

export const CONFIRMED_BOOKING_STORAGE_KEY = "aerotake-confirmed-booking";

export function saveConfirmedBooking(booking: ConfirmedBooking) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(CONFIRMED_BOOKING_STORAGE_KEY, JSON.stringify(booking));
}

export function loadConfirmedBooking(): ConfirmedBooking | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(CONFIRMED_BOOKING_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ConfirmedBooking;
  } catch {
    return null;
  }
}

export function clearConfirmedBooking() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(CONFIRMED_BOOKING_STORAGE_KEY);
}

export function createBookingReference(prefix = "ATK") {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
}

export function createPnr() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function formatBookingDate(date = new Date()) {
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatIssueBefore(hours = 24, from = new Date()) {
  const next = new Date(from.getTime() + hours * 60 * 60 * 1000);
  return next.toLocaleString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
