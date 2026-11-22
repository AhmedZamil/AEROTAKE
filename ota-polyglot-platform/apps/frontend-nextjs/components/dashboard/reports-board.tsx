"use client";

import { useMemo, useState } from "react";
import {
  airlinePerformance,
  dummyReports,
  formatCount,
  formatMoney,
  reportKindMeta,
  reportSummary,
  salesTrend,
  type ReportKind,
  type ReportRow,
} from "@/data/reports";
import {
  BookingsIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DownloadIcon,
  ReportsIcon,
  SearchIcon,
  TicketStubIcon,
  WalletIcon,
} from "./icons";

const pageSizeOptions = [10, 20, 50];
const defaultRange = "01/08/2026 - 24/08/2026";

const kindFilters: { id: "all" | ReportKind; label: string }[] = [
  { id: "all", label: "All Reports" },
  { id: "sales", label: "Sales" },
  { id: "booking", label: "Booking" },
  { id: "ticket", label: "Ticket" },
  { id: "refund", label: "Refund" },
  { id: "airline", label: "Airline" },
  { id: "agent", label: "Agent" },
];

export default function ReportsBoard() {
  const [rangeDraft, setRangeDraft] = useState(defaultRange);
  const [appliedRange, setAppliedRange] = useState(defaultRange);
  const [kind, setKind] = useState<"all" | ReportKind>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<ReportRow | null>(null);

  const maxTrend = Math.max(...salesTrend.map((item) => item.value));
  const maxAirline = Math.max(...airlinePerformance.map((item) => item.share));

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const { start, end } = splitRange(appliedRange);
    return dummyReports.filter((report) => {
      if (kind !== "all" && report.kind !== kind) return false;
      if (start && report.periodStart < start) return false;
      if (end && report.periodStart > end) return false;
      if (!query) return true;
      return [report.id, report.title, report.topAirline, report.period]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [appliedRange, kind, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const fromCount = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const toCount = Math.min(currentPage * pageSize, filtered.length);

  function applyFilters() {
    setAppliedRange(rangeDraft.trim() || defaultRange);
    setPage(1);
  }

  function clearFilters() {
    setRangeDraft(defaultRange);
    setAppliedRange(defaultRange);
    setKind("all");
    setSearch("");
    setPage(1);
  }

  function downloadCsv(rows: ReportRow[] = filtered) {
    const header = [
      "Report ID",
      "Type",
      "Title",
      "Period",
      "Bookings",
      "Tickets",
      "Sales",
      "Refunds",
      "Growth %",
      "Top Airline",
    ];
    const body = rows.map((report) => [
      report.id,
      reportKindMeta[report.kind].label,
      report.title,
      report.period,
      String(report.bookings),
      String(report.tickets),
      String(report.sales),
      String(report.refunds),
      String(report.growth),
      report.topAirline,
    ]);
    const csv = [header, ...body]
      .map((line) => line.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "aerotake-reports.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const kpis = [
    {
      label: "Total Bookings",
      value: formatCount(reportSummary.bookings),
      change: reportSummary.bookingChange,
      icon: BookingsIcon,
      tone: "bg-[#fff1f0] text-aerotake-coral",
    },
    {
      label: "Tickets Issued",
      value: formatCount(reportSummary.tickets),
      change: reportSummary.ticketChange,
      icon: TicketStubIcon,
      tone: "bg-[#f3e8ff] text-[#7c3aed]",
    },
    {
      label: "Gross Sales",
      value: formatMoney(reportSummary.sales),
      change: reportSummary.salesChange,
      icon: WalletIcon,
      tone: "bg-[#fff7ed] text-[#c2410c]",
    },
    {
      label: "Refunds",
      value: formatMoney(reportSummary.refunds),
      change: reportSummary.refundChange,
      icon: ReportsIcon,
      tone: "bg-[#fef2f2] text-[#dc2626]",
    },
  ];

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1360px] flex-col gap-5 px-3 py-4 pb-24 sm:px-6 sm:py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-aerotake-navy">Reports</h1>
          <p className="mt-1 text-[13px] text-aerotake-muted">
            Review sales, bookings, tickets, and airline performance for your agency.
          </p>
        </div>
        <button
          type="button"
          onClick={() => downloadCsv()}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-aerotake-coral px-4 text-[13px] font-semibold text-white shadow-[0_10px_20px_rgba(249,115,96,0.28)] hover:bg-aerotake-coral-dark sm:w-auto"
        >
          <DownloadIcon className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      <section className="rounded-2xl bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)] sm:p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            <span className="relative block">
              <input
                value={rangeDraft}
                onChange={(event) => setRangeDraft(event.target.value)}
                placeholder={defaultRange}
                className="h-11 w-full rounded-lg border border-aerotake-border bg-white py-0 pr-10 pl-3 text-[13px] text-aerotake-navy outline-none placeholder:text-aerotake-muted focus:border-aerotake-coral"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-aerotake-coral">
                <CalendarIcon className="h-4 w-4" />
              </span>
            </span>
            <span className="relative block">
              <select
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value as "all" | ReportKind);
                  setPage(1);
                }}
                className="h-11 w-full appearance-none rounded-lg border border-aerotake-border bg-white px-3 pr-9 text-[13px] text-aerotake-navy outline-none focus:border-aerotake-coral"
              >
                {kindFilters.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-aerotake-muted">
                <ChevronDownIcon className="h-4 w-4" />
              </span>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
            <button
              type="button"
              onClick={applyFilters}
              className="h-11 w-full rounded-lg bg-aerotake-navy px-5 text-[13px] font-semibold text-white hover:bg-[#1e293b] sm:min-w-[128px] sm:w-auto"
            >
              Apply Filter
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="h-11 w-full rounded-lg border border-aerotake-coral bg-white px-5 text-[13px] font-semibold text-aerotake-coral hover:bg-[#fff1f0] sm:min-w-[110px] sm:w-auto"
            >
              Clear All
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          const up = kpi.change >= 0;
          return (
            <article
              key={kpi.label}
              className="rounded-2xl bg-white p-3 shadow-[0_10px_32px_rgba(15,23,42,0.05)] sm:p-5"
            >
              <div className="flex items-start justify-between gap-2 sm:gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-aerotake-muted sm:text-[13px]">{kpi.label}</p>
                  <p className="mt-1.5 break-words text-[18px] leading-tight font-bold text-aerotake-navy sm:mt-2 sm:truncate sm:text-[22px] sm:leading-none">
                    {kpi.value}
                  </p>
                  <p
                    className={`mt-1.5 text-[11px] font-medium sm:mt-2 sm:text-[12px] ${
                      up ? "text-aerotake-success" : "text-[#dc2626]"
                    }`}
                  >
                    {up ? "↗" : "↘"} {Math.abs(kpi.change)}%{" "}
                    <span className="hidden font-normal text-aerotake-muted sm:inline">vs last period</span>
                  </p>
                </div>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full sm:h-11 sm:w-11 ${kpi.tone}`}>
                  <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
              </div>
            </article>
          );
        })}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.85fr)]">
        <article className="min-w-0 overflow-hidden rounded-2xl bg-white p-4 shadow-[0_10px_32px_rgba(15,23,42,0.05)] sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-bold text-aerotake-navy">Sales Trend</h2>
              <p className="mt-1 text-[12px] text-aerotake-muted">August 2026 daily gross sales</p>
            </div>
            <span className="rounded-full bg-[#fff1f0] px-2.5 py-1 text-[11px] font-semibold text-aerotake-coral">
              Live
            </span>
          </div>
          <div className="mt-5 overflow-x-auto sm:overflow-visible">
            <div className="flex h-[180px] min-w-[420px] items-end gap-1.5 sm:mt-0 sm:h-[220px] sm:min-w-0 sm:gap-3">
            {salesTrend.map((item) => (
              <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div className="flex h-[140px] w-full items-end sm:h-[180px]">
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-aerotake-coral to-[#fdba74]"
                    style={{ height: `${Math.max(8, (item.value / maxTrend) * 100)}%` }}
                    title={formatMoney(item.value)}
                  />
                </div>
                <p className="truncate text-[10px] font-medium text-aerotake-muted">{item.label}</p>
              </div>
            ))}
            </div>
          </div>
        </article>

        <article className="min-w-0 overflow-hidden rounded-2xl bg-white p-4 shadow-[0_10px_32px_rgba(15,23,42,0.05)] sm:p-5">
          <h2 className="text-[15px] font-bold text-aerotake-navy">Airline Performance</h2>
          <p className="mt-1 text-[12px] text-aerotake-muted">Share of tickets issued this month</p>
          <div className="mt-5 space-y-4">
            {airlinePerformance.map((airline) => (
              <div key={airline.code}>
                <div className="mb-1.5 flex flex-col gap-0.5 text-[12px] sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <p className="font-semibold text-aerotake-navy">
                    {airline.code} · {airline.name}
                  </p>
                  <p className="min-w-0 break-words text-aerotake-muted">
                    {airline.tickets} · {formatMoney(airline.sales)}
                  </p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-aerotake-canvas">
                  <div
                    className="h-full rounded-full bg-aerotake-coral"
                    style={{ width: `${(airline.share / maxAirline) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {kindFilters.map((item) => {
              const active = kind === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setKind(item.id);
                    setPage(1);
                  }}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold ${
                    active
                      ? "bg-aerotake-coral text-white"
                      : "bg-aerotake-canvas text-aerotake-navy hover:bg-[#e8eaed]"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-[13px] text-aerotake-muted">
              Show
              <span className="relative">
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                  className="h-9 appearance-none rounded-lg border border-aerotake-border bg-white py-0 pr-8 pl-3 text-[13px] text-aerotake-navy outline-none"
                >
                  {pageSizeOptions.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                  <ChevronDownIcon className="h-3.5 w-3.5" />
                </span>
              </span>
            </label>
            <label className="relative w-full sm:w-[240px]">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-aerotake-muted">
                <SearchIcon className="h-4 w-4" />
              </span>
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search reports..."
                className="h-10 w-full rounded-xl border border-aerotake-border bg-white pr-3 pl-9 text-[13px] text-aerotake-navy outline-none placeholder:text-aerotake-muted focus:border-aerotake-coral"
              />
            </label>
          </div>
        </div>

        <div className="mt-4 space-y-3 md:hidden">
          {visible.length ? (
            visible.map((report) => {
              const meta = reportKindMeta[report.kind];
              const up = report.growth >= 0;
              return (
                <article
                  key={report.id}
                  className="rounded-xl border border-aerotake-border bg-[#f8fafc] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-aerotake-navy">{report.title}</p>
                      <p className="mt-0.5 text-[12px] text-aerotake-muted">{report.id}</p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.badge}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-2 text-[12px] text-aerotake-muted">{report.period}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-aerotake-border bg-white px-3 py-2">
                      <p className="text-[10px] font-semibold tracking-wide text-aerotake-muted uppercase">
                        Bookings
                      </p>
                      <p className="mt-0.5 text-[13px] font-bold text-aerotake-navy">
                        {formatCount(report.bookings)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-aerotake-muted">
                        {formatCount(report.tickets)} tickets
                      </p>
                    </div>
                    <div className="rounded-lg border border-aerotake-border bg-white px-3 py-2">
                      <p className="text-[10px] font-semibold tracking-wide text-aerotake-muted uppercase">
                        Sales
                      </p>
                      <p className="mt-0.5 text-[13px] font-bold text-aerotake-navy">
                        {formatMoney(report.sales)}
                      </p>
                      <p
                        className={`mt-0.5 text-[11px] font-semibold ${
                          up ? "text-aerotake-success" : "text-[#dc2626]"
                        }`}
                      >
                        {up ? "+" : ""}
                        {report.growth}%
                      </p>
                    </div>
                    <div className="col-span-2 rounded-lg border border-aerotake-border bg-white px-3 py-2">
                      <p className="text-[10px] font-semibold tracking-wide text-aerotake-muted uppercase">
                        Top airline
                      </p>
                      <p className="mt-0.5 text-[12px] font-medium text-aerotake-navy">
                        {report.topAirline}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelected(report)}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-aerotake-border bg-white text-[12px] font-semibold text-aerotake-navy"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadCsv([report])}
                      className="inline-flex h-10 items-center justify-center gap-1 rounded-lg bg-[#fff1f0] text-[12px] font-semibold text-aerotake-coral"
                    >
                      <DownloadIcon className="h-3.5 w-3.5" />
                      CSV
                    </button>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="rounded-xl border border-aerotake-border px-4 py-10 text-center">
              <p className="text-[15px] font-semibold text-aerotake-navy">No reports found</p>
              <p className="mt-1 text-[13px] text-aerotake-muted">
                Try another date range or report type.
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead className="bg-[#f8fafc] text-[12px] font-semibold tracking-wide text-aerotake-muted uppercase">
              <tr>
                <th className="rounded-l-xl px-4 py-3">Report</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Bookings</th>
                <th className="px-4 py-3">Sales</th>
                <th className="px-4 py-3">Growth</th>
                <th className="rounded-r-xl px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.length ? (
                visible.map((report) => {
                  const meta = reportKindMeta[report.kind];
                  const up = report.growth >= 0;
                  return (
                    <tr key={report.id} className="border-t border-aerotake-border/80 hover:bg-[#fffaf8]">
                      <td className="px-4 py-4">
                        <p className="text-[13px] font-semibold text-aerotake-navy">{report.title}</p>
                        <p className="mt-1 text-[12px] text-aerotake-muted">{report.id}</p>
                        <p className="mt-0.5 text-[11px] text-aerotake-muted">
                          Top: {report.topAirline}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.badge}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-[12px] whitespace-nowrap text-aerotake-navy">
                        {report.period}
                      </td>
                      <td className="px-4 py-4 text-[12px] text-aerotake-navy">
                        <p className="font-semibold">{formatCount(report.bookings)} bookings</p>
                        <p className="mt-1 text-aerotake-muted">
                          {formatCount(report.tickets)} tickets
                        </p>
                      </td>
                      <td className="px-4 py-4 text-[12px]">
                        <p className="font-semibold text-aerotake-navy">{formatMoney(report.sales)}</p>
                        <p className="mt-1 text-aerotake-muted">
                          Refunds {formatMoney(report.refunds)}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            up ? "bg-[#ecfdf3] text-aerotake-success" : "bg-[#fef2f2] text-[#dc2626]"
                          }`}
                        >
                          {up ? "+" : ""}
                          {report.growth}%
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSelected(report)}
                            className="h-9 rounded-lg border border-aerotake-border px-3 text-[12px] font-semibold text-aerotake-navy hover:bg-aerotake-canvas"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadCsv([report])}
                            className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#fff1f0] px-3 text-[12px] font-semibold text-aerotake-coral hover:bg-[#ffe4e0]"
                          >
                            <DownloadIcon className="h-3.5 w-3.5" />
                            CSV
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <p className="text-[15px] font-semibold text-aerotake-navy">No reports found</p>
                    <p className="mt-1 text-[13px] text-aerotake-muted">
                      Try another date range or report type.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-aerotake-muted">
            {filtered.length
              ? `Showing ${fromCount} to ${toCount} of ${filtered.length} reports`
              : "No entries to show"}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <PageButton
              ariaLabel="Previous page"
              disabled={currentPage === 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              <ChevronLeftIcon />
            </PageButton>
            {Array.from({ length: pageCount }, (_, index) => index + 1).map((item) => (
              <PageButton
                key={item}
                ariaLabel={`Page ${item}`}
                active={item === currentPage}
                onClick={() => setPage(item)}
              >
                {item}
              </PageButton>
            ))}
            <PageButton
              ariaLabel="Next page"
              disabled={currentPage === pageCount}
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            >
              <ChevronRightIcon />
            </PageButton>
          </div>
        </div>
      </section>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-aerotake-navy/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.18)] sm:rounded-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 className="text-[16px] font-bold text-aerotake-navy">{selected.title}</h3>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setSelected(null)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-aerotake-muted hover:bg-aerotake-canvas"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  reportKindMeta[selected.kind].badge
                }`}
              >
                {reportKindMeta[selected.kind].label}
              </span>
              <span className="text-[12px] text-aerotake-muted">{selected.id}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-[#f8fafc] p-4 text-[13px]">
              <Meta label="Period" value={selected.period} />
              <Meta label="Top airline" value={selected.topAirline} />
              <Meta label="Bookings" value={formatCount(selected.bookings)} />
              <Meta label="Tickets" value={formatCount(selected.tickets)} />
              <Meta label="Sales" value={formatMoney(selected.sales)} />
              <Meta label="Refunds" value={formatMoney(selected.refunds)} />
              <Meta
                label="Growth"
                value={`${selected.growth >= 0 ? "+" : ""}${selected.growth}%`}
              />
            </div>
            <div className="mt-5 grid grid-cols-1 gap-2 sm:flex sm:justify-end">
              <button
                type="button"
                onClick={() => downloadCsv([selected])}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-aerotake-coral px-4 text-[13px] font-semibold text-white sm:h-10"
              >
                <DownloadIcon className="h-4 w-4" />
                Download CSV
              </button>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="h-11 rounded-xl border border-aerotake-border px-4 text-[13px] font-semibold text-aerotake-navy sm:h-10"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-wide text-aerotake-muted uppercase">{label}</p>
      <p className="mt-1 font-medium text-aerotake-navy">{value}</p>
    </div>
  );
}

function PageButton({
  children,
  onClick,
  disabled = false,
  active = false,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 min-w-8 items-center justify-center rounded-md text-[13px] font-semibold ${
        active
          ? "bg-aerotake-coral text-white"
          : "border border-aerotake-border bg-white text-aerotake-navy hover:bg-aerotake-canvas"
      } disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

function splitRange(range: string) {
  const [rawStart, rawEnd] = range.split("-").map((part) => part.trim());
  return {
    start: toIsoDate(rawStart),
    end: toIsoDate(rawEnd),
  };
}

function toIsoDate(value?: string) {
  if (!value) {
    return "";
  }
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    return "";
  }
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}
