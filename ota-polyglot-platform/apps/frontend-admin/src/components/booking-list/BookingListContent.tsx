"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  Filter,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import {
  bookingMock,
  bookingTabs,
  type BookingItem,
} from "@/data/bookingMock";

function statusClass(status: BookingItem["status"]) {
  switch (status) {
    case "Confirmed":
    case "Ticketed":
      return "bg-emerald-50 text-emerald-700";
    case "Pending":
      return "bg-amber-50 text-amber-700";
    case "Hold":
      return "bg-orange-50 text-orange-700";
    case "Cancelled":
      return "bg-rose-50 text-rose-600";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export default function BookingListContent() {
  const [activeTab, setActiveTab] =
    useState<(typeof bookingTabs)[number]>("ALL");
  const [dateRange] = useState("08 Jun 26 - 09 Jun 26");
  const [trackingId, setTrackingId] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [pnr, setPnr] = useState("");
  const [airlinesPnr, setAirlinesPnr] = useState("");
  const [bookingStatus, setBookingStatus] = useState("All Status");
  const [applied, setApplied] = useState({
    trackingId: "",
    bookingId: "",
    pnr: "",
    airlinesPnr: "",
    bookingStatus: "All Status",
  });

  const filtered = useMemo(() => {
    return bookingMock.filter((row) => {
      if (activeTab !== "ALL" && row.status !== activeTab) return false;
      if (
        applied.bookingStatus !== "All Status" &&
        row.status !== applied.bookingStatus
      ) {
        return false;
      }
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
  }, [activeTab, applied]);

  function handleSearch() {
    setApplied({
      trackingId,
      bookingId,
      pnr,
      airlinesPnr,
      bookingStatus,
    });
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
        Booking List
      </h1>

      <div className="flex gap-1 overflow-x-auto overscroll-x-contain border-b border-slate-200 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {bookingTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`relative shrink-0 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition sm:px-4 ${
              activeTab === tab
                ? "text-brand"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab}
            {activeTab === tab && (
              <span className="absolute right-2 bottom-0 left-2 h-0.5 rounded-full bg-brand" />
            )}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="relative xl:col-span-1">
            <CalendarDays className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-brand" />
            <input
              type="text"
              readOnly
              value={dateRange}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-3 pl-9 text-sm text-slate-700 outline-none"
            />
          </div>
          <input
            type="text"
            value={trackingId}
            onChange={(e) => setTrackingId(e.target.value)}
            placeholder="Tracking ID"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15"
          />
          <input
            type="text"
            value={bookingId}
            onChange={(e) => setBookingId(e.target.value)}
            placeholder="Booking ID"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15"
          />
          <input
            type="text"
            value={pnr}
            onChange={(e) => setPnr(e.target.value)}
            placeholder="PNR"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15"
          />
          <input
            type="text"
            value={airlinesPnr}
            onChange={(e) => setAirlinesPnr(e.target.value)}
            placeholder="Airlines PNR"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSearch}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
            >
              <Search className="h-4 w-4" />
              Search
            </button>
            <button
              type="button"
              className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-brand/40 hover:text-brand"
              aria-label="More filters"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-3 max-w-xs">
          <div className="relative">
            <Filter className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <select
              value={bookingStatus}
              onChange={(e) => setBookingStatus(e.target.value)}
              className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-8 pl-9 text-sm text-slate-700 outline-none transition focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15"
            >
              <option>All Status</option>
              <option>Confirmed</option>
              <option>Pending</option>
              <option>Hold</option>
              <option>Ticketed</option>
              <option>Cancelled</option>
            </select>
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
                    "Passenger",
                    "Route",
                    "Airline",
                    "PNR",
                    "Partner",
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
                      title={row.passenger}
                      className="max-w-[140px] truncate px-3 py-3.5 text-slate-700"
                    >
                      {row.passenger}
                    </td>
                    <td
                      title={row.route}
                      className="whitespace-nowrap px-3 py-3.5 text-slate-700"
                    >
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
                    <td
                      title={row.partner}
                      className="max-w-[150px] truncate px-3 py-3.5 text-slate-700"
                    >
                      {row.partner}
                    </td>
                    <td
                      title={row.amount}
                      className="whitespace-nowrap px-3 py-3.5 font-semibold text-slate-900"
                    >
                      {row.amount}
                    </td>
                    <td className="px-3 py-3.5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(row.status)}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td
                      title={row.bookedAt}
                      className="whitespace-nowrap px-3 py-3.5 text-slate-500"
                    >
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
