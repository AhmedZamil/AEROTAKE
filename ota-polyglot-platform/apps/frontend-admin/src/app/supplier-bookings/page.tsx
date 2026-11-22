"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import SupplierBookingsContent from "@/components/supplier-bookings/SupplierBookingsContent";

export default function SupplierBookingsPage() {
  return (
    <DashboardShell breadcrumb="Supplier Bookings">
      <SupplierBookingsContent />
    </DashboardShell>
  );
}
