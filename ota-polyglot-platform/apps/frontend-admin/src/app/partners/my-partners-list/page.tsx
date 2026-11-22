"use client";

import { AgenciesContent } from "@/components/admin/LiveScreen";
import DashboardShell from "@/components/dashboard/DashboardShell";

export default function MyPartnersListPage() {
  return (
    <DashboardShell breadcrumb="Partners > Agencies">
      <AgenciesContent />
    </DashboardShell>
  );
}
