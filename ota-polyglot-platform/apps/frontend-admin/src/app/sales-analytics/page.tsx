"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import SalesAnalyticsGrid from "@/components/sales-analytics/SalesAnalyticsGrid";

export default function SalesAnalyticsPage() {
  return (
    <DashboardShell breadcrumb="Sales Analytics">
      <div className="space-y-5">
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
          Sales Analytics
        </h1>
        <SalesAnalyticsGrid />
      </div>
    </DashboardShell>
  );
}
