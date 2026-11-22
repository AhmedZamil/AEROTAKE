"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import IssueMonitoringContent from "@/components/issue-monitoring/IssueMonitoringContent";

export default function IssueMonitoringPage() {
  return (
    <DashboardShell breadcrumb="Issue Monitoring">
      <IssueMonitoringContent />
    </DashboardShell>
  );
}
