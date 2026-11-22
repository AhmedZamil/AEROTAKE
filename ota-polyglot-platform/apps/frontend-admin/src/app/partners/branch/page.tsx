"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import PartnerBranchContent from "@/components/partners/PartnerBranchContent";

export default function PartnerBranchPage() {
  return (
    <DashboardShell breadcrumb="Partners > Branch">
      <PartnerBranchContent />
    </DashboardShell>
  );
}
