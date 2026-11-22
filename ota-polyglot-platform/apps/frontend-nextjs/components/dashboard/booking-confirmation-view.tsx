"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AirlineMark from "./airline-mark";
import SupportBookingLink from "./support-booking-link";
import { usePartnerProfile } from "./partner-profile";
import { DownloadIcon, SendIcon } from "./icons";
import {
  loadConfirmedBooking,
  type ConfirmedBooking,
  type ConfirmedPassenger,
} from "@/data/flight-booking";

function formatMoney(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function passengerName(passenger: ConfirmedPassenger) {
  const title =
    passenger.title === "mr"
      ? "Mr"
      : passenger.title === "mrs"
        ? "Mrs"
        : passenger.title === "ms"
          ? "Ms"
          : passenger.title;
  const parts = [title, passenger.firstName, passenger.lastName].filter(Boolean).join(" ").trim();
  return parts || "—";
}

function formatDob(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatGender(value: string) {
  if (value === "male") return "Male";
  if (value === "female") return "Female";
  return value || "—";
}

export default function BookingConfirmationView() {
  const router = useRouter();
  const { profile } = usePartnerProfile();
  const [record, setRecord] = useState<ConfirmedBooking | null>(null);
  const [hideFare, setHideFare] = useState(false);
  const [grossFare, setGrossFare] = useState(true);

  useEffect(() => {
    const saved = loadConfirmedBooking();
    if (!saved) {
      router.replace("/dashboard/bookings");
      return;
    }
    setRecord(saved);
  }, [router]);

  if (!record) {
    return (
      <div className="mx-auto flex min-h-[50vh] w-full max-w-[1100px] items-center justify-center px-4">
        <p className="text-[14px] text-aerotake-muted">Loading booking details...</p>
      </div>
    );
  }

  const { flight, fare, passengers, contact } = record;
  const cabinLabel = flight.cabin.charAt(0).toUpperCase() + flight.cabin.slice(1);
  const perBase = Math.round(fare.baseFare / Math.max(1, flight.adults));
  const perTax = Math.round(fare.tax / Math.max(1, flight.adults));
  const perAit = Math.round(fare.ait / Math.max(1, flight.adults));
  const displayTotal = grossFare ? fare.grandTotal + fare.discount : fare.grandTotal;

  return (
    <div className="relative min-h-full">
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.18]"
        aria-hidden
      >
        <div className="absolute -top-10 left-[8%] h-28 w-28 rounded-full border border-aerotake-navy/20" />
        <div className="absolute top-[18%] right-[12%] h-16 w-16 rounded-full border border-aerotake-navy/15" />
        <div className="absolute bottom-[22%] left-[6%] h-20 w-20 rounded-full border border-aerotake-navy/15" />
      </div>

      <div className="relative mx-auto w-full max-w-[1100px] px-3 py-3 pb-28 md:px-6 md:py-5">
        <div className="mb-3 flex flex-col gap-3 md:mb-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="inline-flex min-h-10 items-center gap-2 text-[13px] text-aerotake-navy md:min-h-0 md:text-[12px]">
              <input
                type="checkbox"
                checked={hideFare}
                onChange={(event) => setHideFare(event.target.checked)}
                className="h-4 w-4 accent-aerotake-coral"
              />
              Hide Fare
            </label>
            <label className="inline-flex min-h-10 items-center gap-2 text-[13px] text-aerotake-navy md:min-h-0 md:text-[12px]">
              <input
                type="checkbox"
                checked={grossFare}
                onChange={(event) => setGrossFare(event.target.checked)}
                className="h-4 w-4 accent-aerotake-coral"
              />
              Gross Fare
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:gap-3">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-aerotake-navy px-4 text-[13px] font-semibold text-white hover:bg-[#1e293b] md:h-9 md:rounded-lg md:text-[12px]"
            >
              <SendIcon className="h-3.5 w-3.5" />
              Send Email
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#0f766e] px-4 text-[13px] font-semibold text-white hover:bg-[#0d635d] md:h-9 md:rounded-lg md:text-[12px]"
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              Download
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-aerotake-border bg-white shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
          <div className="border-b border-aerotake-border px-4 py-4 md:px-5 md:py-5">
            <div className="text-center">
              <span className="inline-block rounded-full border border-aerotake-border px-5 py-1.5 text-[16px] font-bold text-aerotake-navy md:px-8 md:py-2 md:text-[18px]">
                Booking Details
              </span>
            </div>
            <div className="mt-3 md:mt-4">
              <p className="text-[13px] font-semibold text-aerotake-navy">
                {record.agencyName || profile.agencyName}
              </p>
              <p className="text-[12px] text-aerotake-muted">
                Reg No:{record.agencyReg || profile.tradeLicense}
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 md:hidden">
              <div className="rounded-xl bg-[#fff1f0] px-3 py-2.5">
                <p className="text-[10px] font-semibold tracking-wide text-aerotake-muted uppercase">
                  PNR
                </p>
                <p className="mt-0.5 text-[15px] font-bold text-aerotake-navy">{record.pnr}</p>
              </div>
              <div className="rounded-xl bg-[#fff1f0] px-3 py-2.5">
                <p className="text-[10px] font-semibold tracking-wide text-aerotake-muted uppercase">
                  Status
                </p>
                <p className="mt-0.5 text-[15px] font-bold text-aerotake-coral">{record.status}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3 p-3 md:space-y-4 md:p-5">
            <DetailSection title="Booking Confirmed">
              <div className="grid gap-2 md:grid-cols-2 md:gap-0">
                <InfoCell label="Booking Date" value={record.bookingDate} />
                <InfoCell label="Booking ID" value={record.bookingId} />
                <InfoCell
                  label="Issue Before"
                  value={
                    <button
                      type="button"
                      className="rounded-md bg-[#0f766e] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#0d635d]"
                    >
                      Get Limit
                    </button>
                  }
                />
                <InfoCell label="PNR" value={record.pnr} />
                <InfoCell
                  label="Booking Status"
                  value={<span className="font-semibold text-aerotake-coral">{record.status}</span>}
                />
                <InfoCell label="Booked By" value={record.bookedBy} />
                <InfoCell label="Airline PNR" value={record.airlinePnr} className="md:col-span-2" />
              </div>
            </DetailSection>

            <DetailSection title="Passenger Details">
              <div className="space-y-3 md:hidden">
                {passengers.map((passenger, index) => (
                  <div
                    key={index}
                    className="rounded-xl border border-aerotake-border bg-[#f8fafc] p-3"
                  >
                    <p className="text-[14px] font-semibold text-aerotake-navy">
                      {passengerName(passenger)}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                      <FieldChip label="Type" value="Adult" />
                      <FieldChip label="Gender" value={formatGender(passenger.gender)} />
                      <FieldChip label="DOB" value={formatDob(passenger.dateOfBirth)} />
                      <FieldChip
                        label="Passport No"
                        value={passenger.passportNumber || "—"}
                      />
                      <FieldChip label="Passport Expiry Date" value="—" />
                      <FieldChip
                        label="Phone"
                        value={index === 0 ? contact.phone || "—" : "—"}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-full border-collapse text-[12px]">
                  <thead>
                    <tr className="bg-[#eef2f6] text-left text-aerotake-navy">
                      {[
                        "Name",
                        "Type",
                        "Gender",
                        "DOB",
                        "Passport No",
                        "Passport Expiry Date",
                        "Phone",
                      ].map((heading) => (
                        <th
                          key={heading}
                          className="border border-aerotake-border px-3 py-2 font-semibold"
                        >
                          {heading}
                        </th>
                      ))}
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
                          {formatGender(passenger.gender)}
                        </td>
                        <td className="border border-aerotake-border px-3 py-2">
                          {formatDob(passenger.dateOfBirth)}
                        </td>
                        <td className="border border-aerotake-border px-3 py-2">
                          {passenger.passportNumber || "—"}
                        </td>
                        <td className="border border-aerotake-border px-3 py-2">—</td>
                        <td className="border border-aerotake-border px-3 py-2">
                          {index === 0 ? contact.phone || "—" : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DetailSection>

            <DetailSection title="Travel Segments">
              <div className="space-y-3 md:hidden">
                <div className="rounded-xl border border-aerotake-border bg-[#f8fafc] p-3">
                  <div className="flex items-center gap-2">
                    <AirlineMark code={flight.airlineCode} size="sm" />
                    <p className="text-[13px] font-semibold text-aerotake-navy">
                      {flight.airlineName} {flight.flightCode}
                    </p>
                  </div>

                  <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-start gap-2">
                    <div>
                      <p className="text-[11px] font-semibold text-aerotake-muted uppercase">
                        Departs
                      </p>
                      <p className="mt-1 text-[13px] font-semibold text-aerotake-navy">
                        {flight.fromCity} {flight.fromCode}
                      </p>
                      <p className="text-[11px] text-aerotake-muted">Terminal: D</p>
                      <p className="mt-2 text-[18px] font-bold text-aerotake-coral">
                        {flight.departTime}
                      </p>
                      <p className="text-[11px] text-aerotake-muted">{flight.dateText}</p>
                    </div>
                    <div className="pt-8 text-[11px] text-aerotake-muted">→</div>
                    <div className="text-right">
                      <p className="text-[11px] font-semibold text-aerotake-muted uppercase">
                        Arrives
                      </p>
                      <p className="mt-1 text-[13px] font-semibold text-aerotake-navy">
                        {flight.toCity} {flight.toCode}
                      </p>
                      <p className="text-[11px] text-aerotake-muted">Terminal: D</p>
                      <p className="mt-2 text-[18px] font-bold text-aerotake-coral">
                        {flight.arriveTime}
                      </p>
                      <p className="text-[11px] text-aerotake-muted">{flight.dateText}</p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                    <FieldChip label="Fare Basis" value={`${flight.bookingClass}DOMO`} />
                    <FieldChip label="Cabin" value={`${cabinLabel} (${flight.bookingClass})`} />
                    <FieldChip
                      label="Baggage"
                      value="Adult -> Check-in: 20 Kg"
                      className="col-span-2"
                    />
                  </div>
                </div>
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-full border-collapse text-[12px]">
                  <thead>
                    <tr className="bg-[#eef2f6] text-left text-aerotake-navy">
                      {[
                        "Airline",
                        "Departs",
                        "Date/Time",
                        "Arrives",
                        "Date/Time",
                        "Fare Basis",
                        "Cabin",
                        "Baggage",
                      ].map((heading) => (
                        <th
                          key={heading}
                          className="border border-aerotake-border px-3 py-2 font-semibold"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="text-aerotake-navy">
                      <td className="border border-aerotake-border px-3 py-2">
                        <div className="flex items-center gap-2">
                          <AirlineMark code={flight.airlineCode} size="sm" />
                          <span>
                            {flight.airlineName} {flight.flightCode}
                          </span>
                        </div>
                      </td>
                      <td className="border border-aerotake-border px-3 py-2">
                        {flight.fromCity} {flight.fromCode}
                        <span className="block text-[11px] text-aerotake-muted">Terminal: D</span>
                      </td>
                      <td className="border border-aerotake-border px-3 py-2">
                        {flight.departTime}
                        <span className="block text-[11px] text-aerotake-muted">
                          {flight.dateText}
                        </span>
                      </td>
                      <td className="border border-aerotake-border px-3 py-2">
                        {flight.toCity} {flight.toCode}
                        <span className="block text-[11px] text-aerotake-muted">Terminal: D</span>
                      </td>
                      <td className="border border-aerotake-border px-3 py-2">
                        {flight.arriveTime}
                        <span className="block text-[11px] text-aerotake-muted">
                          {flight.dateText}
                        </span>
                      </td>
                      <td className="border border-aerotake-border px-3 py-2">
                        {flight.bookingClass}DOMO
                      </td>
                      <td className="border border-aerotake-border px-3 py-2">
                        {cabinLabel} ({flight.bookingClass})
                      </td>
                      <td className="border border-aerotake-border px-3 py-2">
                        Adult -&gt; Check-in: 20 Kg
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </DetailSection>

            {!hideFare ? (
              <DetailSection title="Fare Details">
                <div className="space-y-3 md:hidden">
                  <div className="rounded-xl border border-aerotake-border bg-[#f8fafc] p-3">
                    <div className="grid grid-cols-2 gap-2 text-[12px]">
                      <FieldChip label="Type" value="Adult" />
                      <FieldChip label="Person" value={String(flight.adults)} />
                      <FieldChip label="Base Fare" value={formatMoney(perBase)} />
                      <FieldChip label="Tax" value={formatMoney(perTax)} />
                      <FieldChip label="AIT/VAT" value={formatMoney(perAit)} />
                      <FieldChip label="Total" value={formatMoney(displayTotal)} />
                    </div>
                  </div>
                  <p className="text-center text-[14px] font-bold text-aerotake-navy md:text-right">
                    Grand Total:{" "}
                    <span className="text-aerotake-coral">BDT {formatMoney(displayTotal)}</span>
                  </p>
                </div>

                <div className="hidden md:block">
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-[12px]">
                      <thead>
                        <tr className="bg-[#eef2f6] text-left text-aerotake-navy">
                          {["Type", "Base Fare", "Tax", "AIT/VAT", "Person", "Total"].map(
                            (heading) => (
                              <th
                                key={heading}
                                className="border border-aerotake-border px-3 py-2 font-semibold"
                              >
                                {heading}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="text-aerotake-navy">
                          <td className="border border-aerotake-border px-3 py-2">Adult</td>
                          <td className="border border-aerotake-border px-3 py-2">
                            {formatMoney(perBase)}
                          </td>
                          <td className="border border-aerotake-border px-3 py-2">
                            {formatMoney(perTax)}
                          </td>
                          <td className="border border-aerotake-border px-3 py-2">
                            {formatMoney(perAit)}
                          </td>
                          <td className="border border-aerotake-border px-3 py-2">
                            {flight.adults}
                          </td>
                          <td className="border border-aerotake-border px-3 py-2">
                            {formatMoney(displayTotal)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-3 text-right text-[13px] font-bold text-aerotake-navy">
                    Grand Total:{" "}
                    <span className="text-aerotake-coral">BDT {formatMoney(displayTotal)}</span>
                  </p>
                </div>
              </DetailSection>
            ) : null}

            <DetailSection title="Contact Details">
              <div className="grid grid-cols-1 gap-2 md:hidden">
                <FieldChip label="Departs" value={flight.fromCity} />
                <FieldChip label="Phone Number" value={contact.phone || "—"} />
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-full border-collapse text-[12px]">
                  <thead>
                    <tr className="bg-[#eef2f6] text-left text-aerotake-navy">
                      <th className="border border-aerotake-border px-3 py-2 font-semibold">
                        Departs
                      </th>
                      <th className="border border-aerotake-border px-3 py-2 font-semibold">
                        Phone Number
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="text-aerotake-navy">
                      <td className="border border-aerotake-border px-3 py-2">{flight.fromCity}</td>
                      <td className="border border-aerotake-border px-3 py-2">
                        {contact.phone || "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </DetailSection>
          </div>

          <div className="border-t border-aerotake-border px-4 py-5 text-center md:px-5">
            <p className="text-[12px] font-medium leading-5 text-aerotake-coral md:text-[13px]">
              You don&apos;t have enough balance to issue this ticket! Please topup in your
              account.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-2 md:flex md:flex-wrap md:items-center md:justify-center md:gap-3">
              <button
                type="button"
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-aerotake-coral px-5 text-[13px] font-semibold text-white hover:bg-aerotake-coral-dark md:h-10 md:w-auto md:min-w-[140px]"
              >
                Cancel Booking
              </button>
              <button
                type="button"
                disabled
                className="inline-flex h-11 w-full cursor-not-allowed items-center justify-center rounded-full bg-[#cbd5e1] px-5 text-[13px] font-semibold text-white opacity-80 md:h-10 md:w-auto md:min-w-[140px]"
              >
                Issue Ticket
              </button>
              <SupportBookingLink
                bookingId={record.bookingId}
                pnr={record.pnr}
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#0f766e] px-5 text-[13px] font-semibold text-white hover:bg-[#0d635d] md:h-10 md:w-auto md:min-w-[120px]"
              >
                Support
              </SupportBookingLink>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-aerotake-border md:rounded-lg">
      <div className="border-b border-aerotake-border bg-[#eef2f6] px-3 py-2.5 md:py-2">
        <h3 className="text-[11px] font-bold tracking-wide text-aerotake-navy uppercase md:text-[12px]">
          {title}
        </h3>
      </div>
      <div className="p-2.5 md:p-3">{children}</div>
    </section>
  );
}

function InfoCell({
  label,
  value,
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-aerotake-border text-[12px] md:rounded-none md:grid md:grid-cols-[140px_minmax(0,1fr)] ${className}`}
    >
      <div className="bg-[#f8fafc] px-3 py-2 font-semibold text-aerotake-navy md:border-r md:border-aerotake-border md:py-2.5">
        {label}
      </div>
      <div className="break-all px-3 py-2 text-aerotake-navy md:py-2.5">{value}</div>
    </div>
  );
}

function FieldChip({
  label,
  value,
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-aerotake-border bg-white px-3 py-2 ${className}`}>
      <p className="text-[10px] font-semibold tracking-wide text-aerotake-muted uppercase">
        {label}
      </p>
      <p className="mt-0.5 break-words text-[12px] font-medium text-aerotake-navy">{value}</p>
    </div>
  );
}
