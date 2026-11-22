"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import TicketItineraryDocument from "@/components/booking/TicketItineraryDocument";
import type { BookingView } from "@/lib/booking-types";
import { claimTokenFromHash, readCachedItineraryBooking } from "@/lib/itinerary-access";

type LoadState = "loading" | "ready" | "missing" | "error";

/**
 * P5-21: print-ready e-ticket / itinerary. Open from confirmation, My bookings, Manage booking,
 * or the ticket email (#claim=…). Use the browser Print dialog to save a PDF.
 */
export default function BookingItineraryPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [booking, setBooking] = useState<BookingView | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    if (!id || !/^[0-9a-fA-F-]{36}$/.test(id)) {
      setState("missing");
      return;
    }

    let cancelled = false;

    const load = async () => {
      const cached = readCachedItineraryBooking(id);
      if (cached && cached.id === id) {
        if (!cancelled) {
          setBooking(cached);
          setState("ready");
        }
        // Still refresh from the network when we can.
      }

      const claim = claimTokenFromHash();
      try {
        if (claim) {
          const res = await fetch("/api/guest/access", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ claimToken: claim }),
          });
          if (!res.ok) {
            if (!cancelled && !cached) setState(res.status === 404 ? "missing" : "error");
            return;
          }
          const data = (await res.json()) as BookingView;
          if (data.id !== id) {
            if (!cancelled && !cached) setState("missing");
            return;
          }
          if (!cancelled) {
            setBooking(data);
            setState("ready");
          }
          return;
        }

        const res = await fetch("/api/bookings", { cache: "no-store" });
        if (res.status === 401) {
          if (!cancelled && !cached) setState("missing");
          return;
        }
        if (!res.ok) {
          if (!cancelled && !cached) setState("error");
          return;
        }
        const list = (await res.json()) as BookingView[];
        const found = list.find((b) => b.id === id) ?? null;
        if (!cancelled) {
          if (found) {
            setBooking(found);
            setState("ready");
          } else if (!cached) {
            setState("missing");
          }
        }
      } catch {
        if (!cancelled && !cached) setState("error");
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (booking?.reference) {
      document.title = `E-ticket ${booking.reference} — Aerotake`;
    }
  }, [booking?.reference]);

  if (state === "loading") {
    return <div className="mx-auto max-w-2xl px-4 py-10 text-sm text-slate">Loading your e-ticket…</div>;
  }

  if (state === "missing" || !booking) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center sm:px-6">
        <h1 className="text-2xl font-bold text-navy">E-ticket not found</h1>
        <p className="mt-3 text-sm text-slate">
          Sign in to open it from My bookings, or use Manage booking with your reference and last name. If you have an emailed link,
          open that link again.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/my-bookings" className="btn-primary inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold">
            My bookings
          </Link>
          <Link href="/manage-booking" className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-semibold">
            Manage booking
          </Link>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center">
        <p className="form-error">We couldn’t load this e-ticket. Please try again.</p>
      </div>
    );
  }

  const notIssued = booking.status !== "Confirmed";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">{notIssued ? "Booking summary" : "Your e-ticket"}</h1>
          <p className="mt-1 text-sm text-slate">
            {notIssued
              ? "Your ticket is not issued yet. You can still print this summary."
              : "Print this page or choose Save as PDF in your browser’s print dialog."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="btn-primary min-h-11 rounded-full px-5 text-sm font-semibold"
          >
            Print / Save PDF
          </button>
          <Link
            href="/my-bookings"
            className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-semibold"
          >
            My bookings
          </Link>
        </div>
      </div>

      {notIssued ? (
        <p className="no-print mb-4 rounded-xl bg-warning-bg px-4 py-3 text-sm text-warning-text" role="status">
          This booking is {booking.status === "Pending" ? "still awaiting payment or ticketing" : booking.status}. Airlines will not
          accept it as an issued ticket until status is Confirmed.
        </p>
      ) : null}

      <TicketItineraryDocument booking={booking} />
    </div>
  );
}
