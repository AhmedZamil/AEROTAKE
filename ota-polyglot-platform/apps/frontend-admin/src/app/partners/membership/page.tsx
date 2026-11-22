"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import PartnerMembershipContent from "@/components/partners/PartnerMembershipContent";

export default function PartnerMembershipPage() {
  return (
    <DashboardShell breadcrumb="Partners > Membership">
      <PartnerMembershipContent />
    </DashboardShell>
  );
}
