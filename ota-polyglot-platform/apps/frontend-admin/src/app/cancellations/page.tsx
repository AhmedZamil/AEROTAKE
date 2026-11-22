"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import { CancellationQueueContent } from "@/components/admin/CancellationQueue";

export default function CancellationsPage() {
  return (
    <DashboardShell breadcrumb="Post Ticketing > Cancel requests">
      <CancellationQueueContent />
    </DashboardShell>
  );
}
