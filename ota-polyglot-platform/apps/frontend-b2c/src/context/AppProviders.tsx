"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { formatMoney } from "@/lib/currency";
import type { BookingView } from "@/lib/booking-types";
import type { CabinClass, Flight } from "@/lib/flight-types";

export type TripType = "oneway" | "round" | "multi";

export type PassengerCounts = {
  adults: number;
  children: number;
  infants: number;
};

export type SearchParamsState = {
  from: string;
  to: string;
  depart: string;
  returnDate: string;
  trip: TripType;
  cabin: CabinClass;
  passengers: PassengerCounts;
};

export type PassengerForm = {
  title: string;
  firstName: string;
  lastName: string;
  gender: string;
  dob: string;
  nationality: string;
  passportNumber: string;
  passportExpiry: string;
  frequentFlyer: string;
  postCode: string;
};

export type AuthUser = {
  name: string;
  email: string;
  /** false for a password account whose address has not been confirmed yet. */
  emailVerified: boolean;
} | null;

type AppState = {
  /** The currency core priced the last search in; every amount on the site is shown in it, unconverted. */
  priceCurrency: string;
  setPriceCurrency: (c: string) => void;
  format: (amount: number) => string;
  selectedOutbound: Flight | null;
  selectedReturn: Flight | null;
  setSelectedOutbound: (f: Flight | null) => void;
  setSelectedReturn: (f: Flight | null) => void;
  /** Same-schedule offers from the last search (for the fare package step). */
  fareOptions: Flight[];
  setFareOptions: (options: Flight[]) => void;
  search: SearchParamsState;
  setSearch: (s: Partial<SearchParamsState>) => void;
  passengers: PassengerForm[];
  setPassengers: (p: PassengerForm[]) => void;
  contactEmail: string;
  contactPhone: string;
  setContact: (email: string, phone: string) => void;
  /** The booking core created (reserved, awaiting payment) — what the confirmation page shows. */
  reservation: BookingView | null;
  setReservation: (b: BookingView | null) => void;
  user: AuthUser;
  /** false until the first "who is signed in" answer arrives, so pages don't flash a signed-out state. */
  userLoaded: boolean;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
};

const defaultSearch: SearchParamsState = {
  from: "DAC",
  to: "DXB",
  depart: "",
  returnDate: "",
  trip: "oneway", // Hajee Air fares are one-way only, so a one-way search is the one that shows every airline
  cabin: "economy",
  passengers: { adults: 1, children: 0, infants: 0 },
};

const AppContext = createContext<AppState | null>(null);
const STORAGE_KEY = "aerotake-booking-v1";

export function AppProviders({ children }: { children: ReactNode }) {
  const [priceCurrency, setPriceCurrency] = useState<string>("USD");
  const [selectedOutbound, setSelectedOutbound] = useState<Flight | null>(null);
  const [selectedReturn, setSelectedReturn] = useState<Flight | null>(null);
  const [fareOptions, setFareOptions] = useState<Flight[]>([]);
  const [search, setSearchState] = useState<SearchParamsState>(defaultSearch);
  const [passengers, setPassengers] = useState<PassengerForm[]>([]);
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [reservation, setReservation] = useState<BookingView | null>(null);
  const [user, setUser] = useState<AuthUser>(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<{
            priceCurrency: string;
            selectedOutbound: Flight | null;
            selectedReturn: Flight | null;
            fareOptions: Flight[];
            search: SearchParamsState;
            passengers: PassengerForm[];
            contactEmail: string;
            contactPhone: string;
            reservation: BookingView | null;
          }>;
          if (parsed.priceCurrency) setPriceCurrency(parsed.priceCurrency);
          if (parsed.selectedOutbound) setSelectedOutbound(parsed.selectedOutbound);
          if (parsed.selectedReturn) setSelectedReturn(parsed.selectedReturn);
          if (parsed.fareOptions) setFareOptions(parsed.fareOptions);
          if (parsed.search) setSearchState(parsed.search);
          if (parsed.passengers) setPassengers(parsed.passengers);
          if (parsed.contactEmail) setContactEmail(parsed.contactEmail);
          if (parsed.contactPhone) setContactPhone(parsed.contactPhone);
          if (parsed.reservation) setReservation(parsed.reservation);
        }
      } catch {
        // ignore corrupt session
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        priceCurrency,
        selectedOutbound,
        selectedReturn,
        fareOptions,
        search,
        passengers,
        contactEmail,
        contactPhone,
        reservation,
      }),
    );
  }, [
    hydrated,
    priceCurrency,
    selectedOutbound,
    selectedReturn,
    fareOptions,
    search,
    passengers,
    contactEmail,
    contactPhone,
    reservation,
  ]);

  // Default trip dates are relative to today (a month out, a week long), filled in the browser once, and refreshed if a stored search is now in the past.
  useEffect(() => {
    if (!hydrated) return;
    const day = (offset: number) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const today = day(0);
    if (!search.depart || search.depart < today) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchState((prev) => ({ ...prev, depart: day(30), returnDate: day(37) }));
    }
  }, [hydrated, search.depart]);

  const setSearch = useCallback((partial: Partial<SearchParamsState>) => {
    setSearchState((prev) => ({ ...prev, ...partial }));
  }, []);

  const setContact = useCallback((email: string, phone: string) => {
    setContactEmail(email);
    setContactPhone(phone);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.ok) {
        const { customer } = (await res.json()) as {
          customer: { email: string | null; emailVerified: boolean; firstName: string | null; lastName: string | null; phone?: string | null } | null;
        };
        if (!customer) {
          setUser(null);
          return;
        }
        const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.email || "Traveller";
        setUser({ name, email: customer.email ?? "", emailVerified: customer.emailVerified });
        if (customer.phone) setContactPhone((current) => current || customer.phone || "");
        if (customer.email) setContactEmail((current) => current || customer.email || "");
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setUserLoaded(true);
    }
  }, []);

  useEffect(() => {
    // Deferred a tick: the answer (and its setState) belongs to the network, not to the effect body.
    const id = window.setTimeout(() => void refreshUser(), 0);
    return () => window.clearTimeout(id);
  }, [refreshUser]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    setUser(null);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      priceCurrency,
      setPriceCurrency,
      format: (amount: number) => formatMoney(amount, priceCurrency),
      selectedOutbound,
      selectedReturn,
      setSelectedOutbound,
      setSelectedReturn,
      fareOptions,
      setFareOptions,
      search,
      setSearch,
      passengers,
      setPassengers,
      contactEmail,
      contactPhone,
      setContact,
      reservation,
      setReservation,
      user,
      userLoaded,
      refreshUser,
      logout,
    }),
    [
      priceCurrency,
      selectedOutbound,
      selectedReturn,
      fareOptions,
      search,
      setSearch,
      passengers,
      contactEmail,
      contactPhone,
      setContact,
      reservation,
      user,
      userLoaded,
      refreshUser,
      logout,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProviders");
  return ctx;
}
