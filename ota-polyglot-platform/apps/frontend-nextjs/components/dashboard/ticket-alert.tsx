"use client";

import { useMemo, useState } from "react";
import AirlineMark from "./airline-mark";
import {
  alertKindMeta,
  dateValue,
  dummyTicketAlerts,
  formatFlightStamp,
  type TicketAlert,
  type TicketAlertKind,
  type TicketDateField,
} from "@/data/ticket-alerts";
import {
  BookingsIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ClockIcon,
  DownloadIcon,
  FilterIcon,
  MoreIcon,
  TicketStubIcon,
  WalletIcon,
} from "./icons";

const defaultRange = "01/08/2026 - 24/08/2026";
const pageSizeOptions = [10, 20, 50];

const dateFields: { id: TicketDateField; label: string }[] = [
  { id: "booking", label: "Booking Date" },
  { id: "issue", label: "Issue Date" },
  { id: "expiry", label: "Expiry Date" },
  { id: "flight", label: "Flight Date" },
];

export default function TicketAlertBoard() {
  const [pnrDraft, setPnrDraft] = useState("");
  const [bookingIdDraft, setBookingIdDraft] = useState("");
  const [rangeDraft, setRangeDraft] = useState(defaultRange);
  const [dateFieldDraft, setDateFieldDraft] = useState<TicketDateField>("booking");
  const [applied, setApplied] = useState({
    pnr: "",
    bookingId: "",
    range: defaultRange,
    dateField: "booking" as TicketDateField,
  });
  const [kindFilter, setKindFilter] = useState<"all" | TicketAlertKind>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filtered = useMemo(() => {
    const { start, end } = splitRange(applied.range);
    return dummyTicketAlerts.filter((alert) => {
      if (kindFilter !== "all" && alert.kind !== kindFilter) {
        return false;
      }
      if (applied.pnr && !alert.pnr.toLowerCase().includes(applied.pnr.toLowerCase())) {
        return false;
      }
      if (
        applied.bookingId &&
        !alert.id.toLowerCase().includes(applied.bookingId.toLowerCase())
      ) {
        return false;
      }
      const value = dateValue(alert, applied.dateField);
      if (start && value < start) {
        return false;
      }
      if (end && value > end) {
        return false;
      }
      return true;
    });
  }, [applied, kindFilter]);

  const counts = useMemo(() => {
    const base = dummyTicketAlerts.filter((alert) => {
      const { start, end } = splitRange(applied.range);
      if (applied.pnr && !alert.pnr.toLowerCase().includes(applied.pnr.toLowerCase())) {
        return false;
      }
      if (
        applied.bookingId &&
        !alert.id.toLowerCase().includes(applied.bookingId.toLowerCase())
      ) {
        return false;
      }
      const value = dateValue(alert, applied.dateField);
      if (start && value < start) return false;
      if (end && value > end) return false;
      return true;
    });
    return {
      all: base.length,
      today: base.filter((item) => item.kind === "today").length,
      "days-3": base.filter((item) => item.kind === "days-3").length,
      "days-7": base.filter((item) => item.kind === "days-7").length,
    };
  }, [applied]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const fromCount = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const toCount = Math.min(currentPage * pageSize, filtered.length);

  function applyFilters() {
    setApplied({
      pnr: pnrDraft.trim(),
      bookingId: bookingIdDraft.trim(),
      range: rangeDraft.trim() || defaultRange,
      dateField: dateFieldDraft,
    });
    setPage(1);
    setFiltersOpen(false);
  }

  function clearFilters() {
    setPnrDraft("");
    setBookingIdDraft("");
    setRangeDraft(defaultRange);
    setDateFieldDraft("booking");
    setApplied({
      pnr: "",
      bookingId: "",
      range: defaultRange,
      dateField: "booking",
    });
    setKindFilter("all");
    setPage(1);
    setFiltersOpen(false);
  }

  function selectKind(kind: "all" | TicketAlertKind) {
    setKindFilter(kind);
    setPage(1);
  }

  async function copyPnr(pnr: string) {
    try {
      await navigator.clipboard.writeText(pnr);
      setCopied(pnr);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  }

  function downloadCsv() {
    const header = [
      "Alert Type",
      "Booking ID",
      "GDS PNR",
      "Airline",
      "Route",
      "Flight",
      "Ticket No",
      "Passengers",
      "Issue Date",
      "Expiry Date",
      "Status",
    ];
    const rows = filtered.map((alert) => [
      alertKindMeta[alert.kind].title,
      alert.id,
      alert.pnr,
      alert.airline,
      `${alert.fromCode} ${alert.toCode}`,
      formatFlightStamp(alert),
      alert.ticketNo,
      alert.travelers,
      alert.issueAt,
      alert.expiryAt,
      alertKindMeta[alert.kind].status,
    ]);
    const csv = [header, ...rows]
      .map((line) => line.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ticket-alerts.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const cards = [
    {
      id: "all" as const,
      label: "Total Alerts",
      shortLabel: "Total",
      value: counts.all,
      href: "View all alerts",
      icon: WalletIcon,
      tone: "bg-[#fef2f2] text-[#ef4444]",
    },
    {
      id: "today" as const,
      label: "Expiring Today",
      shortLabel: "Today",
      value: counts.today,
      href: "View details",
      icon: ClockIcon,
      tone: "bg-[#fef2f2] text-[#dc2626]",
    },
    {
      id: "days-3" as const,
      label: "Expiring in 3 Days",
      shortLabel: "3 Days",
      value: counts["days-3"],
      href: "View details",
      icon: CalendarIcon,
      tone: "bg-[#fff7ed] text-[#ea580c]",
    },
    {
      id: "days-7" as const,
      label: "Expiring in 7 Days",
      shortLabel: "7 Days",
      value: counts["days-7"],
      href: "View details",
      icon: BookingsIcon,
      tone: "bg-[#eff6ff] text-[#2563eb]",
    },
  ];

  const filtersActive =
    Boolean(applied.pnr) ||
    Boolean(applied.bookingId) ||
    applied.range !== defaultRange ||
    applied.dateField !== "booking" ||
    kindFilter !== "all";

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1360px] flex-col gap-5 px-3 py-4 pb-24 sm:px-6 sm:py-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-aerotake-navy">Ticket Alert</h1>
        <p className="mt-1 text-[13px] text-aerotake-muted">
          Track issued tickets and upcoming expiries / changes.
        </p>
      </div>

      <section className="rounded-2xl bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)] sm:p-5">
        <button
          type="button"
          onClick={() => setFiltersOpen((value) => !value)}
          className="flex h-11 w-full items-center justify-between rounded-xl border border-aerotake-border bg-aerotake-coral-light px-3.5 text-[13px] font-semibold text-aerotake-coral sm:hidden"
          aria-expanded={filtersOpen}
        >
          <span className="inline-flex items-center gap-2">
            <FilterIcon />
            Filter
            {filtersActive ? (
              <span className="rounded-full bg-aerotake-coral px-1.5 py-0.5 text-[10px] font-bold text-white">
                On
              </span>
            ) : null}
          </span>
          {filtersOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
        </button>
        <div
          className={`${
            filtersOpen ? "mt-3 flex" : "hidden"
          } flex-col gap-3 sm:mt-0 sm:flex sm:flex-col xl:flex-row xl:items-center`}
        >
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <input
              value={pnrDraft}
              onChange={(event) => setPnrDraft(event.target.value)}
              placeholder="GDS PNR"
              className="h-11 w-full rounded-lg border border-aerotake-border bg-white px-3 text-[13px] text-aerotake-navy outline-none placeholder:text-aerotake-muted focus:border-aerotake-coral"
            />
            <input
              value={bookingIdDraft}
              onChange={(event) => setBookingIdDraft(event.target.value)}
              placeholder="Booking ID"
              className="h-11 w-full rounded-lg border border-aerotake-border bg-white px-3 text-[13px] text-aerotake-navy outline-none placeholder:text-aerotake-muted focus:border-aerotake-coral"
            />
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
                value={dateFieldDraft}
                onChange={(event) => setDateFieldDraft(event.target.value as TicketDateField)}
                className="h-11 w-full appearance-none rounded-lg border border-aerotake-border bg-white px-3 pr-9 text-[13px] text-aerotake-navy outline-none focus:border-aerotake-coral"
              >
                {dateFields.map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.label}
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
            <button
              type="button"
              onClick={downloadCsv}
              className="col-span-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-aerotake-coral px-5 text-[13px] font-semibold text-white hover:bg-aerotake-coral-dark sm:col-span-1 sm:min-w-[120px] sm:w-auto"
            >
              <DownloadIcon className="h-4 w-4" />
              Download
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {cards.map((card) => {
          const active = kindFilter === card.id;
          const Icon = card.icon;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => selectKind(card.id)}
              className={`rounded-2xl bg-white p-3 text-left shadow-[0_8px_30px_rgba(15,23,42,0.04)] transition sm:p-4 ${
                active ? "ring-2 ring-aerotake-coral/40" : "hover:shadow-[0_10px_28px_rgba(15,23,42,0.08)]"
              }`}
            >
              <div className="flex items-start gap-2 sm:gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11 ${card.tone}`}>
                  <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[12px] text-aerotake-muted sm:text-[13px]">
                    <span className="sm:hidden">{card.shortLabel}</span>
                    <span className="hidden sm:inline">{card.label}</span>
                  </p>
                  <p className="mt-1 text-[22px] leading-none font-bold text-aerotake-navy sm:text-[28px]">
                    {String(card.value).padStart(2, "0")}
                  </p>
                </div>
              </div>
              <span className="mt-3 hidden items-center gap-1 text-[12px] font-medium text-aerotake-coral sm:mt-4 sm:inline-flex">
                {card.href}
                <ChevronRightIcon className="h-3.5 w-3.5" />
              </span>
            </button>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
        <div className="space-y-3 p-3 md:hidden">
          {visible.length ? (
            visible.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                copied={copied === alert.pnr}
                onCopyPnr={() => {
                  void copyPnr(alert.pnr);
                }}
              />
            ))
          ) : (
            <div className="rounded-xl border border-aerotake-border px-4 py-10 text-center">
              <p className="text-[15px] font-semibold text-aerotake-navy">No alerts found</p>
              <p className="mt-1 text-[13px] text-aerotake-muted">
                Try another filter or clear the current search.
              </p>
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1100px] border-collapse text-left">
            <thead className="bg-[#f3f4f6] text-[12px] font-semibold tracking-wide text-aerotake-muted uppercase">
              <tr>
                <th className="px-4 py-3.5">Alert Type</th>
                <th className="px-4 py-3.5">Booking Details</th>
                <th className="px-4 py-3.5">Route</th>
                <th className="px-4 py-3.5">Ticket Details</th>
                <th className="px-4 py-3.5">Issue Date</th>
                <th className="px-4 py-3.5">Expiry Date</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.length ? (
                visible.map((alert) => (
                  <AlertRow
                    key={alert.id}
                    alert={alert}
                    menuOpen={openMenu === alert.id}
                    copied={copied === alert.pnr}
                    onToggleMenu={() =>
                      setOpenMenu((value) => (value === alert.id ? null : alert.id))
                    }
                    onCopyPnr={() => {
                      void copyPnr(alert.pnr);
                      setOpenMenu(null);
                    }}
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <p className="text-[15px] font-semibold text-aerotake-navy">No alerts found</p>
                    <p className="mt-1 text-[13px] text-aerotake-muted">
                      Try another filter or clear the current search.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-[13px] text-aerotake-muted">
          Showing {fromCount} to {toCount} of {filtered.length} alerts
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative inline-flex items-center">
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              className="h-9 appearance-none rounded-md border border-aerotake-border bg-white py-0 pr-8 pl-3 text-[13px] text-aerotake-navy outline-none"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size} per page
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-aerotake-muted">
              <ChevronDownIcon className="h-3.5 w-3.5" />
            </span>
          </label>
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
      </div>
    </div>
  );
}

function AlertCard({
  alert,
  copied,
  onCopyPnr,
}: {
  alert: TicketAlert;
  copied: boolean;
  onCopyPnr: () => void;
}) {
  const meta = alertKindMeta[alert.kind];

  return (
    <article className="rounded-xl border border-aerotake-border bg-[#f8fafc] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <AirlineMark code={alert.airlineCode} size="md" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-aerotake-navy">
              {alert.fromCode} → {alert.toCode}
            </p>
            <p className="mt-0.5 truncate text-[12px] text-aerotake-muted">
              {alert.airline} · {formatFlightStamp(alert)}
            </p>
          </div>
        </div>
        <span
          className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.badge}`}
        >
          {meta.status}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-aerotake-border bg-white px-3 py-2">
          <p className="text-[10px] font-semibold tracking-wide text-aerotake-muted uppercase">
            Booking
          </p>
          <p className={`mt-0.5 text-[12px] font-semibold ${meta.accent}`}>{alert.id}</p>
          <p className="mt-0.5 text-[12px] font-bold text-aerotake-navy">PNR {alert.pnr}</p>
        </div>
        <div className="rounded-lg border border-aerotake-border bg-white px-3 py-2">
          <p className="text-[10px] font-semibold tracking-wide text-aerotake-muted uppercase">
            Ticket
          </p>
          <p className="mt-0.5 text-[12px] font-semibold text-aerotake-navy">{alert.ticketNo}</p>
          <p className="mt-0.5 text-[11px] text-aerotake-muted">{alert.travelers}</p>
        </div>
        <div className="rounded-lg border border-aerotake-border bg-white px-3 py-2">
          <p className="text-[10px] font-semibold tracking-wide text-aerotake-muted uppercase">
            Issued
          </p>
          <p className="mt-0.5 text-[12px] font-medium text-aerotake-navy">{alert.issueAt}</p>
        </div>
        <div className="rounded-lg border border-aerotake-border bg-white px-3 py-2">
          <p className="text-[10px] font-semibold tracking-wide text-aerotake-muted uppercase">
            Expiry
          </p>
          <p className={`mt-0.5 text-[12px] font-semibold ${meta.text}`}>{alert.expiryAt}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={onCopyPnr}
        className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-lg border border-aerotake-border bg-white text-[12px] font-semibold text-aerotake-navy"
      >
        {copied ? "PNR copied" : "Copy PNR"}
      </button>
    </article>
  );
}

function AlertRow({
  alert,
  menuOpen,
  copied,
  onToggleMenu,
  onCopyPnr,
}: {
  alert: TicketAlert;
  menuOpen: boolean;
  copied: boolean;
  onToggleMenu: () => void;
  onCopyPnr: () => void;
}) {
  const meta = alertKindMeta[alert.kind];

  return (
    <tr className="border-t border-aerotake-border align-middle">
      <td className="px-4 py-4">
        <div className="flex items-center gap-2.5">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${meta.icon}`}>
            {alert.kind === "issued" ? (
              <TicketStubIcon className="h-4 w-4" />
            ) : alert.kind === "today" ? (
              <ClockIcon className="h-4 w-4" />
            ) : (
              <CalendarIcon className="h-4 w-4" />
            )}
          </span>
          <span className={`text-[13px] font-semibold ${meta.text}`}>{meta.title}</span>
        </div>
      </td>
      <td className="px-4 py-4">
        <p className="text-[12px] text-aerotake-muted">
          Booking ID{" "}
          <span className={`font-semibold ${meta.accent}`}>{alert.id}</span>
        </p>
        <p className="mt-1 text-[13px] font-bold text-aerotake-navy">
          GDS PNR {alert.pnr}
        </p>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-3">
          <AirlineMark code={alert.airlineCode} size="md" />
          <div>
            <p className="text-[13px] font-semibold text-aerotake-navy">
              {alert.fromCode} → {alert.toCode}
            </p>
            <p className="text-[12px] text-aerotake-muted">
              {alert.fromCity}, {alert.toCity}
            </p>
            <p className="mt-0.5 text-[12px] text-aerotake-muted">{formatFlightStamp(alert)}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-4 text-[12px]">
        <p className="text-aerotake-muted">
          Ticket No. <span className="font-semibold text-aerotake-navy">{alert.ticketNo}</span>
        </p>
        <p className="mt-1 text-aerotake-muted">{alert.travelers}</p>
      </td>
      <td className="px-4 py-4 text-[12px] whitespace-nowrap text-aerotake-navy">{alert.issueAt}</td>
      <td className={`px-4 py-4 text-[12px] font-semibold whitespace-nowrap ${meta.text}`}>
        {alert.expiryAt}
      </td>
      <td className="px-4 py-4">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.badge}`}>
          {meta.status}
        </span>
      </td>
      <td className="relative px-4 py-4 text-right">
        <button
          type="button"
          aria-label="Alert options"
          onClick={onToggleMenu}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-aerotake-muted hover:bg-aerotake-canvas hover:text-aerotake-navy"
        >
          <MoreIcon />
        </button>
        {menuOpen ? (
          <div className="absolute top-full right-4 z-20 mt-1 w-40 overflow-hidden rounded-xl border border-aerotake-border bg-white py-1 shadow-[0_12px_32px_rgba(15,23,42,0.12)]">
            <button
              type="button"
              onClick={onCopyPnr}
              className="flex w-full px-3.5 py-2 text-left text-[13px] text-aerotake-navy hover:bg-aerotake-canvas"
            >
              {copied ? "PNR copied" : "Copy PNR"}
            </button>
          </div>
        ) : null}
      </td>
    </tr>
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
