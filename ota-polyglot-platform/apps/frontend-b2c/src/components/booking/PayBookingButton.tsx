"use client";

import type { BookingView } from "@/lib/booking-types";
import PaymentChoices from "@/components/booking/PaymentChoices";

/** Pay a Pending hold from My bookings. Card or Aerotake wallet. */
export default function PayBookingButton({ booking, onPaid, className = "" }: { booking: BookingView; onPaid?: () => void; className?: string }) {
  if (booking.status !== "Pending") return null;
  if (booking.ticketingDeadline && new Date(booking.ticketingDeadline).getTime() < Date.now()) return null;

  return (
    <div className={className}>
      <PaymentChoices bookingId={booking.id} onPaid={() => onPaid?.()} />
    </div>
  );
}
