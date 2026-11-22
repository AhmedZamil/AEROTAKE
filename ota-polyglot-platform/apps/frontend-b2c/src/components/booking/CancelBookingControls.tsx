"use client";

import { useState } from "react";
import type { BookingView } from "@/lib/booking-types";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";

type Props = {
  booking: BookingView;
  /** Called with the updated booking view after a successful cancel/request. */
  onUpdated: (next: BookingView) => void;
  /** Guest manage-booking proof — omit when signed in (customer cancel uses the session). */
  guestProof?: { claimToken?: string | null; reference?: string; lastName?: string };
};

/**
 * P5-20: show cancel when core says it is allowed; otherwise show why not (or an open request).
 * Never a silent button — if cancel is blocked, the reason is visible.
 */
export default function CancelBookingControls({ booking, onUpdated, guestProof }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const requestStatus = booking.cancelRequestStatus;
  if (requestStatus === "Requested") {
    return (
      <p className="mt-4 rounded-xl bg-warning-bg px-3 py-2 text-sm text-warning-text" role="status">
        Cancellation request received — our team is reviewing it.
      </p>
    );
  }
  if (requestStatus === "Completed" || booking.status === "Cancelled") {
    return (
      <p className="mt-4 text-sm font-semibold text-slate" role="status">
        This booking is cancelled.
      </p>
    );
  }
  if (!booking.canRequestCancel) {
    if (!booking.cancelBlockedReason) return null;
    return (
      <p className="mt-4 text-sm text-slate" role="status">
        {booking.cancelBlockedReason}
      </p>
    );
  }

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const path = guestProof ? "/api/guest/cancel" : `/api/bookings/${booking.id}/cancel`;
      const body = guestProof
        ? {
            bookingId: booking.id,
            claimToken: guestProof.claimToken || undefined,
            reference: guestProof.reference || undefined,
            lastName: guestProof.lastName || undefined,
            reason: reason.trim() || undefined,
          }
        : { reason: reason.trim() || undefined };
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as BookingView & { message?: string };
      if (!res.ok) {
        setError(data.message || (res.status === 429 ? "Too many attempts. Please wait a moment." : "We couldn't cancel this booking."));
        return;
      }
      onUpdated(data);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-4 min-h-11 w-full rounded-xl border border-border text-sm font-semibold text-navy"
      >
        Cancel booking
      </button>
    );
  }

  const confirmedTicket = booking.status === "Confirmed";
  return (
    <div className="mt-4 space-y-3 rounded-xl border border-border bg-bg p-3">
      <p className="text-sm text-navy">
        {confirmedTicket
          ? "This ticket is already issued. We will send your cancellation request to our team — a refund is not automatic."
          : "This will release the hold. If you already paid and the ticket was not issued, we will refund through the payment gateway."}
      </p>
      <label className="block text-xs font-semibold text-slate" htmlFor={`cancel-note-${booking.id}`}>
        Reason (optional)
      </label>
      <textarea
        id={`cancel-note-${booking.id}`}
        value={reason}
        onChange={(e) => setReason(e.target.value.slice(0, 500))}
        rows={2}
        className="input-field w-full rounded-xl px-3 py-2 text-sm"
        placeholder="Optional note for our team"
      />
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="button" disabled={busy} aria-busy={busy} onClick={() => void submit()} className="btn-primary inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm">
          {busy ? <ButtonSpinner /> : null}
          {busy ? "Working…" : confirmedTicket ? "Submit request" : "Confirm cancel"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setConfirming(false);
            setError("");
          }}
          className="min-h-11 flex-1 rounded-xl border border-border text-sm font-semibold text-navy"
        >
          Keep booking
        </button>
      </div>
    </div>
  );
}
