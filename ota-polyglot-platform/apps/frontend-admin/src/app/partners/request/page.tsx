"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import PartnerRequestContent from "@/components/partners/PartnerRequestContent";

export default function PartnerRequestPage() {
  return (
    <DashboardShell breadcrumb="Partners > Request">
      <PartnerRequestContent />
    </DashboardShell>
  );
}
