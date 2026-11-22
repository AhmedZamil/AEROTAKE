"use client";

import { useMemo, useState } from "react";
import { ChevronDown, RotateCcw, Search } from "lucide-react";
import {
  voidRefundMock,
  voidRefundPartners,
  type VoidRefundItem,
} from "@/data/voidRefundMock";

function statusClass(status: VoidRefundItem["status"]) {
  switch (status) {
    case "Pending":
      return "bg-amber-50 text-amber-700";
    case "In Progress":
      return "bg-sky-50 text-sky-700";
    case "Approved":
      return "bg-emerald-50 text-emerald-700";
    case "Completed":
      return "bg-violet-50 text-violet-700";
    case "Rejected":
      return "bg-rose-50 text-rose-600";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function typeClass(type: VoidRefundItem["type"]) {
  return type === "Void"
    ? "bg-orange-50 text-orange-700"
    : "bg-brand-soft text-brand";
}

export default function VoidRefundContent() {
  const [partner, setPartner] = useState("Partner");
  const [typeFilter, setTypeFilter] = useState("Any");
  const [statusFilter, setStatusFilter] = useState("Any");
  const [applied, setApplied] = useState({
    partner: "Partner",
    typeFilter: "Any",
    statusFilter: "Any",
  });

  const filtered = useMemo(() => {
    return voidRefundMock.filter((row) => {
      if (applied.partner !== "Partner" && row.partner !== applied.partner) {
        return false;
      }
      if (applied.typeFilter !== "Any" && row.type !== applied.typeFilter) {
        return false;
      }
      if (
        applied.statusFilter !== "Any" &&
        row.status !== applied.statusFilter
      ) {
        return false;
      }
      return true;
    });
  }, [applied]);

  function handleSearch() {
    setApplied({ partner, typeFilter, statusFilter });
  }

  function handleReset() {
    setPartner("Partner");
    setTypeFilter("Any");
    setStatusFilter("Any");
    setApplied({
      partner: "Partner",
      typeFilter: "Any",
      statusFilter: "Any",
    });
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
        Void/Refund List
      </h1>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-[180px] flex-1">
            <select
              value={partner}
              onChange={(e) => setPartner(e.target.value)}
              className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-9 pl-3.5 text-sm text-slate-700 outline-none transition focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15"
            >
              {voidRefundPartners.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>

          <div className="relative min-w-[140px] flex-1">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-9 pl-3.5 text-sm text-slate-700 outline-none transition focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15"
            >
              <option>Any</option>
              <option>Void</option>
              <option>Refund</option>
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>

          <div className="relative min-w-[140px] flex-1">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-9 pl-3.5 text-sm text-slate-700 outline-none transition focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15"
            >
              <option>Any</option>
              <option>Pending</option>
              <option>In Progress</option>
              <option>Approved</option>
              <option>Completed</option>
              <option>Rejected</option>
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-500 transition hover:bg-rose-100"
              aria-label="Reset filters"
              title="Reset"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleSearch}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
            >
              <Search className="h-4 w-4" />
              Search
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        {filtered.length === 0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 text-center">
            <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Search className="h-7 w-7" />
            </div>
            <p className="text-base font-semibold text-slate-900">
              No results found
            </p>
            <p className="text-sm text-slate-400">
              No void or refund records found.
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {[
                    "Date",
                    "Booking ID",
                    "Passenger",
                    "Partner",
                    "Type",
                    "Airline",
                    "PNR",
                    "Amount",
                    "Status",
                  ].map((col) => (
                    <th
                      key={col}
                      className="px-3 py-3 text-xs font-semibold tracking-wide whitespace-nowrap text-slate-500 uppercase"
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
                    className="border-b border-slate-50 transition hover:bg-slate-50/80"
                  >
                    <td className="whitespace-nowrap px-3 py-3.5 text-slate-600">
                      {row.date}
                    </td>
                    <td className="px-3 py-3.5 font-semibold text-slate-800">
                      {row.bookingId}
                    </td>
                    <td
                      title={row.passenger}
                      className="max-w-[140px] truncate px-3 py-3.5 text-slate-700"
                    >
                      {row.passenger}
                    </td>
                    <td
                      title={row.partner}
                      className="max-w-[150px] truncate px-3 py-3.5 text-slate-700"
                    >
                      {row.partner}
                    </td>
                    <td className="px-3 py-3.5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${typeClass(row.type)}`}
                      >
                        {row.type}
                      </span>
                    </td>
                    <td
                      title={row.airline}
                      className="max-w-[150px] truncate px-3 py-3.5 text-slate-700"
                    >
                      {row.airline}
                    </td>
                    <td className="px-3 py-3.5 text-slate-700">{row.pnr}</td>
                    <td className="whitespace-nowrap px-3 py-3.5 font-semibold text-slate-900">
                      {row.amount}
                    </td>
                    <td className="px-3 py-3.5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(row.status)}`}
                      >
                        {row.status}
                      </span>
                    </td>
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
