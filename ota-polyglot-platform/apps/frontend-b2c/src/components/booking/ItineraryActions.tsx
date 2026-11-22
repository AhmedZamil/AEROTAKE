"use client";

import Link from "next/link";
import type { BookingView } from "@/lib/booking-types";
import { cacheItineraryBooking, itineraryHref } from "@/lib/itinerary-access";

/** Entry point to the print-ready e-ticket — only for issued tickets. */
export default function ItineraryActions({
  booking,
  claimToken,
  className = "",
}: {
  booking: BookingView;
  claimToken?: string | null;
  className?: string;
}) {
  if (booking.status !== "Confirmed") return null;

  return (
    <Link
      href={itineraryHref(booking.id, claimToken)}
      onClick={() => cacheItineraryBooking(booking)}
      className={`inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border bg-card text-sm font-semibold text-navy hover:bg-bg ${className}`}
    >
      View / print e-ticket
    </Link>
  );
}
