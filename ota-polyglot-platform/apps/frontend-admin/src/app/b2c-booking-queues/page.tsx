"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import B2CBookingQueuesContent from "@/components/b2c-booking-queues/B2CBookingQueuesContent";

export default function B2CBookingQueuesPage() {
  return (
    <DashboardShell breadcrumb="B2c Bookings Queues">
      <B2CBookingQueuesContent />
    </DashboardShell>
  );
}
