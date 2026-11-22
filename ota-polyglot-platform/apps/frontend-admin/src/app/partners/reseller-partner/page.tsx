"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import ResellerPartnerContent from "@/components/partners/ResellerPartnerContent";

export default function ResellerPartnerPage() {
  return (
    <DashboardShell breadcrumb="Partners > Reseller Partner">
      <ResellerPartnerContent />
    </DashboardShell>
  );
}
