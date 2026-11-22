"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { BookingStepper } from "@/components/booking/BookingChrome";
import BookingSummaryCard from "@/components/booking/BookingSummaryCard";
import ItineraryActions from "@/components/booking/ItineraryActions";
import { useApp } from "@/context/AppProviders";
import type { BookingView } from "@/lib/booking-types";
import PaymentChoices from "@/components/booking/PaymentChoices";

type Status = "success" | "fail" | "cancel" | string;

function ReturnInner() {
  const router = useRouter();
  const params = useSearchParams();
  const status = (params.get("status") ?? "") as Status;
  const bookingId = params.get("bookingId") ?? "";
  const { reservation, setReservation, user, userLoaded, format } = useApp();
  const [booking, setBooking] = useState<BookingView | null>(
    reservation && reservation.id === bookingId ? reservation : null,
  );
  const [payError, setPayError] = useState("");
  const [pollNote, setPollNote] = useState("");

  const refreshBooking = useCallback(async () => {
    if (!bookingId || !user) return null;
    const res = await fetch("/api/bookings");
    if (!res.ok) return null;
    const list = (await res.json()) as BookingView[];
    const found = list.find((b) => b.id === bookingId) ?? null;
    if (found) {
      setBooking(found);
      setReservation(found);
    }
    return found;
  }, [bookingId, setReservation, user]);

  useEffect(() => {
    if (!userLoaded || !user) return;
    if (!bookingId || !["success", "fail", "cancel"].includes(status)) {
      router.replace("/my-bookings");
      return;
    }
    void refreshBooking();
  }, [userLoaded, user, bookingId, status, router, refreshBooking]);

  // After success, poll briefly — IPN may still be confirming the ticket.
  useEffect(() => {
    if (status !== "success" || !bookingId || !user) return;
    if (booking?.status === "Confirmed") return;
    let cancelled = false;
    let tries = 0;
    setPollNote("Confirming your ticket with the airline…");
    const tick = async () => {
      const found = await refreshBooking();
      if (cancelled) return;
      if (found?.status === "Confirmed") {
        setPollNote("");
        return;
      }
      tries += 1;
      if (tries >= 8) {
        setPollNote("Payment was received. Your ticket may take a moment — check My bookings shortly.");
        return;
      }
      window.setTimeout(() => void tick(), 2000);
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [status, bookingId, user, booking?.status, refreshBooking]);

  if (!userLoaded) {
    return <div className="mx-auto max-w-lg px-4 py-10 text-sm text-slate">Loading payment result…</div>;
  }

  if (!user) {
    const next = `/booking/payment/return?status=${encodeURIComponent(status)}&bookingId=${encodeURIComponent(bookingId)}`;
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center sm:px-6">
        <h1 className="text-2xl font-bold text-navy">Sign in to see your payment result</h1>
        <p className="mt-3 text-sm text-slate">
          Payment finished at the gateway. Sign in with the same account you used to book so we can show the ticket status.
        </p>
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn-primary mt-6 inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold">
          Sign in
        </Link>
        <p className="mt-4 text-xs text-slate">
          Tip: open the site as <span className="font-semibold">http://localhost:3001</span> (not <span className="font-semibold">http://[::]:3001</span>) so your login cookie is kept after payment.
        </p>
      </div>
    );
  }

  if (!bookingId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center">
        <p className="form-error">Missing booking reference on this return link.</p>
        <Link href="/my-bookings" className="btn-primary mt-4 inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold">
          My bookings
        </Link>
      </div>
    );
  }

  const confirmed = booking?.status === "Confirmed";
  const failed = booking?.status === "Failed";

  if (status === "success") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <BookingStepper current={2} deadline={booking?.status === "Pending" ? booking.ticketingDeadline : null} />
        <div className="mb-4 rounded-2xl border border-border bg-card p-6 text-center sm:p-8">
          <p className={`text-sm font-semibold uppercase tracking-wide ${confirmed ? "text-success-text" : "text-warning-text"}`}>
            {confirmed ? "Booking confirmed" : failed ? "Could not complete" : "Payment received"}
          </p>
          <h1 className="mt-2 text-3xl font-bold text-navy">
            {confirmed ? "You’re booked" : failed ? "We couldn’t issue your ticket" : "Thanks — we’re finishing up"}
          </h1>
          <p className="mt-3 text-sm text-slate">
            {confirmed
              ? "Your payment went through and your ticket has been issued."
              : failed
                ? "Your card payment succeeded, but the airline partner could not issue the ticket (often a temporary partner credit limit). We’ve started a refund to the same payment method — it can take a few days to show on your statement. Contact us if you need help."
                : pollNote || "Your payment was submitted. We’re confirming the ticket with the airline."}
          </p>
        </div>
        {booking ? (
          <BookingSummaryCard booking={booking}>
            {confirmed ? <ItineraryActions booking={booking} className="mt-4" /> : null}
          </BookingSummaryCard>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/my-bookings" className="btn-primary inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold">
            My bookings
          </Link>
          <Link href="/" className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-semibold">
            Back to search
          </Link>
        </div>
      </div>
    );
  }

  const title = status === "cancel" ? "Payment cancelled" : "Payment didn’t go through";
  const blurb =
    status === "cancel"
      ? "You left the payment page before finishing. Your seats are still held for a limited time — you can try again."
      : "The payment wasn’t completed. Your seats are still held for a limited time — you can try again.";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <BookingStepper current={2} deadline={booking?.ticketingDeadline ?? null} />
      <div className="mb-4 rounded-2xl border border-border bg-card p-6 text-center sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-warning-text">Awaiting payment</p>
        <h1 className="mt-2 text-3xl font-bold text-navy">{title}</h1>
        <p className="mt-3 text-sm text-slate">{blurb}</p>
        {booking ? (
          <p className="mt-2 text-sm font-semibold text-navy">
            Total {format(booking.total)} · Ref {booking.reference}
          </p>
        ) : null}
        {payError ? (
          <p className="form-error mt-3 rounded-xl px-4 py-3 text-sm" role="alert">
            {payError}
          </p>
        ) : null}
        {bookingId && booking?.status === "Pending" ? (
          <PaymentChoices
            bookingId={bookingId}
            onPaid={(next) => {
              if (next === "Failed") setPayError("The ticket could not be issued, so the wallet charge was returned.");
              void refreshBooking();
            }}
          />
        ) : null}
      </div>
      {booking ? <BookingSummaryCard booking={booking} /> : null}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/my-bookings" className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-semibold">
          My bookings
        </Link>
        <Link href="/" className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-semibold">
          Back to search
        </Link>
      </div>
    </div>
  );
}

/** SSLCommerz browser return: /booking/payment/return?status=success|fail|cancel&bookingId=… */
export default function PaymentReturnPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-10 text-sm text-slate">Loading…</div>}>
      <ReturnInner />
    </Suspense>
  );
}
