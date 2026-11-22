"use client";

import Image from "next/image";
import AirlineMark from "./airline-mark";
import { usePartnerProfile } from "./partner-profile";
import { CloseIcon } from "./icons";
import type { FlightBookingDraft } from "@/data/flight-booking";
import { ButtonSpinner } from "@/components/ui/button-spinner";

type PreviewPassenger = {
  title: string;
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  passportNumber?: string;
  passportExpiry?: string;
};

type FareBreakdown = {
  baseFare: number;
  tax: number;
  ait: number;
  discount: number;
  grandTotal: number;
  subtotal: number;
};

function formatMoney(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function passengerName(passenger: PreviewPassenger) {
  const parts = [passenger.title, passenger.firstName, passenger.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return parts || "—";
}

function formatDob(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function BookingPreviewModal({
  booking,
  passengers,
  fare,
  previewConfirmed,
  onPreviewConfirmedChange,
  onModify,
  onConfirm,
  busy = false,
  error = null,
}: {
  booking: FlightBookingDraft & {
    flightCode: string;
    aircraft: string;
    bookingClass: string;
    refundable: boolean;
  };
  passengers: PreviewPassenger[];
  fare: FareBreakdown;
  previewConfirmed: boolean;
  onPreviewConfirmedChange: (value: boolean) => void;
  onModify: () => void;
  onConfirm: () => void;
  // True while a live offer's reservation call is in flight — disables both
  // buttons and swaps the Confirm label so a second click can't fire a
  // second ProcessB2BBooking call. See flight-booking-checkout.tsx.
  busy?: boolean;
  // Set when that reservation call failed — shown inline so the agent sees
  // exactly what went wrong without losing their place (modal stays open).
  error?: string | null;
}) {
  const { profile } = usePartnerProfile();
  const adults = Math.max(1, booking.adults);
  const perBase = fare.baseFare / adults;
  const perTax = fare.tax / adults;
  const perAit = fare.ait / adults;
  const perCommission = fare.discount / adults;
  const perTotal = fare.grandTotal / adults;
  const cabinLabel = booking.cabin.charAt(0).toUpperCase() + booking.cabin.slice(1);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-aerotake-navy/50 p-4 sm:items-center">
      <div className="my-4 w-full max-w-[920px] rounded-xl bg-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
        <div className="relative border-b border-aerotake-border px-5 py-4">
          <h2 className="text-center text-[18px] font-bold text-aerotake-navy">Preview</h2>
          <button
            type="button"
            aria-label="Close preview"
            disabled={busy}
            onClick={onModify}
            className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full text-aerotake-muted hover:bg-aerotake-canvas disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex flex-col gap-4 border-b border-aerotake-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/images/verticle_logo.png"
              alt={profile.agencyName}
              width={1200}
              height={900}
              className="h-auto w-[160px] mix-blend-lighten"
            />
          </div>
          <div className="text-[12px] leading-5 text-aerotake-navy sm:text-right">
            <p className="font-semibold">{profile.agencyName}</p>
            <p className="mt-1 text-aerotake-muted">{profile.address}</p>
            <p className="text-aerotake-muted">Phone: {profile.mobile}</p>
            <p className="text-aerotake-muted">Email: {profile.email}</p>
          </div>
        </div>

        <div className="max-h-[min(70vh,720px)] overflow-y-auto px-5 py-4">
          <PreviewSection title="Passenger Information">
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-[12px]">
                <thead>
                  <tr className="border border-aerotake-border bg-[#eef6ff] text-left text-aerotake-navy">
                    <th className="border border-aerotake-border px-3 py-2 font-semibold">Name</th>
                    <th className="border border-aerotake-border px-3 py-2 font-semibold">Type</th>
                    <th className="border border-aerotake-border px-3 py-2 font-semibold">
                      Date of Birth
                    </th>
                    <th className="border border-aerotake-border px-3 py-2 font-semibold">
                      Passport Number
                    </th>
                    <th className="border border-aerotake-border px-3 py-2 font-semibold">
                      Passport Expire date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {passengers.map((passenger, index) => (
                    <tr key={index} className="text-aerotake-navy">
                      <td className="border border-aerotake-border px-3 py-2">
                        {passengerName(passenger)}
                      </td>
                      <td className="border border-aerotake-border px-3 py-2">Adult</td>
                      <td className="border border-aerotake-border px-3 py-2">
                        {formatDob(passenger.dateOfBirth)}
                      </td>
                      <td className="border border-aerotake-border px-3 py-2">
                        {passenger.passportNumber || "—"}
                      </td>
                      <td className="border border-aerotake-border px-3 py-2">
                        {formatDob(passenger.passportExpiry ?? "")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PreviewSection>

          <PreviewSection title="Flight Details">
            <p className="mb-3 text-[13px] font-semibold text-aerotake-navy">
              {booking.fromCity}({booking.fromCode}) -&gt; {booking.toCity}({booking.toCode})
            </p>
            <div className="mb-3 flex items-center gap-2 text-[12px] text-aerotake-muted">
              <AirlineMark code={booking.airlineCode} size="sm" />
              <span>
                {booking.airlineName} | Flight No - {booking.flightCode} | Aircraft Model -{" "}
                {booking.aircraft}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-[12px]">
                <thead>
                  <tr className="border border-aerotake-border bg-[#eef6ff] text-left text-aerotake-navy">
                    <th className="border border-aerotake-border px-3 py-2 font-semibold">Date</th>
                    <th className="border border-aerotake-border px-3 py-2 font-semibold">Time</th>
                    <th className="border border-aerotake-border px-3 py-2 font-semibold">
                      Flight Info
                    </th>
                    <th className="border border-aerotake-border px-3 py-2 font-semibold">
                      Flight Time
                    </th>
                    <th className="border border-aerotake-border px-3 py-2 font-semibold">Cabin</th>
                    <th className="border border-aerotake-border px-3 py-2 font-semibold">
                      Baggage
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-aerotake-navy">
                    <td className="border border-aerotake-border px-3 py-2">{booking.dateText}</td>
                    <td className="border border-aerotake-border px-3 py-2">
                      {booking.departTime} / {booking.arriveTime}
                    </td>
                    <td className="border border-aerotake-border px-3 py-2">
                      <span className="block">Departs: {booking.fromCity}({booking.fromCode})</span>
                      <span className="block">
                        Arrives: {booking.toCity}({booking.toCode})
                      </span>
                    </td>
                    <td className="border border-aerotake-border px-3 py-2">{booking.duration}</td>
                    <td className="border border-aerotake-border px-3 py-2">{cabinLabel}</td>
                    <td className="border border-aerotake-border px-3 py-2">20 Kg</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </PreviewSection>

          <PreviewSection title="Fare Details">
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-[12px]">
                <thead>
                  <tr className="border border-aerotake-border bg-[#eef6ff] text-left text-aerotake-navy">
                    <th className="border border-aerotake-border px-3 py-2 font-semibold">Type</th>
                    <th className="border border-aerotake-border px-3 py-2 font-semibold">
                      Base Fare
                    </th>
                    <th className="border border-aerotake-border px-3 py-2 font-semibold">Tax</th>
                    <th className="border border-aerotake-border px-3 py-2 font-semibold">
                      AIT/VAT
                    </th>
                    <th className="border border-aerotake-border px-3 py-2 font-semibold">
                      Commission
                    </th>
                    <th className="border border-aerotake-border px-3 py-2 font-semibold">Person</th>
                    <th className="border border-aerotake-border px-3 py-2 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-aerotake-navy">
                    <td className="border border-aerotake-border px-3 py-2">Adult</td>
                    <td className="border border-aerotake-border px-3 py-2">
                      {formatMoney(perBase)}
                    </td>
                    <td className="border border-aerotake-border px-3 py-2">{formatMoney(perTax)}</td>
                    <td className="border border-aerotake-border px-3 py-2">{formatMoney(perAit)}</td>
                    <td className="border border-aerotake-border px-3 py-2">
                      {formatMoney(perCommission)}
                    </td>
                    <td className="border border-aerotake-border px-3 py-2">{adults}</td>
                    <td className="border border-aerotake-border px-3 py-2">
                      {formatMoney(perTotal * adults)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-right text-[13px] font-bold text-aerotake-navy">
              Grand Total:{" "}
              <span className="text-aerotake-coral">BDT {formatMoney(fare.grandTotal)}</span>
            </p>
          </PreviewSection>
        </div>

        <div className="border-t border-aerotake-border px-5 py-4">
          {error ? (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[12px] font-medium text-[#b91c1c]"
            >
              {error}
            </div>
          ) : null}

          <label className="flex cursor-pointer items-start gap-2 text-[12px] text-aerotake-navy">
            <input
              type="checkbox"
              checked={previewConfirmed}
              disabled={busy}
              onChange={(event) => onPreviewConfirmedChange(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-aerotake-coral"
            />
            I agree and confirm that, all the passenger information provided here is correct.
          </label>

          <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              disabled={busy}
              onClick={onModify}
              className="inline-flex h-11 min-w-[160px] items-center justify-center rounded-full bg-aerotake-coral px-6 text-[14px] font-semibold text-white hover:bg-aerotake-coral-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              Modify
            </button>
            <button
              type="button"
              disabled={!previewConfirmed || busy}
              aria-busy={busy}
              onClick={onConfirm}
              className={`inline-flex h-11 min-w-[180px] items-center justify-center gap-2 rounded-full px-6 text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70 ${
                previewConfirmed
                  ? "bg-aerotake-coral hover:bg-aerotake-coral-dark"
                  : "bg-[#cbd5e1]"
              }`}
            >
              {busy ? <ButtonSpinner /> : null}
              {busy ? "Reserving your booking…" : "Confirm Booking"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4 overflow-hidden rounded-lg border border-aerotake-border">
      <div className="border-b border-aerotake-border bg-[#eef6ff] px-3 py-2">
        <h3 className="text-[13px] font-semibold text-aerotake-navy">{title}</h3>
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}
