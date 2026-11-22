"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import PartnerSearchPackageContent from "@/components/partners/PartnerSearchPackageContent";

export default function PartnerSearchPackagePage() {
  return (
    <DashboardShell breadcrumb="Partners > Search Package">
      <PartnerSearchPackageContent />
    </DashboardShell>
  );
}
