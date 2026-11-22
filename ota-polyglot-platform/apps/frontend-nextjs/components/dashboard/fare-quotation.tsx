"use client";

import { useMemo, useState } from "react";
import AirlineMark from "./airline-mark";
import {
  dummyFareQuotations,
  fareDifference,
  formatFare,
  quotationStatusMeta,
  type FareQuotation,
  type QuotationStatus,
} from "@/data/fare-quotations";
import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  QuotationIcon,
  SearchIcon,
  SendIcon,
} from "./icons";

const pageSizeOptions = [10, 20, 50];
const defaultRange = "01/08/2026 - 24/08/2026";

const statusFilters: { id: "all" | QuotationStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "quoted", label: "Quoted" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

export default function FareQuotationBoard() {
  const [quotations, setQuotations] = useState(dummyFareQuotations);
  const [pnrDraft, setPnrDraft] = useState("");
  const [bookingIdDraft, setBookingIdDraft] = useState("");
  const [rangeDraft, setRangeDraft] = useState(defaultRange);
  const [applied, setApplied] = useState({
    pnr: "",
    bookingId: "",
    range: defaultRange,
  });
  const [status, setStatus] = useState<"all" | QuotationStatus>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<FareQuotation | null>(null);
  const [form, setForm] = useState({
    bookingId: "",
    pnr: "",
    requestedDate: "",
    note: "",
  });

  const counts = useMemo(() => {
    const base = quotations.filter((item) => matchesApplied(item, applied));
    return {
      all: base.length,
      pending: base.filter((item) => item.status === "pending").length,
      quoted: base.filter((item) => item.status === "quoted").length,
      approved: base.filter((item) => item.status === "approved").length,
      rejected: base.filter((item) => item.status === "rejected").length,
    };
  }, [applied, quotations]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return quotations.filter((item) => {
      if (!matchesApplied(item, applied)) return false;
      if (status !== "all" && item.status !== status) return false;
      if (!query) return true;
      return [item.id, item.bookingId, item.pnr, item.airline, item.flightCode, item.note]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [applied, quotations, search, status]);

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
    });
    setPage(1);
  }

  function clearFilters() {
    setPnrDraft("");
    setBookingIdDraft("");
    setRangeDraft(defaultRange);
    setApplied({ pnr: "", bookingId: "", range: defaultRange });
    setStatus("all");
    setSearch("");
    setPage(1);
  }

  function openCreate() {
    setForm({
      bookingId: bookingIdDraft.trim(),
      pnr: pnrDraft.trim(),
      requestedDate: "",
      note: "",
    });
    setCreateOpen(true);
  }

  function createQuotation() {
    const bookingId = form.bookingId.trim().toUpperCase();
    const pnr = form.pnr.trim().toUpperCase() || "PENDING";
    const requestedDate = form.requestedDate.trim();
    if (!bookingId || !requestedDate) {
      return;
    }

    const next: FareQuotation = {
      id: `FCQ-${Date.now().toString().slice(-8)}`,
      bookingId,
      pnr,
      airlineCode: "BS",
      airline: "US-Bangla Airlines",
      flightCode: "BS 157",
      fromCode: "DAC",
      fromCity: "Dhaka",
      toCode: "CXB",
      toCity: "Cox's Bazar",
      currentDate: "22 Aug 2026",
      requestedDate,
      travelers: "1 Adult",
      originalFare: 8000,
      quotedFare: null,
      changeFee: null,
      status: "pending",
      requestedAt: "24 Aug 2026, 03:55 PM",
      requestedDateIso: "2026-08-24",
      note: form.note.trim() || "Fare change quotation requested.",
    };

    setQuotations((current) => [next, ...current]);
    setCreateOpen(false);
    setStatus("pending");
    setPage(1);
  }

  function updateStatus(id: string, nextStatus: QuotationStatus) {
    setQuotations((current) =>
      current.map((item) => (item.id === id ? { ...item, status: nextStatus } : item)),
    );
    setSelected((item) => (item?.id === id ? { ...item, status: nextStatus } : item));
  }

  const cards = [
    {
      id: "all" as const,
      label: "Total Requests",
      value: counts.all,
      tone: "text-aerotake-coral",
      icon: "bg-[#fff1f0] text-aerotake-coral",
    },
    {
      id: "pending" as const,
      label: "Pending",
      value: counts.pending,
      tone: "text-[#c2410c]",
      icon: "bg-[#fff7ed] text-[#c2410c]",
    },
    {
      id: "quoted" as const,
      label: "Quoted",
      value: counts.quoted,
      tone: "text-[#2563eb]",
      icon: "bg-[#eff6ff] text-[#2563eb]",
    },
    {
      id: "approved" as const,
      label: "Approved",
      value: counts.approved,
      tone: "text-aerotake-success",
      icon: "bg-[#ecfdf3] text-aerotake-success",
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-5 px-3 py-4 pb-24 sm:px-6 sm:py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-aerotake-navy">
            Fare Change Quotation
          </h1>
          <p className="mt-1 text-[13px] text-aerotake-muted">
            Request date-change quotes, compare fare differences, and track approvals.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-aerotake-coral px-4 text-[13px] font-semibold text-white shadow-[0_10px_20px_rgba(249,115,96,0.28)] hover:bg-aerotake-coral-dark sm:w-auto"
        >
          <SendIcon className="h-4 w-4" />
          Request Quotation
        </button>
      </div>

      <section className="rounded-2xl bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)] sm:p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
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

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {cards.map((card) => {
          const active = status === card.id || (card.id === "all" && status === "all");
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => {
                setStatus(card.id);
                setPage(1);
              }}
              className={`rounded-2xl bg-white p-3 text-left shadow-[0_10px_32px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(15,23,42,0.08)] sm:p-5 ${
                active ? "ring-2 ring-aerotake-coral/25" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2 sm:gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-aerotake-muted sm:text-[13px]">{card.label}</p>
                  <p className={`mt-1.5 text-[24px] leading-none font-bold sm:mt-2 sm:text-[32px] ${card.tone}`}>
                    {String(card.value).padStart(2, "0")}
                  </p>
                </div>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12 ${card.icon}`}>
                  {card.id === "pending" ? (
                    <ClockIcon className="h-5 w-5" />
                  ) : card.id === "approved" ? (
                    <CheckIcon className="h-5 w-5" />
                  ) : (
                    <QuotationIcon className="h-5 w-5" />
                  )}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <section className="rounded-2xl bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {statusFilters.map((item) => {
              const active = status === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setStatus(item.id);
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
                placeholder="Search quotations..."
                className="h-10 w-full rounded-xl border border-aerotake-border bg-white pr-3 pl-9 text-[13px] text-aerotake-navy outline-none placeholder:text-aerotake-muted focus:border-aerotake-coral"
              />
            </label>
          </div>
        </div>

        <div className="mt-4 space-y-3 md:hidden">
          {visible.length ? (
            visible.map((item) => {
              const meta = quotationStatusMeta[item.status];
              const diff = fareDifference(item);
              return (
                <article
                  key={item.id}
                  className="rounded-xl border border-aerotake-border bg-[#f8fafc] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <AirlineMark code={item.airlineCode} size="md" />
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-aerotake-navy">{item.id}</p>
                        <p className="mt-0.5 truncate text-[12px] text-aerotake-muted">
                          {item.airline} · {item.flightCode}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.badge}`}
                    >
                      {meta.label}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-aerotake-border bg-white px-3 py-2">
                      <p className="text-[10px] font-semibold tracking-wide text-aerotake-muted uppercase">
                        Booking
                      </p>
                      <p className="mt-0.5 text-[12px] font-semibold text-aerotake-coral">
                        {item.bookingId}
                      </p>
                      <p className="mt-0.5 text-[12px] font-bold text-aerotake-navy">PNR {item.pnr}</p>
                    </div>
                    <div className="rounded-lg border border-aerotake-border bg-white px-3 py-2">
                      <p className="text-[10px] font-semibold tracking-wide text-aerotake-muted uppercase">
                        Date change
                      </p>
                      <p className="mt-0.5 text-[12px] font-semibold text-aerotake-navy">
                        {item.fromCode} → {item.toCode}
                      </p>
                      <p className="mt-0.5 text-[11px] text-aerotake-muted">
                        {item.currentDate} →{" "}
                        <span className="font-medium text-aerotake-coral">{item.requestedDate}</span>
                      </p>
                    </div>
                    <div className="col-span-2 rounded-lg border border-aerotake-border bg-white px-3 py-2">
                      <p className="text-[10px] font-semibold tracking-wide text-aerotake-muted uppercase">
                        Fare
                      </p>
                      <p className="mt-0.5 text-[12px] text-aerotake-muted">
                        Original{" "}
                        <span className="font-semibold text-aerotake-navy">
                          {formatFare(item.originalFare)}
                        </span>
                      </p>
                      {item.quotedFare != null ? (
                        <p
                          className={`mt-0.5 text-[13px] font-bold ${
                            (diff ?? 0) > 0 ? "text-aerotake-coral" : "text-aerotake-success"
                          }`}
                        >
                          Diff {diff != null && diff > 0 ? "+" : ""}
                          {diff != null ? formatFare(diff) : "—"}
                          <span className="ml-2 text-[12px] font-medium text-aerotake-muted">
                            Quoted {formatFare(item.quotedFare)}
                          </span>
                        </p>
                      ) : (
                        <p className="mt-0.5 text-[12px] font-medium text-aerotake-muted">
                          Awaiting quote
                        </p>
                      )}
                    </div>
                  </div>

                  <p className="mt-2 text-[11px] text-aerotake-muted">{item.requestedAt}</p>

                  <div className="mt-3 grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelected(item)}
                      className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-aerotake-border bg-white text-[12px] font-semibold text-aerotake-navy"
                    >
                      View
                    </button>
                    {item.status === "quoted" ? (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => updateStatus(item.id, "approved")}
                          className="h-10 rounded-lg bg-[#ecfdf3] text-[12px] font-semibold text-aerotake-success"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => updateStatus(item.id, "rejected")}
                          className="h-10 rounded-lg bg-[#fff1f0] text-[12px] font-semibold text-aerotake-coral"
                        >
                          Reject
                        </button>
                      </div>
                    ) : item.status === "pending" ? (
                      <button
                        type="button"
                        onClick={() => updateStatus(item.id, "rejected")}
                        className="h-10 rounded-lg bg-[#fff1f0] text-[12px] font-semibold text-aerotake-coral"
                      >
                        Reject
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="rounded-xl border border-aerotake-border px-4 py-10 text-center">
              <p className="text-[15px] font-semibold text-aerotake-navy">No quotations found</p>
              <p className="mt-1 text-[13px] text-aerotake-muted">
                Try another filter or request a new fare change quotation.
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1080px] border-collapse text-left">
            <thead className="bg-[#f8fafc] text-[12px] font-semibold tracking-wide text-aerotake-muted uppercase">
              <tr>
                <th className="rounded-l-xl px-4 py-3">Quotation</th>
                <th className="px-4 py-3">Booking</th>
                <th className="px-4 py-3">Route Change</th>
                <th className="px-4 py-3">Fare Diff</th>
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3">Status</th>
                <th className="rounded-r-xl px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.length ? (
                visible.map((item) => {
                  const meta = quotationStatusMeta[item.status];
                  const diff = fareDifference(item);
                  return (
                    <tr key={item.id} className="border-t border-aerotake-border/80 hover:bg-[#fffaf8]">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <AirlineMark code={item.airlineCode} size="md" />
                          <div>
                            <p className="text-[13px] font-semibold text-aerotake-navy">{item.id}</p>
                            <p className="mt-1 text-[12px] text-aerotake-muted">
                              {item.airline} · {item.flightCode}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-[12px] text-aerotake-muted">
                          Booking{" "}
                          <span className="font-semibold text-aerotake-coral">{item.bookingId}</span>
                        </p>
                        <p className="mt-1 text-[13px] font-bold text-aerotake-navy">PNR {item.pnr}</p>
                        <p className="mt-0.5 text-[11px] text-aerotake-muted">{item.travelers}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-[13px] font-semibold text-aerotake-navy">
                          {item.fromCode} → {item.toCode}
                        </p>
                        <p className="mt-1 text-[12px] text-aerotake-muted">
                          {item.currentDate} →{" "}
                          <span className="font-medium text-aerotake-coral">{item.requestedDate}</span>
                        </p>
                      </td>
                      <td className="px-4 py-4 text-[12px]">
                        <p className="text-aerotake-muted">
                          Original{" "}
                          <span className="font-semibold text-aerotake-navy">
                            {formatFare(item.originalFare)}
                          </span>
                        </p>
                        {item.quotedFare != null ? (
                          <>
                            <p className="mt-1 text-aerotake-muted">
                              Quoted{" "}
                              <span className="font-semibold text-aerotake-navy">
                                {formatFare(item.quotedFare)}
                              </span>
                            </p>
                            <p
                              className={`mt-1 font-semibold ${
                                (diff ?? 0) > 0 ? "text-aerotake-coral" : "text-aerotake-success"
                              }`}
                            >
                              Diff {diff != null && diff > 0 ? "+" : ""}
                              {diff != null ? formatFare(diff) : "—"}
                            </p>
                          </>
                        ) : (
                          <p className="mt-1 font-medium text-aerotake-muted">Awaiting quote</p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-[12px] whitespace-nowrap text-aerotake-navy">
                        {item.requestedAt}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.badge}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSelected(item)}
                            className="h-9 rounded-lg border border-aerotake-border px-3 text-[12px] font-semibold text-aerotake-navy hover:bg-aerotake-canvas"
                          >
                            View
                          </button>
                          {item.status === "quoted" ? (
                            <button
                              type="button"
                              onClick={() => updateStatus(item.id, "approved")}
                              className="h-9 rounded-lg bg-[#ecfdf3] px-3 text-[12px] font-semibold text-aerotake-success hover:bg-[#dcfce7]"
                            >
                              Accept
                            </button>
                          ) : null}
                          {item.status === "pending" || item.status === "quoted" ? (
                            <button
                              type="button"
                              onClick={() => updateStatus(item.id, "rejected")}
                              className="h-9 rounded-lg bg-[#fff1f0] px-3 text-[12px] font-semibold text-aerotake-coral hover:bg-[#ffe4e0]"
                            >
                              Reject
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <p className="text-[15px] font-semibold text-aerotake-navy">No quotations found</p>
                    <p className="mt-1 text-[13px] text-aerotake-muted">
                      Try another filter or request a new fare change quotation.
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
              ? `Showing ${fromCount} to ${toCount} of ${filtered.length} quotations`
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

      {createOpen ? (
        <Modal title="Request Fare Change Quotation" onClose={() => setCreateOpen(false)}>
          <div className="space-y-3">
            <Field label="Booking ID">
              <input
                value={form.bookingId}
                onChange={(event) => setForm((value) => ({ ...value, bookingId: event.target.value }))}
                placeholder="ATKBD26080001"
                className={fieldClass}
              />
            </Field>
            <Field label="GDS PNR">
              <input
                value={form.pnr}
                onChange={(event) => setForm((value) => ({ ...value, pnr: event.target.value }))}
                placeholder="ABCDEF"
                className={fieldClass}
              />
            </Field>
            <Field label="Requested travel date">
              <input
                value={form.requestedDate}
                onChange={(event) =>
                  setForm((value) => ({ ...value, requestedDate: event.target.value }))
                }
                placeholder="25 Aug 2026"
                className={fieldClass}
              />
            </Field>
            <Field label="Note">
              <textarea
                value={form.note}
                onChange={(event) => setForm((value) => ({ ...value, note: event.target.value }))}
                rows={4}
                placeholder="Describe the fare change request"
                className={`${fieldClass} h-auto py-2.5`}
              />
            </Field>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-2 sm:flex sm:justify-end">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="h-11 rounded-xl border border-aerotake-border px-4 text-[13px] font-semibold text-aerotake-navy sm:h-10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={createQuotation}
              disabled={!form.bookingId.trim() || !form.requestedDate.trim()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-aerotake-coral px-4 text-[13px] font-semibold text-white disabled:opacity-40 sm:h-10"
            >
              <SendIcon className="h-4 w-4" />
              Submit request
            </button>
          </div>
        </Modal>
      ) : null}

      {selected ? (
        <Modal title={selected.id} onClose={() => setSelected(null)}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                quotationStatusMeta[selected.status].badge
              }`}
            >
              {quotationStatusMeta[selected.status].label}
            </span>
            <p className="text-[12px] text-aerotake-muted">Requested {selected.requestedAt}</p>
          </div>

          <div className="mt-4 grid gap-3 rounded-xl bg-[#f8fafc] p-4 text-[13px] sm:grid-cols-2">
            <Meta label="Booking ID" value={selected.bookingId} />
            <Meta label="GDS PNR" value={selected.pnr} />
            <Meta label="Airline" value={`${selected.airline} (${selected.flightCode})`} />
            <Meta label="Passengers" value={selected.travelers} />
            <Meta
              label="Route"
              value={`${selected.fromCity} (${selected.fromCode}) → ${selected.toCity} (${selected.toCode})`}
            />
            <Meta label="Date change" value={`${selected.currentDate} → ${selected.requestedDate}`} />
            <Meta label="Original fare" value={formatFare(selected.originalFare)} />
            <Meta
              label="Quoted fare"
              value={selected.quotedFare != null ? formatFare(selected.quotedFare) : "Pending"}
            />
            <Meta
              label="Change fee"
              value={selected.changeFee != null ? formatFare(selected.changeFee) : "—"}
            />
            <Meta
              label="Difference"
              value={
                fareDifference(selected) != null
                  ? `${(fareDifference(selected) ?? 0) > 0 ? "+" : ""}${formatFare(fareDifference(selected) ?? 0)}`
                  : "—"
              }
            />
          </div>

          <p className="mt-4 text-[13px] leading-6 text-aerotake-navy">{selected.note}</p>

          <div className="mt-5 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            {selected.status === "quoted" ? (
              <button
                type="button"
                onClick={() => updateStatus(selected.id, "approved")}
                className="h-11 rounded-xl bg-[#ecfdf3] px-4 text-[13px] font-semibold text-aerotake-success sm:h-10"
              >
                Accept quotation
              </button>
            ) : null}
            {selected.status === "pending" || selected.status === "quoted" ? (
              <button
                type="button"
                onClick={() => updateStatus(selected.id, "rejected")}
                className="h-11 rounded-xl bg-[#fff1f0] px-4 text-[13px] font-semibold text-aerotake-coral sm:h-10"
              >
                Reject
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="h-11 rounded-xl border border-aerotake-border px-4 text-[13px] font-semibold text-aerotake-navy sm:h-10"
            >
              Close
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

const fieldClass =
  "h-11 w-full rounded-xl border border-aerotake-border bg-white px-3 text-[13px] text-aerotake-navy outline-none focus:border-aerotake-coral";

function matchesApplied(
  item: FareQuotation,
  applied: { pnr: string; bookingId: string; range: string },
) {
  if (applied.pnr && !item.pnr.toLowerCase().includes(applied.pnr.toLowerCase())) {
    return false;
  }
  if (
    applied.bookingId &&
    !item.bookingId.toLowerCase().includes(applied.bookingId.toLowerCase())
  ) {
    return false;
  }
  const { start, end } = splitRange(applied.range);
  if (start && item.requestedDateIso < start) return false;
  if (end && item.requestedDateIso > end) return false;
  return true;
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

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-aerotake-navy/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.18)] sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[16px] font-bold text-aerotake-navy">{title}</h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-aerotake-muted hover:bg-aerotake-canvas"
          >
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-aerotake-navy">{label}</span>
      {children}
    </label>
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
