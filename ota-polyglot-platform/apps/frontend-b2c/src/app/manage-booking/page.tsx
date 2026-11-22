"use client";

import { useEffect, useState } from "react";
import BookingSummaryCard from "@/components/booking/BookingSummaryCard";
import CancelBookingControls from "@/components/booking/CancelBookingControls";
import ItineraryActions from "@/components/booking/ItineraryActions";
import { useApp } from "@/context/AppProviders";
import type { BookingView } from "@/lib/booking-types";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";

type Status = "idle" | "loading" | "sent" | "claimed";

async function post(path: string, body: unknown) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { res, data: await res.json().catch(() => ({})) };
}

/**
 * "Manage booking" for someone without an account: open the emailed link (the token rides in the URL fragment, so it never reaches a log or a
 * Referer header), or give the booking reference and a traveller's surname. Every failure reads the same, so it cannot be used to find out
 * which bookings exist.
 */
export default function ManageBookingPage() {
  const { user } = useApp();
  const [reference, setReference] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [booking, setBooking] = useState<BookingView | null>(null);
  const [claimToken, setClaimToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [linkSent, setLinkSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    const m = /(?:^|[#&])claim=([^&]+)/.exec(window.location.hash);
    if (!m) return;
    const token = decodeURIComponent(m[1]!);
    void Promise.resolve().then(() => {
      setClaimToken(token);
      setStatus("loading");
    });
    void post("/api/guest/access", { claimToken: token }).then(({ res, data }) => {
      setStatus("idle");
      if (res.ok) setBooking(data as BookingView);
      else setError(res.status === 429 ? "Too many attempts. Please wait a moment." : "This link is no longer valid. Use your booking reference below, or ask for a new link.");
    });
  }, []);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBooking(null);
    if (!reference.trim() || !lastName.trim()) return setError("Enter your booking reference and a traveller's last name.");
    setStatus("loading");
    const { res, data } = await post("/api/guest/lookup", { reference: reference.trim(), lastName: lastName.trim() });
    setStatus("idle");
    if (res.ok) setBooking(data as BookingView);
    else setError(res.status === 429 ? "Too many attempts. Please wait a while and try again." : "We couldn't find a booking with those details.");
  };

  const sendLink = async () => {
    if (sending) return;
    if (!reference.trim() || !email.trim()) return setError("Enter the booking reference and the email you booked with.");
    setError("");
    setSending(true);
    try {
      const { res } = await post("/api/guest/send-link", { reference: reference.trim(), email: email.trim() });
      if (res.status === 429) return setError("Too many requests. Please wait a while.");
      setLinkSent(true); // core always answers the same way, whether or not a booking matched
    } finally {
      setSending(false);
    }
  };

  const addToAccount = async () => {
    if (!claimToken || claiming) return;
    setClaiming(true);
    try {
      const { res } = await post("/api/bookings/claim", { claimToken });
      if (res.ok) setStatus("claimed");
      else setError("We couldn't add this booking to your account.");
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:px-6">
      <h1 className="mb-2 text-3xl font-bold text-navy">Manage booking</h1>
      <p className="mb-6 text-sm text-slate">Open the link we emailed you, or find your booking with its reference and a traveller&apos;s last name.</p>

      {booking ? (
        <BookingSummaryCard booking={booking}>
          <ItineraryActions booking={booking} claimToken={claimToken} className="mt-4" />
          <CancelBookingControls
            booking={booking}
            onUpdated={setBooking}
            guestProof={{
              claimToken,
              reference: reference.trim() || booking.reference,
              lastName: lastName.trim() || booking.travelers[0]?.lastName,
            }}
          />
          {claimToken && user && status !== "claimed" ? (
            <button type="button" onClick={addToAccount} disabled={claiming} aria-busy={claiming} className="btn-primary mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl">
              {claiming ? <ButtonSpinner /> : null}
              Add this booking to my account
            </button>
          ) : null}
          {status === "claimed" ? <p className="mt-4 text-sm font-semibold text-success-text">Added to your account.</p> : null}
        </BookingSummaryCard>
      ) : (
        <>
          <form className="space-y-4 rounded-2xl border border-border bg-card p-5" onSubmit={lookup}>
            <div>
              <label htmlFor="ref" className="mb-1 block text-sm font-semibold">
                Booking reference
              </label>
              <input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} className="input-field h-12 w-full rounded-xl px-3 text-base uppercase" />
            </div>
            <div>
              <label htmlFor="lastName" className="mb-1 block text-sm font-semibold">
                Last name
              </label>
              <input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} className="input-field h-12 w-full rounded-xl px-3 text-base" />
            </div>
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <button type="submit" disabled={status === "loading"} aria-busy={status === "loading"} className="btn-primary inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl">
              {status === "loading" ? <ButtonSpinner /> : null}
              {status === "loading" ? "Looking…" : "Find booking"}
            </button>
          </form>

          <div className="mt-6 space-y-3 rounded-2xl border border-border bg-card p-5">
            <p className="text-sm font-semibold text-navy">Lost the email?</p>
            <p className="text-xs text-slate">Enter the booking reference above and the email address you booked with, and we will send the link again.</p>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email used for the booking" className="input-field h-12 w-full rounded-xl px-3 text-base" />
            <button type="button" onClick={sendLink} disabled={sending} aria-busy={sending} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold text-navy disabled:opacity-60">
              {sending ? <ButtonSpinner /> : null}
              Email me the link
            </button>
            {linkSent ? <p className="text-sm text-success-text">If a booking matches, we have emailed a link to that address.</p> : null}
          </div>
        </>
      )}
    </div>
  );
}
