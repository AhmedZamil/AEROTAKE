"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import PartnerEmailPreferenceContent from "@/components/partners/PartnerEmailPreferenceContent";

export default function PartnerEmailPreferencePage() {
  return (
    <DashboardShell breadcrumb="Partners > Email Alert Preferences">
      <PartnerEmailPreferenceContent />
    </DashboardShell>
  );
}
