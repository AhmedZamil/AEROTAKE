"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Search } from "lucide-react";
import {
  b2cBookingMock,
  type B2CBookingItem,
} from "@/data/b2cBookingMock";

function statusClass(status: B2CBookingItem["status"]) {
  switch (status) {
    case "Queued":
      return "bg-sky-50 text-sky-700";
    case "Processing":
      return "bg-amber-50 text-amber-700";
    case "Ticketed":
      return "bg-emerald-50 text-emerald-700";
    case "Hold":
      return "bg-orange-50 text-orange-700";
    case "Failed":
      return "bg-rose-50 text-rose-600";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export default function B2CBookingQueuesContent() {
  const [dateRange] = useState("08 Jun 26 - 09 Jun 26");
  const [trackingId, setTrackingId] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [pnr, setPnr] = useState("");
  const [airlinesPnr, setAirlinesPnr] = useState("");
  const [applied, setApplied] = useState({
    trackingId: "",
    bookingId: "",
    pnr: "",
    airlinesPnr: "",
  });

  const filtered = useMemo(() => {
    return b2cBookingMock.filter((row) => {
      if (
        applied.trackingId &&
        !row.trackingId.toLowerCase().includes(applied.trackingId.toLowerCase())
      ) {
        return false;
      }
      if (
        applied.bookingId &&
        !row.bookingId.toLowerCase().includes(applied.bookingId.toLowerCase())
      ) {
        return false;
      }
      if (
        applied.pnr &&
        !row.pnr.toLowerCase().includes(applied.pnr.toLowerCase())
      ) {
        return false;
      }
      if (
        applied.airlinesPnr &&
        !row.airlinesPnr
          .toLowerCase()
          .includes(applied.airlinesPnr.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [applied]);

  function handleSearch() {
    setApplied({ trackingId, bookingId, pnr, airlinesPnr });
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
        B2C Booking Queues
      </h1>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="relative">
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              Booking Date Between
            </label>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-brand" />
              <input
                type="text"
                readOnly
                value={dateRange}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-3 pl-9 text-sm text-slate-700 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              Tracking ID
            </label>
            <input
              type="text"
              value={trackingId}
              onChange={(e) => setTrackingId(e.target.value)}
              placeholder="Tracking ID"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              Booking ID
            </label>
            <input
              type="text"
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
              placeholder="Booking ID"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              PNR
            </label>
            <input
              type="text"
              value={pnr}
              onChange={(e) => setPnr(e.target.value)}
              placeholder="PNR"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              Airlines PNR
            </label>
            <input
              type="text"
              value={airlinesPnr}
              onChange={(e) => setAirlinesPnr(e.target.value)}
              placeholder="Airlines PNR"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleSearch}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
            >
              <Search className="h-4 w-4" />
              Search
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex min-h-[280px] items-center justify-center">
            <p className="text-sm text-slate-400">No bookings found</p>
          </div>
        ) : (
          <div className="table-scroll mt-5">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {[
                    "Booking ID",
                    "Customer",
                    "Route",
                    "Airline",
                    "PNR",
                    "Amount",
                    "Status",
                    "Booking Date",
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
                    <td className="px-3 py-3.5">
                      <p
                        title={row.bookingId}
                        className="truncate font-semibold text-slate-800"
                      >
                        {row.bookingId}
                      </p>
                      <p
                        title={row.trackingId}
                        className="truncate text-xs text-slate-400"
                      >
                        {row.trackingId}
                      </p>
                    </td>
                    <td
                      title={row.customer}
                      className="max-w-[140px] truncate px-3 py-3.5 text-slate-700"
                    >
                      {row.customer}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-slate-700">
                      {row.route}
                    </td>
                    <td
                      title={row.airline}
                      className="max-w-[160px] truncate px-3 py-3.5 text-slate-700"
                    >
                      {row.airline}
                    </td>
                    <td className="px-3 py-3.5">
                      <p title={row.pnr} className="truncate text-slate-700">
                        {row.pnr}
                      </p>
                      <p
                        title={row.airlinesPnr}
                        className="truncate text-xs text-slate-400"
                      >
                        {row.airlinesPnr}
                      </p>
                    </td>
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
                      {row.bookingDate}
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
