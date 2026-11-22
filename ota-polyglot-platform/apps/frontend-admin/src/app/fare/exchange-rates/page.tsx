"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import { ExchangeRatesContent } from "@/components/admin/LiveScreen";

export default function ExchangeRatesPage() {
  return (
    <DashboardShell breadcrumb="Fare Management > Exchange Rate">
      <ExchangeRatesContent />
    </DashboardShell>
  );
}
