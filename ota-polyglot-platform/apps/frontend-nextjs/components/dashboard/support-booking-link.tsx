"use client";

import Link from "next/link";
import { primeSupportPrefill, supportHrefForBooking } from "@/data/support-tickets";

export default function SupportBookingLink({
  bookingId,
  pnr,
  className,
  children,
}: {
  bookingId: string;
  pnr?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={supportHrefForBooking(bookingId, pnr)}
      onClick={() => primeSupportPrefill(bookingId, pnr)}
      className={className}
    >
      {children}
    </Link>
  );
}
