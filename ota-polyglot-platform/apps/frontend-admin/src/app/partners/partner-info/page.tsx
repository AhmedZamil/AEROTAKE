"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import PartnerInfoContent from "@/components/partners/PartnerInfoContent";

export default function PartnerInfoPage() {
  return (
    <DashboardShell breadcrumb="Partners > Partner Info">
      <PartnerInfoContent />
    </DashboardShell>
  );
}
