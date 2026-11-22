"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import PartnerApiLogsContent from "@/components/partners/PartnerApiLogsContent";

export default function PartnerApiLogsPage() {
  return (
    <DashboardShell breadcrumb="Partners > API Logs">
      <PartnerApiLogsContent />
    </DashboardShell>
  );
}
