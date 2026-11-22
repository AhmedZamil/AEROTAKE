"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import { MarkupRulesContent } from "@/components/admin/LiveScreen";

export default function MarkupPage() {
  return (
    <DashboardShell breadcrumb="Fare Management > Dynamic Markup">
      <MarkupRulesContent />
    </DashboardShell>
  );
}
