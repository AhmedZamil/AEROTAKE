"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  Loader2,
  RotateCcw,
  Search,
} from "lucide-react";
import {
  supplierBookingMock,
  suppliers,
  type SupplierBookingItem,
} from "@/data/supplierBookingMock";

function statusClass(status: SupplierBookingItem["status"]) {
  switch (status) {
    case "Confirmed":
    case "Ticketed":
      return "bg-emerald-50 text-emerald-700";
    case "Pending":
      return "bg-amber-50 text-amber-700";
    case "Hold":
      return "bg-orange-50 text-orange-700";
    case "Failed":
      return "bg-rose-50 text-rose-600";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export default function SupplierBookingsContent() {
  const [supplier, setSupplier] = useState<(typeof suppliers)[number]>(
    "All Suppliers",
  );
  const [dateRange, setDateRange] = useState("");
  const [appliedSupplier, setAppliedSupplier] =
    useState<(typeof suppliers)[number]>("All Suppliers");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  const filtered = useMemo(() => {
    if (appliedSupplier === "All Suppliers") return supplierBookingMock;
    return supplierBookingMock.filter((row) => row.supplier === appliedSupplier);
  }, [appliedSupplier]);

  function handleSearch() {
    setLoading(true);
    setTimeout(() => {
      setAppliedSupplier(supplier);
      setLoading(false);
    }, 400);
  }

  function handleReset() {
    setSupplier("All Suppliers");
    setDateRange("");
    setAppliedSupplier("All Suppliers");
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
        Supplier Bookings
      </h1>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-[200px] flex-1">
            <select
              value={supplier}
              onChange={(e) =>
                setSupplier(e.target.value as (typeof suppliers)[number])
              }
              className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-9 pl-3.5 text-sm text-slate-700 outline-none transition focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15"
            >
              {suppliers.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>

          <div className="relative min-w-[220px] flex-1">
            <CalendarDays className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-brand" />
            <input
              type="text"
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              placeholder="Select Date Range"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-3 pl-9 text-sm text-slate-700 outline-none transition focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15"
            />
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
        {loading ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-brand" />
            <p className="text-sm text-slate-400">Loading bookings...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[280px] items-center justify-center">
            <p className="text-sm text-slate-400">No bookings found</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {[
                    "Booking ID",
                    "Supplier",
                    "Passenger",
                    "Route",
                    "Airline",
                    "PNR",
                    "Amount",
                    "Status",
                    "Booked At",
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
                    <td
                      title={row.bookingId}
                      className="px-3 py-3.5 font-semibold text-slate-800"
                    >
                      {row.bookingId}
                    </td>
                    <td
                      title={row.supplier}
                      className="max-w-[150px] truncate px-3 py-3.5 text-slate-700"
                    >
                      {row.supplier}
                    </td>
                    <td
                      title={row.passenger}
                      className="max-w-[140px] truncate px-3 py-3.5 text-slate-700"
                    >
                      {row.passenger}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-slate-700">
                      {row.route}
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
                    <td className="whitespace-nowrap px-3 py-3.5 text-slate-500">
                      {row.bookedAt}
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
