"use client";

import {
  Download,
  Move,
  ZoomIn,
  ZoomOut,
  CircleDollarSign,
  Ticket,
  TrendingUp,
  CalendarDays,
  XCircle,
  PauseCircle,
  Target,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { dashboardMock } from "@/data/dashboardMock";

export default function ChartsSection() {
  const { chart, finance } = dashboardMock;

  const leftMetrics = [
    {
      label: "Total TopUp",
      value: finance.totalTopUp,
      icon: CircleDollarSign,
      color: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Total Ticket Order",
      value: String(finance.totalTicketOrder),
      icon: Ticket,
      color: "bg-violet-50 text-violet-600",
    },
    {
      label: "Average Revenue",
      value: finance.averageRevenue,
      icon: TrendingUp,
      color: "bg-sky-50 text-sky-600",
    },
    {
      label: "Last Month Revenue",
      value: finance.lastMonthRevenue,
      icon: CalendarDays,
      color: "bg-amber-50 text-amber-600",
    },
  ];

  const rightMetrics = [
    {
      label: "Total Failed Booking",
      value: String(finance.totalFailedBooking),
      icon: XCircle,
      color: "bg-rose-50 text-rose-500",
    },
    {
      label: "HOLD Booking (Flight/Hotel)",
      value: String(finance.holdBooking),
      icon: PauseCircle,
      color: "bg-orange-50 text-orange-500",
    },
    {
      label: "Estimate Monthly Revenue",
      value: finance.estimateMonthlyRevenue,
      icon: Target,
      color: "bg-indigo-50 text-indigo-600",
    },
  ];

  // Pair left/right per row so lines stay aligned (4 left + 3 right)
  const metricRows = leftMetrics.map((left, i) => ({
    left,
    right: rightMetrics[i] ?? null,
  }));

  return (
    <div className="grid items-stretch gap-3 xl:grid-cols-[1.2fr_1fr]">
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs font-medium">
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="h-2 w-2 rounded-full bg-brand" />
              Search
            </span>
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Bookings
            </span>
          </div>
          <div className="flex items-center gap-0.5 text-slate-400">
            {[ZoomIn, ZoomOut, Move, Download].map((Icon, i) => (
              <button
                key={i}
                type="button"
                className="rounded-md p-1 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        </div>

        <div className="h-[220px] w-full sm:h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={[...chart]}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={{ stroke: "#e2e8f0" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  fontSize: 12,
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="Search"
                stroke="#FC553B"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "#FC553B" }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="Bookings"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "#10b981" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-3 py-5 shadow-sm sm:px-4 sm:py-6">
        <div className="flex flex-col gap-3">
          {metricRows.map((row) => (
            <div
              key={row.left.label}
              className="grid grid-cols-2 items-center gap-x-4"
            >
              <MetricRow {...row.left} />
              {row.right ? <MetricRow {...row.right} /> : <div />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 py-1">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${color}`}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <p
          title={value}
          className="truncate text-sm font-bold leading-tight text-slate-900"
        >
          {value}
        </p>
        <p
          title={label}
          className="mt-0.5 truncate text-[11px] leading-tight text-slate-500"
        >
          {label}
        </p>
      </div>
    </div>
  );
}
