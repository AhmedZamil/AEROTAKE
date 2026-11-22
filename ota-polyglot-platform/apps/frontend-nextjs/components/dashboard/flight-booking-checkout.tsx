"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import AirlineMark from "./airline-mark";
import BookingPreviewModal from "./booking-preview-modal";
import { usePartnerProfile } from "./partner-profile";
import PassportNameHint, { type PassportHintField } from "./passport-name-hint";
import PassportScanModal, { type PassportScanResult } from "./passport-scan-modal";
import { alpha3ToAlpha2 } from "@/lib/country-codes";
import { isLiveOfferId } from "@/lib/live-offers";
import { fareTiersFor } from "@/data/flight-search";
import {
  bookingFareBreakdown,
  clearFlightBookingDraft,
  createBookingReference,
  createPnr,
  formatBookingDate,
  formatIssueBefore,
  loadFlightBookingDraft,
  saveConfirmedBooking,
  saveFlightBookingDraft,
  type FlightBookingDraft,
} from "@/data/flight-booking";
import {
  CameraIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronUpIcon,
  ClockIcon,
  LockIcon,
  PassengersIcon,
  PlaneTakeoffIcon,
  SeatIcon,
  UserIcon,
} from "./icons";

type PassengerForm = {
  title: string;
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  passportNumber: string;
  // ISO 3166-1 alpha-2 (e.g. "BD") — what Sabre's PNR-create request wants
  // (SabreProvider.cs). Defaulted below, not required to be blank-checked.
  nationality: string;
  // ISO date (yyyy-mm-dd). Optional for most suppliers; Hajee Air requires it.
  passportExpiry: string;
  wheelchair: string;
  saveToList: boolean;
};

const fieldClass =
  "h-11 w-full rounded-lg border border-aerotake-border bg-white px-3 text-[13px] text-aerotake-navy outline-none placeholder:text-aerotake-muted focus:border-aerotake-coral focus:ring-2 focus:ring-aerotake-coral/15";
const fieldErrorClass = "border-aerotake-coral focus:border-aerotake-coral focus:ring-aerotake-coral/25";

const emptyPassenger = (): PassengerForm => ({
  title: "",
  firstName: "",
  lastName: "",
  gender: "",
  dateOfBirth: "",
  passportNumber: "",
  nationality: "BD",
  passportExpiry: "",
  wheelchair: "no",
  saveToList: false,
});

const NAME_PATTERN = /^[A-Za-z][A-Za-z\s'-]*$/;
const PASSPORT_PATTERN = /^[A-Za-z0-9]{6,9}$/;
const NATIONALITY_PATTERN = /^[A-Za-z]{2}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\d{7,15}$/;

/** One rule per required field; returns a field-key -> message map (empty
 * when everything's valid). Runs for every submission, live or dummy —
 * dummy bookings are fake but there's no reason to let obviously-broken
 * data through either. Field keys match what the Field usages below pass
 * as their `error` prop. */
function validatePassenger(
  passenger: PassengerForm,
  index: number,
  expiryRequired: boolean,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const key = (field: string) => `passenger-${index}-${field}`;

  if (!passenger.title) errors[key("title")] = "Select a title.";
  if (!NAME_PATTERN.test(passenger.firstName.trim())) {
    errors[key("firstName")] = "Enter a valid first name.";
  }
  if (!NAME_PATTERN.test(passenger.lastName.trim())) {
    errors[key("lastName")] = "Enter a valid last name.";
  }
  if (!passenger.gender) errors[key("gender")] = "Select a gender.";

  if (!passenger.dateOfBirth) {
    errors[key("dateOfBirth")] = "Date of birth is required.";
  } else {
    const dob = new Date(passenger.dateOfBirth);
    const now = new Date();
    if (Number.isNaN(dob.getTime())) {
      errors[key("dateOfBirth")] = "Enter a valid date.";
    } else if (dob > now) {
      errors[key("dateOfBirth")] = "Date of birth can't be in the future.";
    } else if (now.getFullYear() - dob.getFullYear() > 120) {
      errors[key("dateOfBirth")] = "Enter a valid date of birth.";
    }
  }

  if (!PASSPORT_PATTERN.test(passenger.passportNumber.trim())) {
    errors[key("passportNumber")] = "Passport number should be 6-9 letters/numbers.";
  }
  if (!passenger.passportExpiry) {
    if (expiryRequired) errors[key("passportExpiry")] = "Passport expiry date is required for this fare.";
  } else {
    const expiry = new Date(passenger.passportExpiry);
    if (Number.isNaN(expiry.getTime())) {
      errors[key("passportExpiry")] = "Enter a valid date.";
    } else if (expiry <= new Date()) {
      errors[key("passportExpiry")] = "This passport has expired.";
    }
  }
  if (!NATIONALITY_PATTERN.test(passenger.nationality.trim())) {
    errors[key("nationality")] = "Use a 2-letter country code (e.g. BD).";
  }

  return errors;
}

function validateContact(email: string, phone: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!EMAIL_PATTERN.test(email.trim())) errors["contact-email"] = "Enter a valid email address.";
  if (!PHONE_PATTERN.test(phone.trim())) errors["contact-phone"] = "Enter a valid phone number (digits only).";
  return errors;
}

/** ProcessB2BBooking only ever reserves (never tickets), so a successful
 * live booking is genuinely "BOOKING_STATUS_PENDING" today, not "Booked" —
 * shown as-is (mapped to friendly text) rather than overstating it. */
function bookingStatusLabel(status: unknown): string {
  switch (status) {
    case "BOOKING_STATUS_PENDING":
      return "Pending Ticketing";
    case "BOOKING_STATUS_CONFIRMED":
      return "Booked";
    case "BOOKING_STATUS_REJECTED_CREDIT":
      return "Rejected — Credit Limit";
    case "BOOKING_STATUS_REJECTED_EXPIRED":
      return "Rejected — Offer Expired";
    case "BOOKING_STATUS_FAILED":
      return "Failed";
    default:
      return typeof status === "string" && status ? status : "Booked";
  }
}

export default function FlightBookingCheckout() {
  const router = useRouter();
  const { profile } = usePartnerProfile();
  const [draft, setDraft] = useState<FlightBookingDraft | null>(null);
  const [flightOpen, setFlightOpen] = useState(true);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [openPassenger, setOpenPassenger] = useState(0);
  const [passengers, setPassengers] = useState<PassengerForm[]>([]);
  const [country, setCountry] = useState("Bangladesh");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [usePassengerContact, setUsePassengerContact] = useState(false);
  const [sendTicketEmail, setSendTicketEmail] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewConfirmed, setPreviewConfirmed] = useState(false);
  const [scanPassengerIndex, setScanPassengerIndex] = useState<number | null>(null);
  const scanPassengerIndexRef = useRef<number | null>(null);
  const passengersReadyRef = useRef(false);
  // E4c: live (Sabre) offers reserve a real PNR via ProcessB2BBooking —
  // dummy/Intelli-Bestbuy offers keep the existing local-only confirmation.
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  // E4d: per-field validation errors, keyed like "passenger-0-firstName" /
  // "contact-email" — see validatePassenger/validateContact above.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // One idempotency key per page load, reused across retries of the same
  // submission so a flaky network retry can't create a duplicate booking.
  const idempotencyKeyRef = useRef<string | null>(null);
  // Set after the agent has seen a changed price, so the next confirm reserves without a second airline check.
  const priceAcceptedRef = useRef(false);
  const [secondsLeft, setSecondsLeft] = useState(29 * 60 + 48);
  const [nameHint, setNameHint] = useState<{
    passengerIndex: number;
    field: PassportHintField;
  } | null>(null);
  const nameHintTimer = useRef<number | null>(null);

  function showNameHint(passengerIndex: number, field: PassportHintField) {
    if (nameHintTimer.current) {
      window.clearTimeout(nameHintTimer.current);
      nameHintTimer.current = null;
    }
    setNameHint({ passengerIndex, field });
  }

  function hideNameHint(delay = 120) {
    if (nameHintTimer.current) {
      window.clearTimeout(nameHintTimer.current);
    }
    nameHintTimer.current = window.setTimeout(() => {
      setNameHint(null);
      nameHintTimer.current = null;
    }, delay);
  }

  useEffect(() => {
    const saved = loadFlightBookingDraft();
    if (!saved) {
      router.replace("/dashboard/search");
      return;
    }
    setDraft(saved);
    if (!passengersReadyRef.current) {
      setPassengers(Array.from({ length: saved.adults }, () => emptyPassenger()));
      passengersReadyRef.current = true;
    }
  }, [router]);

  function openPassportScan(index: number) {
    scanPassengerIndexRef.current = index;
    setScanPassengerIndex(index);
    setOpenPassenger(index);
  }

  const booking = draft
    ? {
        ...draft,
        flightCode: draft.flightCode ?? draft.airlineCode,
        aircraft: draft.aircraft ?? "ATR 72",
        bookingClass: draft.bookingClass ?? "N",
        refundable: draft.refundable ?? true,
      }
    : null;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSecondsLeft((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (nameHintTimer.current) {
        window.clearTimeout(nameHintTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!previewOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [previewOpen]);

  const fare = useMemo(
    () => (booking ? bookingFareBreakdown(booking.pricePerAdult, booking.adults) : null),
    [booking],
  );

  if (!booking || !fare) {
    return (
      <div className="mx-auto flex min-h-[50vh] w-full max-w-[1200px] items-center justify-center px-4">
        <p className="text-[14px] text-aerotake-muted">Loading booking...</p>
      </div>
    );
  }

  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const seconds = String(secondsLeft % 60).padStart(2, "0");
  const cabinLabel =
    booking.cabin.charAt(0).toUpperCase() + booking.cabin.slice(1);
  const policyRows = [
    { frame: "0 hours to 6 hours", fee: "As per Airline Policy" },
    { frame: "6 hours to 24 hours", fee: "As per Airline Policy" },
    { frame: "24 hours or before", fee: "As per Airline Policy" },
  ];

  function setPassenger(index: number, patch: Partial<PassengerForm>) {
    setPassengers((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function applyPassportScan(result: PassportScanResult) {
    const index = scanPassengerIndexRef.current;
    if (index === null || index < 0) return;

    // Scanned nationality is alpha-3 (MRZ) — only overwrite the field when
    // it converts cleanly to the alpha-2 Sabre wants; otherwise leave
    // whatever was already there (the "BD" default or an agent's own
    // entry) rather than write a wrong/truncated code. See lib/country-codes.ts.
    const nationality = alpha3ToAlpha2(result.nationality);

    setPassengers((current) => {
      if (!current[index]) return current;
      return current.map((item, i) =>
        i === index
          ? {
              ...item,
              title: result.title,
              firstName: result.firstName,
              lastName: result.lastName,
              gender: result.gender,
              dateOfBirth: result.dateOfBirth,
              passportNumber: result.passportNumber,
              nationality: nationality ?? item.nationality,
              passportExpiry: result.expiryDate ?? item.passportExpiry,
            }
          : item,
      );
    });
    setOpenPassenger(index);
  }

  function closePassportScan() {
    setScanPassengerIndex(null);
    scanPassengerIndexRef.current = null;
  }

  // E4d: validated before the preview even opens (not just before the final
  // submit) — showing an agent a "Preview" of a booking with a blank name
  // is worse than not opening it, so this gates both the outer "Confirm
  // Booking" button (openPreview) and handleConfirm itself as a safety net.
  function runFieldValidation(): boolean {
    const errors = passengers.reduce(
      (all, passenger, index) => ({ ...all, ...validatePassenger(passenger, index, booking?.flightId.startsWith("HAJEE-") ?? false) }),
      validateContact(email, phone),
    );
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const firstPassengerIndex = passengers.findIndex((_, index) =>
        Object.keys(errors).some((key) => key.startsWith(`passenger-${index}-`)),
      );
      if (firstPassengerIndex >= 0) setOpenPassenger(firstPassengerIndex);
      requestAnimationFrame(() => {
        const firstKey = Object.keys(errors)[0];
        document.getElementById(firstKey)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return false;
    }
    setFieldErrors({});
    return true;
  }

  async function handleConfirm() {
    if (!booking || !fare) return;
    if (!runFieldValidation()) return;

    const passengerSummaries = passengers.map(
      ({ title, firstName, lastName, gender, dateOfBirth, passportNumber }) => ({
        title,
        firstName,
        lastName,
        gender,
        dateOfBirth,
        passportNumber,
      }),
    );

    // Dummy/Intelli-Bestbuy offers: unchanged from before E4c — a locally
    // fabricated PNR, no network call, no revalidate-style gating needed
    // since there's no real supplier behind them.
    if (!isLiveOfferId(booking.flightId)) {
      const pnr = createPnr();
      saveConfirmedBooking({
        bookingId: createBookingReference(),
        pnr,
        airlinePnr: pnr,
        bookingDate: formatBookingDate(),
        issueBefore: formatIssueBefore(),
        status: "Booked",
        bookedBy: profile.agencyName,
        agencyName: profile.agencyName,
        agencyReg: profile.tradeLicense,
        flight: booking,
        passengers: passengerSummaries,
        contact: { country, phone, email },
        fare,
      });
      clearFlightBookingDraft();
      setPreviewOpen(false);
      router.push("/dashboard/booking/confirmation");
      return;
    }

    // Live Sabre offer: actually reserve the PNR via ProcessB2BBooking.
    // (Field-level validation already ran above, for both branches.)
    setBookingError(null);

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }

    setSubmitting(true);
    try {
      // C1-6: one airline revalidate, here, immediately before the hold. The results list does not call it.
      if (typeof booking.netRate === "number" && !priceAcceptedRef.current) {
        const check = await fetch("/api/revalidate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offerId: booking.flightId, expectedNetRate: booking.netRate }),
        });
        if (!check.ok) {
          setBookingError("Couldn't confirm this fare — check your connection and try again.");
          return;
        }
        const verdict = (await check.json()) as {
          matches: boolean;
          currentNetRate: number;
          currentSellPrice: number;
          failureReason: string;
          replacementOfferId?: string;
        };
        if (!verdict.matches) {
          if (verdict.failureReason || !(verdict.currentSellPrice > 0)) {
            setBookingError(verdict.failureReason || "This fare is no longer available. Please search again.");
            return;
          }
          const nextPrice =
            fareTiersFor(verdict.currentSellPrice).find((item) => item.id === booking.fareTierId)?.price ??
            verdict.currentSellPrice;
          const next: FlightBookingDraft = {
            ...booking,
            flightId: verdict.replacementOfferId || booking.flightId,
            pricePerAdult: nextPrice,
            netRate: verdict.currentNetRate,
          };
          saveFlightBookingDraft(next);
          setDraft(next);
          priceAcceptedRef.current = true;
          setBookingError("The price has changed. Review the new total, then confirm again to reserve.");
          return;
        }
      }

      const res = await fetch("/api/booking/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerId: booking.flightId,
          travelers: passengers.map((p) => ({
            firstName: p.firstName,
            lastName: p.lastName,
            dateOfBirth: p.dateOfBirth,
            documentNumber: p.passportNumber,
            documentType: "PASSPORT",
            nationality: p.nationality,
            title: p.title,
            gender: p.gender,
            passportExpiryDate: p.passportExpiry,
            wheelchair: p.wheelchair === "yes",
          })),
          contactEmail: email,
          contactPhone: phone,
          idempotencyKey: idempotencyKeyRef.current,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setBookingError(body?.message || "Couldn't reserve this booking. Please try again.");
        return;
      }

      const confirmation = await res.json();
      // The backend re-prices from the supplier net rate at reservation
      // time — recompute the same base/tax/ait/discount breakdown the
      // dummy path uses, but from the REAL final price, so every line on
      // the confirmation page sums to what was actually reserved instead
      // of a stale pre-reservation estimate.
      const finalPrice = confirmation.price?.finalPrice;
      const liveFare =
        typeof finalPrice === "number"
          ? bookingFareBreakdown(finalPrice / Math.max(1, booking.adults), booking.adults)
          : fare;

      saveConfirmedBooking({
        bookingId: confirmation.bookingId,
        pnr: confirmation.pnr,
        airlinePnr: confirmation.pnr,
        bookingDate: formatBookingDate(),
        issueBefore: confirmation.createdAt
          ? formatIssueBefore(24, new Date(confirmation.createdAt))
          : formatIssueBefore(),
        status: bookingStatusLabel(confirmation.status),
        bookedBy: profile.agencyName,
        agencyName: profile.agencyName,
        agencyReg: profile.tradeLicense,
        flight: booking,
        passengers: passengerSummaries,
        contact: { country, phone, email },
        fare: liveFare,
      });
      clearFlightBookingDraft();
      setPreviewOpen(false);
      router.push("/dashboard/booking/confirmation");
    } catch {
      setBookingError("Couldn't reach the booking system — check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function openPreview() {
    if (!runFieldValidation()) return;
    setPreviewConfirmed(false);
    setPreviewOpen(true);
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-4 pb-28 sm:px-6 sm:py-5">
      <Link
        href="/dashboard/search"
        className="inline-flex items-center gap-2 rounded-full bg-aerotake-navy px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1e293b]"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Back to search
      </Link>

      <section className="mt-4 overflow-hidden rounded-xl border border-aerotake-border bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setFlightOpen((open) => !open)}
          className="flex w-full items-center justify-between border-b border-aerotake-border px-4 py-3.5 text-left"
        >
          <p className="text-[15px] font-bold text-aerotake-navy">
            {booking.fromCode} → {booking.toCode}
            <span className="ml-3 font-semibold">{booking.dateText}</span>
          </p>
          {flightOpen ? (
            <ChevronUpIcon className="h-4 w-4 shrink-0 text-aerotake-muted" />
          ) : (
            <ChevronDownIcon className="h-4 w-4 shrink-0 text-aerotake-muted" />
          )}
        </button>

        {flightOpen ? (
          <div className="px-4 py-4">
            <p className="text-[13px] text-aerotake-muted">
              Flight : {booking.fromCode} → {booking.toCode} {booking.dateText}
            </p>

            <div className="mt-4 grid grid-cols-1 items-center gap-4 lg:grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto]">
              <div className="flex items-center gap-3">
                <AirlineMark code={booking.airlineCode} size="lg" />
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-aerotake-navy">
                    {booking.airlineName}
                  </p>
                  <p className="mt-0.5 text-[11px] text-aerotake-muted">
                    {booking.flightCode} | {booking.aircraft} | {cabinLabel} (
                    {booking.bookingClass})
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div>
                  <p className="text-[13px] font-bold text-aerotake-navy">{booking.fromCode}</p>
                  <p className="mt-0.5 text-[22px] leading-none font-bold text-aerotake-navy">
                    {booking.departTime}
                  </p>
                  <p className="mt-1 text-[11px] text-aerotake-muted">{booking.dateText}</p>
                </div>

                <div className="min-w-[120px] px-1 text-center">
                  <div className="relative flex items-center">
                    <span className="h-px flex-1 bg-aerotake-coral/70" />
                    <span className="mx-1 flex h-7 w-7 items-center justify-center text-[#7c3aed]">
                      <PlaneTakeoffIcon className="h-4 w-4 rotate-90" />
                    </span>
                    <span className="h-px flex-1 bg-aerotake-coral/70" />
                  </div>
                  <p className="mt-1.5 text-[12px] font-medium text-aerotake-muted">
                    {booking.duration}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-[13px] font-bold text-aerotake-navy">{booking.toCode}</p>
                  <p className="mt-0.5 text-[22px] leading-none font-bold text-aerotake-navy">
                    {booking.arriveTime}
                  </p>
                  <p className="mt-1 text-[11px] text-aerotake-muted">{booking.dateText}</p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-1.5 text-aerotake-muted lg:flex-col lg:justify-center">
                <SeatIcon className="h-4 w-4" />
                <span className="text-[13px] font-semibold text-aerotake-navy">
                  {booking.bookingClass}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        <div className="border-t border-aerotake-border">
          <button
            type="button"
            onClick={() => setPolicyOpen((open) => !open)}
            className="flex w-full items-center justify-between px-4 py-3.5 text-left"
          >
            <span className="text-[14px] font-semibold text-aerotake-navy">
              Cancellation &amp; Date Change
            </span>
            {policyOpen ? (
              <ChevronUpIcon className="h-4 w-4 text-aerotake-muted" />
            ) : (
              <ChevronDownIcon className="h-4 w-4 text-aerotake-muted" />
            )}
          </button>

          {policyOpen ? (
            <div className="grid gap-4 border-t border-aerotake-border px-4 py-4 lg:grid-cols-2">
              {(["Cancellation", "Date Change"] as const).map((title) => (
                <div key={title} className="overflow-hidden rounded-lg border border-aerotake-border">
                  <div className="border-b border-aerotake-border bg-[#f8fafc] px-3 py-2.5">
                    <p className="text-[13px] font-semibold text-aerotake-navy">{title}</p>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] border-b border-aerotake-border bg-[#f8fafc] px-3 py-2 text-[11px] font-semibold text-aerotake-muted">
                    <span>Time Frame</span>
                    <span className="text-right">Airline Fee + AeroTake Fee</span>
                  </div>
                  {policyRows.map((row) => (
                    <div
                      key={`${title}-${row.frame}`}
                      className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] border-b border-aerotake-border px-3 py-2.5 text-[12px] last:border-b-0"
                    >
                      <span className="text-aerotake-navy">{row.frame}</span>
                      <span className="text-right text-aerotake-muted">{row.fee}</span>
                    </div>
                  ))}
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] px-3 py-2.5 text-[12px]">
                    <span className="font-medium text-aerotake-navy">After flight departure</span>
                    <span
                      className={`text-right font-semibold ${
                        booking.refundable ? "text-[#0f766e]" : "text-aerotake-muted"
                      }`}
                    >
                      {booking.refundable ? "Refundable" : "Non-refundable"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {passengers.map((passenger, index) => {
            const expanded = openPassenger === index;
            return (
              <section
                key={index}
                className={`rounded-xl border border-aerotake-border bg-white shadow-sm ${
                  expanded ? "overflow-visible" : "overflow-hidden"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpenPassenger(expanded ? -1 : index)}
                  className="flex w-full items-center gap-3 px-4 py-4 text-left"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#fff1f0] text-aerotake-coral">
                    <UserIcon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-aerotake-navy">
                      Passenger Details (Adult)
                    </p>
                    <p className="text-[12px] text-aerotake-muted">
                      Please specify the details as per the passport
                    </p>
                  </span>
                  {expanded ? (
                    <ChevronUpIcon className="h-4 w-4 shrink-0 text-aerotake-muted" />
                  ) : (
                    <ChevronDownIcon className="h-4 w-4 shrink-0 text-aerotake-muted" />
                  )}
                </button>

                {expanded ? (
                  <div className="space-y-4 border-t border-aerotake-border px-4 py-4">
                    <button
                      type="button"
                      onClick={() => openPassportScan(index)}
                      className="flex w-full items-center gap-3 rounded-xl border border-dashed border-aerotake-coral/50 bg-[#fff8f6] px-4 py-3 text-left hover:bg-[#fff1f0]"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-aerotake-coral text-white">
                        <CameraIcon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-aerotake-navy">
                          Scan to add
                        </span>
                        <span className="block text-[12px] text-aerotake-muted">
                          Scan passport MRZ to auto-fill passenger details
                        </span>
                      </span>
                    </button>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Select Passenger">
                        <select
                          className={fieldClass}
                          value=""
                          onChange={() => undefined}
                        >
                          <option value="">Select...</option>
                          <option value="saved">Saved passenger</option>
                        </select>
                      </Field>
                      <Field label="Title" required error={fieldErrors[`passenger-${index}-title`]}>
                        <select
                          id={`passenger-${index}-title`}
                          className={`${fieldClass} ${fieldErrors[`passenger-${index}-title`] ? fieldErrorClass : ""}`}
                          value={passenger.title}
                          onChange={(event) =>
                            setPassenger(index, { title: event.target.value })
                          }
                        >
                          <option value="">Select</option>
                          <option value="mr">Mr</option>
                          <option value="mrs">Mrs</option>
                          <option value="ms">Ms</option>
                        </select>
                      </Field>
                    </div>
                    <div className="relative">
                      {nameHint?.passengerIndex === index ? (
                        <div className="absolute bottom-full left-0 z-30 mb-2 w-fit max-w-full">
                          <PassportNameHint field={nameHint.field} />
                        </div>
                      ) : null}
                      <Field label="First Name (Given Name)" required error={fieldErrors[`passenger-${index}-firstName`]}>
                        <input
                          id={`passenger-${index}-firstName`}
                          className={`${fieldClass} ${fieldErrors[`passenger-${index}-firstName`] ? fieldErrorClass : ""}`}
                          value={passenger.firstName}
                          onFocus={() => showNameHint(index, "firstName")}
                          onBlur={() => hideNameHint()}
                          onChange={(event) =>
                            setPassenger(index, { firstName: event.target.value })
                          }
                        />
                      </Field>
                      <div className="mt-3">
                        <Field label="Last Name (Surname)" required error={fieldErrors[`passenger-${index}-lastName`]}>
                          <input
                            id={`passenger-${index}-lastName`}
                            className={`${fieldClass} ${fieldErrors[`passenger-${index}-lastName`] ? fieldErrorClass : ""}`}
                            value={passenger.lastName}
                            onFocus={() => showNameHint(index, "lastName")}
                            onBlur={() => hideNameHint()}
                            onChange={(event) =>
                              setPassenger(index, { lastName: event.target.value })
                            }
                          />
                        </Field>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Field label="Gender" required error={fieldErrors[`passenger-${index}-gender`]}>
                        <select
                          id={`passenger-${index}-gender`}
                          className={`${fieldClass} ${fieldErrors[`passenger-${index}-gender`] ? fieldErrorClass : ""}`}
                          value={passenger.gender}
                          onChange={(event) =>
                            setPassenger(index, { gender: event.target.value })
                          }
                        >
                          <option value="">Select</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                        </select>
                      </Field>
                      <Field label="Date of Birth" required error={fieldErrors[`passenger-${index}-dateOfBirth`]}>
                        <input
                          id={`passenger-${index}-dateOfBirth`}
                          type="date"
                          className={`${fieldClass} ${fieldErrors[`passenger-${index}-dateOfBirth`] ? fieldErrorClass : ""}`}
                          value={passenger.dateOfBirth}
                          onChange={(event) =>
                            setPassenger(index, { dateOfBirth: event.target.value })
                          }
                        />
                      </Field>
                      <Field label="Passport Number" required error={fieldErrors[`passenger-${index}-passportNumber`]}>
                        <input
                          id={`passenger-${index}-passportNumber`}
                          className={`${fieldClass} ${fieldErrors[`passenger-${index}-passportNumber`] ? fieldErrorClass : ""}`}
                          value={passenger.passportNumber}
                          placeholder="Enter passport number"
                          onChange={(event) =>
                            setPassenger(index, {
                              passportNumber: event.target.value.toUpperCase(),
                            })
                          }
                        />
                      </Field>
                      <Field label="Nationality" required error={fieldErrors[`passenger-${index}-nationality`]}>
                        <input
                          id={`passenger-${index}-nationality`}
                          className={`${fieldClass} ${fieldErrors[`passenger-${index}-nationality`] ? fieldErrorClass : ""}`}
                          value={passenger.nationality}
                          maxLength={2}
                          placeholder="e.g. BD"
                          onChange={(event) =>
                            setPassenger(index, {
                              nationality: event.target.value.toUpperCase(),
                            })
                          }
                        />
                      </Field>
                      <Field
                        label="Passport Expiry Date"
                        required={booking.flightId.startsWith("HAJEE-")}
                        error={fieldErrors[`passenger-${index}-passportExpiry`]}
                      >
                        <input
                          id={`passenger-${index}-passportExpiry`}
                          type="date"
                          className={`${fieldClass} ${fieldErrors[`passenger-${index}-passportExpiry`] ? fieldErrorClass : ""}`}
                          value={passenger.passportExpiry}
                          onChange={(event) =>
                            setPassenger(index, { passportExpiry: event.target.value })
                          }
                        />
                      </Field>
                      <Field label="Wheelchair (if needed)">
                        <select
                          className={fieldClass}
                          value={passenger.wheelchair}
                          onChange={(event) =>
                            setPassenger(index, { wheelchair: event.target.value })
                          }
                        >
                          <option value="no">No</option>
                          <option value="yes">Yes</option>
                        </select>
                      </Field>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-[13px] text-aerotake-navy">
                      <input
                        type="checkbox"
                        checked={passenger.saveToList}
                        onChange={(event) =>
                          setPassenger(index, { saveToList: event.target.checked })
                        }
                        className="h-4 w-4 accent-aerotake-coral"
                      />
                      Add this person to passenger quick pick list
                    </label>
                  </div>
                ) : null}
              </section>
            );
          })}

          <section className="rounded-xl border border-aerotake-border bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#fff1f0] text-aerotake-coral">
                <PassengersIcon className="h-4 w-4" />
              </span>
              <p className="text-[14px] font-semibold text-aerotake-navy">Enter Contact Details</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
              <Field label="Country">
                <select
                  className={fieldClass}
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                >
                  <option value="Bangladesh">🇧🇩 Bangladesh</option>
                  <option value="India">🇮🇳 India</option>
                </select>
              </Field>
              <Field label="Phone Number" required error={fieldErrors["contact-phone"]}>
                <div className="flex gap-2">
                  <span className="inline-flex h-11 items-center rounded-lg border border-aerotake-border bg-[#f8fafc] px-3 text-[13px] text-aerotake-muted">
                    +88
                  </span>
                  <input
                    id="contact-phone"
                    type="tel"
                    className={`${fieldClass} ${fieldErrors["contact-phone"] ? fieldErrorClass : ""}`}
                    placeholder="1XXXXXXXXX"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                </div>
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Email" required error={fieldErrors["contact-email"]}>
                <input
                  id="contact-email"
                  type="email"
                  className={`${fieldClass} ${fieldErrors["contact-email"] ? fieldErrorClass : ""}`}
                  placeholder="partner@aerotake.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
            </div>
            <div className="mt-4 space-y-2.5">
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-aerotake-navy">
                <input
                  type="checkbox"
                  checked={usePassengerContact}
                  onChange={(event) => setUsePassengerContact(event.target.checked)}
                  className="h-4 w-4 accent-aerotake-coral"
                />
                Input passenger&apos;s contact details
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-aerotake-navy">
                <input
                  type="checkbox"
                  checked={sendTicketEmail}
                  onChange={(event) => setSendTicketEmail(event.target.checked)}
                  className="h-4 w-4 accent-aerotake-coral"
                />
                Send ticket to this email address
              </label>
            </div>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-xl border border-[#fecaca] bg-[#fff1f0] px-4 py-3">
            <p className="flex items-center gap-2 text-[12px] font-medium text-aerotake-coral">
              <ClockIcon className="h-4 w-4" />
              Session expires in
            </p>
            <p className="mt-1 text-[28px] leading-none font-bold tracking-wide text-aerotake-coral">
              {minutes} : {seconds}
              <span className="ml-1 text-[11px] font-semibold tracking-normal">min sec</span>
            </p>
          </div>

          <div className="rounded-xl border border-aerotake-border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-[14px] font-semibold text-aerotake-navy">Customer Summary</p>
              <span className="rounded-md bg-[#fff1f0] px-2 py-0.5 text-[10px] font-semibold text-aerotake-coral">
                Adult
              </span>
            </div>

            <div className="mt-4 space-y-2 text-[12px]">
              <SummaryRow
                label={`${booking.adults} × Adult Fare`}
                value={`BDT ${fare.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              />
              <SummaryRow
                label="Base Fare"
                value={`BDT ${fare.baseFare.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              />
              <SummaryRow
                label="Tax"
                value={`BDT ${fare.tax.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              />
              <SummaryRow
                label="AIT"
                value={`BDT ${fare.ait.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              />
              <SummaryRow
                label="Discount"
                value={`-BDT ${fare.discount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                valueClass="text-aerotake-coral"
              />
            </div>

            <div className="mt-4 border-t border-aerotake-border pt-3">
              <SummaryRow
                label="Total Payable"
                value={`BDT ${fare.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                bold
                valueClass="text-aerotake-coral"
              />
              <SummaryRow
                label="Grand Total"
                value={`BDT ${fare.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                bold
              />
            </div>

            <p className="mt-3 text-[11px] leading-4 text-aerotake-coral">
              Scheduled Payment Not Eligible: Minimum ticket fare for partial payment is 25000.
            </p>

            <label className="mt-4 flex cursor-pointer items-start gap-2 text-[12px] text-aerotake-navy">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-aerotake-coral"
              />
              <span>
                I agree to AeroTake{" "}
                <a href="#terms" className="font-semibold text-aerotake-coral hover:underline">
                  Terms &amp; Conditions
                </a>
              </span>
            </label>

            <button
              type="button"
              disabled={!agreed}
              onClick={openPreview}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-aerotake-coral text-[14px] font-semibold text-white hover:bg-aerotake-coral-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LockIcon className="h-4 w-4" />
              Confirm Booking
            </button>
          </div>
        </aside>
      </div>

      {previewOpen ? (
        <BookingPreviewModal
          booking={booking}
          passengers={passengers}
          fare={fare}
          previewConfirmed={previewConfirmed}
          onPreviewConfirmedChange={setPreviewConfirmed}
          onModify={() => setPreviewOpen(false)}
          // Stays open on its own now — handleConfirm only closes it (and
          // navigates) on success, so a live-offer failure leaves the agent
          // looking at the preview with an inline error, not a blank page.
          onConfirm={() => {
            void handleConfirm();
          }}
          busy={submitting}
          error={bookingError}
        />
      ) : null}

      {scanPassengerIndex !== null ? (
        <PassportScanModal
          onClose={closePassportScan}
          onComplete={(result) => {
            applyPassportScan(result);
          }}
        />
      ) : null}
    </div>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-aerotake-navy">
        {label}
        {required ? <span className="text-aerotake-coral"> *</span> : null}
      </span>
      {children}
      {error ? <span className="mt-1 block text-[11px] text-aerotake-coral">{error}</span> : null}
    </label>
  );
}

function SummaryRow({
  label,
  value,
  bold = false,
  valueClass = "text-aerotake-navy",
}: {
  label: string;
  value: string;
  bold?: boolean;
  valueClass?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${bold ? "text-[13px]" : ""}`}>
      <span className={bold ? "font-semibold text-aerotake-navy" : "text-aerotake-muted"}>
        {label}
      </span>
      <span className={`${bold ? "font-bold" : "font-medium"} ${valueClass}`}>{value}</span>
    </div>
  );
}
