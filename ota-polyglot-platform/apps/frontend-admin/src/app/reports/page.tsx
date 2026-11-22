"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import ReportsGrid from "@/components/reports/ReportsGrid";

export default function ReportsPage() {
  return (
    <DashboardShell breadcrumb="Reports">
      <div className="space-y-5">
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
          Reports
        </h1>
        <ReportsGrid />
      </div>
    </DashboardShell>
  );
}
