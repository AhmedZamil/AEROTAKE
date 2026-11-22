"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import PartnerModulesContent from "@/components/partners/PartnerModulesContent";

export default function PartnerModulesPage() {
  return (
    <DashboardShell breadcrumb="Partners > Partner Modules">
      <PartnerModulesContent />
    </DashboardShell>
  );
}
