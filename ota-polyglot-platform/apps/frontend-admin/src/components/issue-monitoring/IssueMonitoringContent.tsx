"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpDown,
  ChevronDown,
  Plane,
  Search,
  X,
} from "lucide-react";

const sortOptions = ["Time", "Partner", "Booking ID", "Status"] as const;

type IssueItem = {
  id: string;
  partner: string;
  bookingId: string;
  trackingId: string;
  issue: string;
  status: string;
  time: string;
};

/** Mock issue monitoring rows */
const mockIssues: IssueItem[] = [
  {
    id: "1",
    partner: "SkyLink Travel",
    bookingId: "ATK-92481",
    trackingId: "TRK-88102",
    issue: "PNR sync failed",
    status: "Open",
    time: "12 min ago",
  },
  {
    id: "2",
    partner: "Horizon Holidays",
    bookingId: "ATK-92470",
    trackingId: "TRK-88091",
    issue: "Ticket issuance timeout",
    status: "In Progress",
    time: "28 min ago",
  },
  {
    id: "3",
    partner: "Gulf Connect BD",
    bookingId: "ATK-92455",
    trackingId: "TRK-88074",
    issue: "Fare mismatch on reissue",
    status: "Open",
    time: "1 hour ago",
  },
  {
    id: "4",
    partner: "Dhaka Air Desk",
    bookingId: "ATK-92440",
    trackingId: "TRK-88051",
    issue: "Void request pending supplier",
    status: "Waiting",
    time: "2 hours ago",
  },
  {
    id: "5",
    partner: "Nomad Tours",
    bookingId: "ATK-92422",
    trackingId: "TRK-88033",
    issue: "Partial payment not reflected",
    status: "Resolved",
    time: "3 hours ago",
  },
  {
    id: "6",
    partner: "AeroNest Tours",
    bookingId: "ATK-92410",
    trackingId: "TRK-88018",
    issue: "SSR meal not confirmed",
    status: "Open",
    time: "5 hours ago",
  },
  {
    id: "7",
    partner: "SkyLink Travel",
    bookingId: "ATK-92398",
    trackingId: "TRK-87990",
    issue: "Refund amount mismatch",
    status: "In Progress",
    time: "Yesterday",
  },
  {
    id: "8",
    partner: "Horizon Holidays",
    bookingId: "ATK-92381",
    trackingId: "TRK-87955",
    issue: "Hold booking expired",
    status: "Closed",
    time: "Yesterday",
  },
];

export default function IssueMonitoringPageContent() {
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<(typeof sortOptions)[number]>("Time");
  const [sortOpen, setSortOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = [...mockIssues];
    if (q) {
      rows = rows.filter(
        (r) =>
          r.partner.toLowerCase().includes(q) ||
          r.bookingId.toLowerCase().includes(q) ||
          r.trackingId.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [query]);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
        Issue Monitoring
      </h1>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-2xl">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by partner name, booking ID, tracking ID..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pr-4 pl-10 text-sm text-slate-700 outline-none transition focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15"
            />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm text-slate-500">Sort by:</span>
            <div className="relative">
              <button
                type="button"
                onClick={() => setSortOpen((v) => !v)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 transition hover:border-brand/40"
              >
                {sortBy}
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>
              {sortOpen && (
                <div className="absolute top-full right-0 z-20 mt-1 min-w-[150px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                  {sortOptions.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setSortBy(opt);
                        setSortOpen(false);
                      }}
                      className={`block w-full px-3.5 py-2.5 text-left text-sm transition hover:bg-brand-soft ${
                        sortBy === opt
                          ? "font-semibold text-brand"
                          : "text-slate-700"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-brand/40 hover:text-brand"
              aria-label="Toggle sort order"
            >
              <ArrowUpDown className="h-4 w-4" />
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex min-h-[380px] flex-col items-center justify-center px-4 py-16 text-center">
            <div className="relative mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-slate-100">
              <Plane className="h-9 w-9 text-slate-300" />
              <span className="absolute -right-0.5 -bottom-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-slate-500 ring-4 ring-white">
                <X className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
            </div>
            <p className="text-base font-semibold text-slate-900">
              No data found
            </p>
            <p className="mt-1 text-sm text-slate-400">No data available</p>
          </div>
        ) : (
          <div className="table-scroll mt-5">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {[
                    "Partner",
                    "Booking ID",
                    "Tracking ID",
                    "Issue",
                    "Status",
                    "Time",
                  ].map((col) => (
                    <th
                      key={col}
                      className="px-3 py-3 text-xs font-semibold tracking-wide text-slate-500 uppercase"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-50 hover:bg-slate-50/80"
                  >
                    <td className="px-3 py-3.5 font-medium text-slate-800">
                      {row.partner}
                    </td>
                    <td className="px-3 py-3.5 text-slate-600">
                      {row.bookingId}
                    </td>
                    <td className="px-3 py-3.5 text-slate-600">
                      {row.trackingId}
                    </td>
                    <td className="px-3 py-3.5 text-slate-600">{row.issue}</td>
                    <td className="px-3 py-3.5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          row.status === "Open"
                            ? "bg-rose-50 text-rose-600"
                            : row.status === "In Progress"
                              ? "bg-amber-50 text-amber-700"
                              : row.status === "Waiting"
                                ? "bg-sky-50 text-sky-700"
                                : row.status === "Resolved"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-slate-600">{row.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
