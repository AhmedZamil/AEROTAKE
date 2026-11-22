"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BookingStepper } from "@/components/booking/BookingChrome";
import BookingSummaryCard from "@/components/booking/BookingSummaryCard";
import ItineraryActions from "@/components/booking/ItineraryActions";
import { useApp } from "@/context/AppProviders";
import PaymentChoices from "@/components/booking/PaymentChoices";

export default function ConfirmationPage() {
  const router = useRouter();
  const { reservation, setReservation, user, contactEmail } = useApp();
  const [payError, setPayError] = useState("");

  useEffect(() => {
    if (!reservation) router.replace("/");
  }, [reservation, router]);

  useEffect(() => {
    const msg = sessionStorage.getItem("aerotake-pay-error");
    if (msg) {
      setPayError(msg);
      sessionStorage.removeItem("aerotake-pay-error");
    }
  }, []);

  if (!reservation) return null;

  const confirmed = reservation.status === "Confirmed";
  const pendingPay = reservation.status === "Pending";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <BookingStepper current={2} deadline={pendingPay ? reservation.ticketingDeadline : null} />
      <div className="mb-4 rounded-2xl border border-border bg-card p-6 text-center sm:p-8">
        <p className={`text-sm font-semibold uppercase tracking-wide ${confirmed ? "text-success-text" : "text-warning-text"}`}>
          {confirmed ? "Booking confirmed" : "Seats reserved"}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-navy">
          {confirmed ? "You’re booked" : "Your booking is held"}
        </h1>
        <p className="mt-3 text-sm text-slate">
          {confirmed
            ? "Payment succeeded and your ticket has been issued."
            : "Seats are held for a limited time. Pay with your Aerotake wallet, or by card on our secure payment partner."}
          {!confirmed && contactEmail ? ` We’ll also email updates to ${contactEmail}.` : null}
        </p>
        {payError ? (
          <p className="form-error mt-3 rounded-xl px-4 py-3 text-sm" role="alert">
            {payError}
          </p>
        ) : null}
        {pendingPay ? (
          <PaymentChoices
            bookingId={reservation.id}
            onPaid={(status) => {
              if (status === "Confirmed") {
                setReservation({ ...reservation, status: "Confirmed" });
                return;
              }
              if (status === "Failed") {
                setReservation({ ...reservation, status: "Failed" });
                setPayError("The ticket could not be issued, so the wallet charge was returned.");
                return;
              }
              setPayError("Payment received. Your ticket may take a moment — check My bookings shortly.");
            }}
          />
        ) : null}
      </div>

      <BookingSummaryCard booking={reservation}>
        {confirmed ? <ItineraryActions booking={reservation} className="mt-4" /> : null}
      </BookingSummaryCard>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href={user ? "/my-bookings" : "/manage-booking"} className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-semibold">
          {user ? "My bookings" : "Manage booking"}
        </Link>
        <Link href="/" className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-semibold">
          Back to search
        </Link>
      </div>
    </div>
  );
}
