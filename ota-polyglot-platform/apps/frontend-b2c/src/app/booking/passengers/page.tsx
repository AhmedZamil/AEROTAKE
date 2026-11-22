"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { BookingStepper, PriceSummary } from "@/components/booking/BookingChrome";
import ReserveOutcomeModal, { type ReserveDialog } from "@/components/booking/ReserveOutcomeModal";
import TouristVisaNoticeModal from "@/components/booking/TouristVisaNoticeModal";
import TravellerDetailsForm, { type TravellerFormValues } from "@/components/booking/TravellerDetailsForm";
import { useApp, type PassengerForm } from "@/context/AppProviders";
import type { BookingView } from "@/lib/booking-types";
import { loginHref } from "@/lib/auth-redirect";
import { ageInYears, todayIso, travellerBand, type TravellerBand } from "@/lib/dates";
import { emailValidationError } from "@/lib/email";
import { multiTripOffers, readMultiPicks, writeMultiPicks } from "@/lib/multi-picks";
import {
  normalizePassportNumber,
  passportExpiryError,
  passportNumberError,
} from "@/lib/passport";
import {
  joinContactPhone,
  normalizeNationalNumber,
  phoneValidationError,
  splitContactPhone,
} from "@/lib/phone";
import { flightsResultsHref } from "@/lib/search-href";

function buildTravellerSlots(adults: number, children: number, infants: number): TravellerBand[] {
  return [
    ...Array.from({ length: Math.max(1, adults) }, () => "adult" as const),
    ...Array.from({ length: Math.max(0, children) }, () => "child" as const),
    ...Array.from({ length: Math.max(0, infants) }, () => "infant" as const),
  ];
}

const passengerSchema = z.object({
  title: z.string().min(1, "Required"),
  firstName: z.string().min(2, "Given name is required"),
  lastName: z.string().min(2, "Last name is required"),
  gender: z.string().min(1, "Gender is required"),
  dob: z.string().min(1, "Date of birth required"),
  nationality: z.string().min(2, "Nationality required"),
  passportNumber: z.string(),
  passportExpiry: z.string(),
  frequentFlyer: z.string(),
  postCode: z.string(),
});

function schemaForSlots(slots: TravellerBand[], depart: string) {
  const onDay = /^\d{4}-\d{2}-\d{2}$/.test(depart) ? depart : todayIso();
  return z
    .object({
      passengers: z
        .array(passengerSchema)
        .min(slots.length)
        .superRefine((list, ctx) => {
          list.forEach((p, i) => {
            const expected = slots[i];
            if (!expected) return;
            const band = travellerBand(p.dob, onDay);
            if (!band) {
              ctx.addIssue({ code: "custom", message: "Enter a valid date of birth.", path: [i, "dob"] });
              return;
            }
            if (band !== expected) {
              const msg =
                expected === "infant"
                  ? "This traveller must be under 2 on the departure date."
                  : expected === "child"
                    ? "This traveller must be 2–11 years old on the departure date."
                    : "This traveller must be 12 or older on the departure date.";
              ctx.addIssue({ code: "custom", message: msg, path: [i, "dob"] });
            }
            const age = ageInYears(p.dob, onDay);
            if (age !== null && age < 0) {
              ctx.addIssue({ code: "custom", message: "Date of birth can’t be in the future.", path: [i, "dob"] });
            }
            const passportErr = passportNumberError(p.passportNumber);
            if (passportErr) {
              ctx.addIssue({ code: "custom", message: passportErr, path: [i, "passportNumber"] });
            }
            const expiryErr = passportExpiryError(p.passportExpiry);
            if (expiryErr) {
              ctx.addIssue({ code: "custom", message: expiryErr, path: [i, "passportExpiry"] });
            }
          });
        }),
      email: z.string(),
      phone: z.string(),
      phoneCountry: z.string().min(1),
    })
    .superRefine((values, ctx) => {
      const emailErr = emailValidationError(values.email);
      if (emailErr) {
        ctx.addIssue({ code: "custom", message: emailErr, path: ["email"] });
      }
      const phoneErr = phoneValidationError(values.phoneCountry, values.phone);
      if (phoneErr) {
        ctx.addIssue({ code: "custom", message: phoneErr, path: ["phone"] });
      }
    });
}

const COUNTRY_CODES: Record<string, string> = {
  Bangladesh: "BD",
  "United Arab Emirates": "AE",
  "United Kingdom": "GB",
  "United States": "US",
  India: "IN",
  Singapore: "SG",
  Malaysia: "MY",
};

function emptyPassenger(): PassengerForm {
  return { title: "Mr", firstName: "", lastName: "", gender: "", dob: "", nationality: "Bangladesh", passportNumber: "", passportExpiry: "", frequentFlyer: "", postCode: "" };
}

function normalizePassenger(p: PassengerForm): PassengerForm {
  return { ...emptyPassenger(), ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v || (emptyPassenger() as Record<string, string>)[k]])) } as PassengerForm;
}

export default function PassengersPage() {
  const router = useRouter();
  const {
    selectedOutbound,
    setSelectedOutbound,
    search,
    setPassengers,
    setContact,
    passengers,
    contactEmail,
    contactPhone,
    setReservation,
    format,
    user,
    userLoaded,
  } = useApp();
  const [visaNoticeOpen, setVisaNoticeOpen] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialog, setDialog] = useState<ReserveDialog | null>(null);
  // One key per attempt to book this fare: pressing the button twice, or a retry after a dropped connection, can never reserve twice.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  // The total already confirmed with the airline. Accepting a new price reserves without asking again.

  const confirmedQuote = useRef<number | null>(null);

  const slots = buildTravellerSlots(search.passengers.adults, search.passengers.children, search.passengers.infants);
  const count = slots.length;
  const contactSplit = splitContactPhone(contactPhone);

  const form = useForm<TravellerFormValues>({
    resolver: zodResolver(schemaForSlots(slots, search.depart)),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: {
      passengers: passengers.length === count ? passengers.map(normalizePassenger) : Array.from({ length: count }, () => emptyPassenger()),
      email: contactEmail,
      phone: contactSplit.phone,
      phoneCountry: contactSplit.phoneCountry,
    },
  });
  const { fields } = useFieldArray({ control: form.control, name: "passengers" });

  useEffect(() => {
    if (!userLoaded) return;
    if (!user) {
      router.replace(loginHref("/booking/passengers"));
      return;
    }
    if (!selectedOutbound) router.replace("/");
  }, [selectedOutbound, router, user, userLoaded]);

  useEffect(() => {
    if (!visaNoticeOpen && !dialog) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visaNoticeOpen, dialog]);

  if (!userLoaded || !user || !selectedOutbound) return null;
  const flight = selectedOutbound;

  const multi = search.trip === "multi" ? multiTripOffers(readMultiPicks()) : null;
  const offerIds = multi?.offerIds ?? [flight.id];
  const shownTotal = multi?.total ?? flight.price;

  const openPrice = (previous: number, next: number) => {
    if (!multi) setSelectedOutbound({ ...flight, price: next });
    setDialog({
      kind: "price",
      previousLabel: format(previous),
      nextLabel: format(next),
      next,
      dropped: next < previous,
    });
  };

  const openProblem = (message: string, retryable: boolean) => {
    setDialog({ kind: "problem", message, retryable });
  };

  const runReserve = async (values: TravellerFormValues, quoteTotal: number) => {
    setDialog(null);
    setSubmitting(true);
    try {
      if (search.trip === "multi" && !multi) {
        openProblem("This trip is missing a flight. Please search again and choose every leg.", false);
        return;
      }
      const cleanedPassengers = values.passengers.map((p) => ({
        ...p,
        passportNumber: normalizePassportNumber(p.passportNumber),
      }));
      setPassengers(cleanedPassengers);
      const nationalPhone = normalizeNationalNumber(values.phoneCountry, values.phone);
      const phone = joinContactPhone(values.phoneCountry, nationalPhone);
      setContact(values.email, phone);

      let confirmedTotal = 0;
      let fareChanged = false;
      const picks = readMultiPicks();
      // One airline check per chosen fare, immediately before the hold. The results list never does this.
      // Accepting a changed price reuses that answer, so the airline is not asked a second time.
      if (confirmedQuote.current !== quoteTotal) {
        for (const offerId of offerIds) {
          const expected = multi ? (picks.find((p) => p.offerId === offerId)?.price ?? 0) : quoteTotal;
          const check = await fetch("/api/bookings/revalidate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ offerId, expectedSellPrice: expected }),
          });
          if (!check.ok) throw new Error("We couldn't confirm the fare just now. Please try again.");
          const verdict = (await check.json()) as { matches: boolean; currentSellPrice: number; failureReason: string };
          if (!verdict.matches) {
            if (verdict.failureReason || verdict.currentSellPrice <= 0) {
              openProblem("This fare is no longer available. Please search again.", false);
              return;
            }
            fareChanged = true;
            const pick = picks.find((p) => p.offerId === offerId);
            if (pick) pick.price = verdict.currentSellPrice;
            confirmedTotal += verdict.currentSellPrice;
          } else {
            confirmedTotal += expected;
          }
        }
        if (fareChanged) {
          if (multi) writeMultiPicks(picks);
          confirmedQuote.current = confirmedTotal;
          openPrice(quoteTotal, confirmedTotal);
          return;
        }
      }

      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerId: offerIds[0],
          offerIds,
          idempotencyKey,
          contactEmail: values.email,
          contactPhone: phone,
          expectedTotal: quoteTotal,
          travelers: cleanedPassengers.map((p) => ({
            firstName: p.firstName,
            lastName: p.lastName,
            dateOfBirth: p.dob,
            documentType: "PASSPORT",
            documentNumber: p.passportNumber,
            passportExpiryDate: p.passportExpiry,
            nationality: COUNTRY_CODES[p.nationality] ?? "",
            title: p.gender === "female" ? "ms" : "mr",
            gender: p.gender,
          })),
        }),
      });
      const body = await res.json().catch(() => ({})) as {
        error?: string;
        message?: string;
        newTotal?: number;
        booking?: BookingView;
      };
      if (res.status === 409 && body.error === "price_changed") return openPrice(quoteTotal, Number(body.newTotal));
      if (!res.ok) {
        // Core already sends a customer-safe message (e.g. hold refused → "airline could not hold these
        // seats"). A 409 means this fare cannot be booked; a 429 or a server error can be tried again.
        openProblem(
          res.status === 429
            ? "Too many attempts. Please wait a moment and try again."
            : res.status === 401
              ? (body.message ?? "Your session expired. Sign in again, then reserve.")
              : (body.message ??
                  (res.status === 409
                    ? "This fare is no longer available. Please search again."
                    : "We couldn't reserve these seats. Please try again.")),
          res.status !== 409 && res.status !== 401,
        );
        return;
      }

      const booking = body.booking as BookingView;
      setReservation(booking);
      router.push("/booking/confirmation");
    } catch (err) {
      openProblem(err instanceof Error ? err.message : "Something went wrong. Please try again.", true);
    } finally {
      setSubmitting(false);
    }
  };

  const reserveAndPay = form.handleSubmit((values) => runReserve(values, shownTotal));

  return (
    <div className="mx-auto max-w-[1320px] px-4 py-8 sm:px-6 lg:px-8">
      <TouristVisaNoticeModal open={visaNoticeOpen} onConfirm={() => setVisaNoticeOpen(false)} />
      <ReserveOutcomeModal
        dialog={dialog}
        onRetry={() => {
          const values = form.getValues();
          void runReserve(values, shownTotal);
        }}
        onAcceptPrice={() => {
          if (dialog?.kind !== "price") return;
          void runReserve(form.getValues(), dialog.next);
        }}
        onSearch={() => router.push(flightsResultsHref(search))}
      />
      <BookingStepper current={1} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          <TravellerDetailsForm
            fields={fields}
            travellerSlots={slots}
            ageOn={search.depart}
            passengers={form.watch("passengers")}
            register={form.register}
            setValue={form.setValue}
            trigger={form.trigger}
            errors={form.formState.errors}
            email={form.watch("email")}
            phone={form.watch("phone")}
            phoneCountry={form.watch("phoneCountry")}
            onBack={() => router.push("/booking/fare")}
            backLabel="Back to fare"
            submitting={submitting}
            submitLabel={submitting ? "Reserving…" : "Reserve seats"}
            onSubmit={() => {
              void reserveAndPay();
            }}
          />
          <p className="text-xs text-slate">
            Infants travel on an adult’s lap. Enter each infant’s date of birth so the airline can price and issue the ticket correctly. We hold the seats first. You choose wallet or card on the next page — card details never go on this site.
          </p>
        </div>

        <div className="hidden lg:block">
          <PriceSummary />
        </div>
      </div>
      <PriceSummary mobileBar />
      <div className="h-20 lg:hidden" />
    </div>
  );
}
