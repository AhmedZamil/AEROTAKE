"use client";

import { CalendarDays } from "lucide-react";
import { fetchSession } from "@/lib/auth";
import { dashboardMock } from "@/data/dashboardMock";
import DashboardShell from "@/components/dashboard/DashboardShell";
import TopStats from "@/components/dashboard/TopStats";
import MetricGrid from "@/components/dashboard/MetricGrid";
import ChartsSection from "@/components/dashboard/ChartsSection";
import SellingTabs from "@/components/dashboard/SellingTabs";
import RecentOrders from "@/components/dashboard/RecentOrders";
import TransactionsAndMap from "@/components/dashboard/TransactionsAndMap";
import RecentActivity from "@/components/dashboard/RecentActivity";
import { useEffect, useState } from "react";

export default function DashboardPage() {
  const [name, setName] = useState("Admin");

  useEffect(() => {
    fetchSession().then((user) => {
      if (user?.name) setName(user.name);
    });
  }, []);

  return (
    <DashboardShell breadcrumb="Dashboard">
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
            Welcome back, {name} 👋
          </h1>
          <button
            type="button"
            className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-600 shadow-sm transition hover:border-brand/40"
          >
            <CalendarDays className="h-4 w-4 text-brand" />
            {dashboardMock.dateRange.from} - {dashboardMock.dateRange.to}
          </button>
        </div>

        <TopStats />
        <MetricGrid />
        <ChartsSection />

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            Top Growths
          </h2>
          <SellingTabs />
        </div>

        <RecentOrders />
        <TransactionsAndMap />
        <RecentActivity />
      </div>
    </DashboardShell>
  );
}
