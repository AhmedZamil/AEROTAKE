"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import BookingListContent from "@/components/booking-list/BookingListContent";

export default function BookingListPage() {
  return (
    <DashboardShell breadcrumb="Bookings">
      <BookingListContent />
    </DashboardShell>
  );
}
