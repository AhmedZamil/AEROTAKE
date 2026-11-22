"use client";

import { useState } from "react";
import {
  Building2,
  Globe2,
  Plane,
  Route,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { dashboardMock } from "@/data/dashboardMock";

const tabs = [
  { id: "airline", label: "Selling Airline", icon: Plane },
  { id: "partner", label: "Selling Partner", icon: Building2 },
  { id: "route", label: "Selling Route", icon: Route },
  { id: "topup", label: "TopUp Partner", icon: WalletCards },
  { id: "supplier", label: "Selling Supplier", icon: Globe2 },
] as const;

type TabId = (typeof tabs)[number]["id"];

export default function SellingTabs() {
  const [active, setActive] = useState<TabId>("airline");
  const [hovered, setHovered] = useState<TabId | null>(null);
  const { dateRange, sellingSegments } = dashboardMock;
  const rows = sellingSegments[active];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          const isHovered = hovered === tab.id;

          return (
            <div
              key={tab.id}
              className="relative"
              onMouseEnter={() => setHovered(tab.id)}
              onMouseLeave={() => setHovered(null)}
            >
              <button
                type="button"
                onClick={() => setActive(tab.id)}
                className={`flex w-full items-center gap-3 rounded-xl border bg-white px-4 py-3.5 text-left shadow-sm transition ${
                  isActive
                    ? "border-brand bg-brand-soft ring-1 ring-brand/30"
                    : "border-slate-200 hover:border-brand/40"
                }`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    isActive
                      ? "bg-brand/15 text-brand"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium text-slate-800">
                  {tab.label}
                </span>
              </button>

              {isHovered && (
                <div className="absolute top-full left-0 z-20 mt-2 w-max max-w-[280px] rounded-lg bg-[#0b1220] px-3.5 py-2 text-xs leading-relaxed text-white shadow-lg">
                  top Selling Segments between date range {dateRange.fromIso} to{" "}
                  {dateRange.toIso}
                  <span className="absolute -top-1.5 left-8 h-3 w-3 rotate-45 bg-[#0b1220]" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row, index) => (
          <div
            key={row.name}
            className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-brand">
              {index + 1}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">
                {row.name}
              </p>
              <p className="text-xs text-slate-500">
                {typeof row.value === "number"
                  ? `${row.value} bookings`
                  : row.value}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
              <TrendingUp className="h-3 w-3" />
              {row.growth}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
