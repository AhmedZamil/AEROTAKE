"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import BookingSummaryCard from "@/components/booking/BookingSummaryCard";
import CancelBookingControls from "@/components/booking/CancelBookingControls";
import ItineraryActions from "@/components/booking/ItineraryActions";
import PayBookingButton from "@/components/booking/PayBookingButton";
import { useApp } from "@/context/AppProviders";
import type { BookingView } from "@/lib/booking-types";

export default function MyBookingsPage() {
  const { user, userLoaded } = useApp();
  const [resent, setResent] = useState(false);
  const [bookings, setBookings] = useState<BookingView[] | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!userLoaded || !user) return;
    void fetch("/api/bookings", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        setBookings((await res.json()) as BookingView[]);
      })
      .catch(() => setError("We couldn't load your bookings. Please try again."));
  }, [user, userLoaded, reload]);

  if (!userLoaded) return <div className="mx-auto max-w-4xl px-4 py-10 text-sm text-slate">Loading…</div>;
  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center sm:px-6">
        <h1 className="mb-3 text-3xl font-bold text-navy">My bookings</h1>
        <p className="mb-5 text-sm text-slate">Sign in to see the bookings on your account. Have a reference from an earlier booking? Use Manage booking.</p>
        <div className="flex justify-center gap-3">
          <Link href="/login" className="btn-primary inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold">
            Sign in
          </Link>
          <Link href="/manage-booking" className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-semibold">
            Manage booking
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="mb-6 text-3xl font-bold text-navy">My bookings</h1>
      {!user.emailVerified ? (
        <div className="mb-6 rounded-xl border border-warning-text/30 bg-warning-bg px-4 py-3 text-sm text-warning-text" role="status">
          <p className="font-semibold">Confirm your email address</p>
          <p className="mt-1">
            We sent a link to {user.email}. Until you open it, bookings you made as a guest with this address are not added to your account.
          </p>
          {resent ? (
            <p className="mt-2 font-semibold">Sent — check your inbox.</p>
          ) : (
            <button
              type="button"
              className="mt-2 font-semibold underline"
              onClick={() => void fetch("/api/auth/resend-verification", { method: "POST" }).then(() => setResent(true))}
            >
              Send it again
            </button>
          )}
        </div>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      {bookings === null && !error ? <p className="text-sm text-slate">Loading…</p> : null}
      {bookings?.length === 0 ? <p className="text-sm text-slate">You have no bookings yet.</p> : null}
      <div className="space-y-4">
        {bookings?.map((b) => (
          <BookingSummaryCard key={b.id} booking={b}>
            <PayBookingButton booking={b} onPaid={() => setReload((n) => n + 1)} />
            <ItineraryActions booking={b} className="mt-4" />
            <CancelBookingControls
              booking={b}
              onUpdated={(next) => setBookings((all) => (all ?? []).map((row) => (row.id === next.id ? next : row)))}
            />
          </BookingSummaryCard>
        ))}
      </div>
    </div>
  );
}
