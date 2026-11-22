"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import VoidRefundContent from "@/components/void-refund/VoidRefundContent";

export default function VoidRefundPage() {
  return (
    <DashboardShell breadcrumb="Post Ticketing > Void Refund">
      <VoidRefundContent />
    </DashboardShell>
  );
}
