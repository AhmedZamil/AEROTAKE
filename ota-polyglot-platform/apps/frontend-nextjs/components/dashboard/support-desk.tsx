"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildSupportPrefillSubject,
  consumeSupportPrefill,
  dummySupportTickets,
  readSupportPrefillFromUrl,
  type SupportPrefill,
  type SupportStatus,
  type SupportTicket,
  type SupportView,
} from "@/data/support-tickets";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CloseIcon,
  GridIcon,
  SearchIcon,
  SendIcon,
  TicketStubIcon,
} from "./icons";

const pageSizeOptions = [10, 25, 50];
const categories = ["Ticket copy", "Name change", "Baggage", "Seat request", "Invoice", "Other"];

let cachedSupportPrefill: SupportPrefill | null = null;

export default function SupportDesk() {
  const prefillAppliedRef = useRef(false);
  const [tickets, setTickets] = useState(dummySupportTickets);
  const [view, setView] = useState<SupportView>("dashboard");
  const [bookingDraft, setBookingDraft] = useState("");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [form, setForm] = useState({
    bookingId: "",
    category: "Ticket copy",
    subject: "",
  });

  const counts = useMemo(
    () => ({
      total: tickets.length,
      active: tickets.filter((ticket) => ticket.status === "active").length,
      closed: tickets.filter((ticket) => ticket.status === "closed").length,
    }),
    [tickets],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tickets
      .filter((ticket) => {
        if (view === "active" && ticket.status !== "active") return false;
        if (view === "closed" && ticket.status !== "closed") return false;
        if (!query) return true;
        return [ticket.id, ticket.bookingId, ticket.pnr, ticket.subject, ticket.category]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        const cmp = a.status.localeCompare(b.status);
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [search, sortDir, tickets, view]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const fromCount = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const toCount = Math.min(currentPage * pageSize, filtered.length);

  function applySupportPrefill(prefill: SupportPrefill) {
    setBookingDraft(prefill.bookingId);
    setForm({
      bookingId: prefill.bookingId,
      category: "Other",
      subject: buildSupportPrefillSubject(prefill.bookingId, prefill.pnr),
    });
    if (prefill.create) {
      setCreateOpen(true);
    }
  }

  useEffect(() => {
    if (!cachedSupportPrefill) {
      cachedSupportPrefill = consumeSupportPrefill() ?? readSupportPrefillFromUrl();
    }

    const prefill = cachedSupportPrefill;
    if (!prefill?.bookingId || prefillAppliedRef.current) return;

    prefillAppliedRef.current = true;
    applySupportPrefill(prefill);

    if (typeof window !== "undefined" && window.location.search) {
      window.history.replaceState({}, "", "/dashboard/support");
    }

    window.setTimeout(() => {
      cachedSupportPrefill = null;
    }, 0);
  }, []);

  function openCreate() {
    setForm({
      bookingId: bookingDraft.trim(),
      category: "Ticket copy",
      subject: "",
    });
    setCreateOpen(true);
  }

  function createTicket() {
    const bookingId = form.bookingId.trim().toUpperCase();
    const subject = form.subject.trim();
    if (!bookingId || !subject) {
      return;
    }

    const now = "24 Aug 2026, 02:48 PM";
    const ticket: SupportTicket = {
      id: `SUP-${Date.now().toString().slice(-8)}`,
      bookingId,
      pnr: "PENDING",
      subject,
      category: form.category,
      createdAt: now,
      updatedAt: now,
      status: "active",
    };
    setTickets((current) => [ticket, ...current]);
    setBookingDraft("");
    setCreateOpen(false);
    setView("active");
    setPage(1);
  }

  function setStatus(id: string, status: SupportStatus) {
    setTickets((current) =>
      current.map((ticket) =>
        ticket.id === id
          ? { ...ticket, status, updatedAt: "24 Aug 2026, 02:50 PM" }
          : ticket,
      ),
    );
    setSelected((ticket) =>
      ticket?.id === id ? { ...ticket, status, updatedAt: "24 Aug 2026, 02:50 PM" } : ticket,
    );
  }

  const cards = [
    {
      id: "dashboard" as const,
      label: "Total Supports",
      shortLabel: "Total",
      value: counts.total,
      tone: "text-aerotake-coral",
      icon: "bg-[#fff1f0] text-aerotake-coral",
    },
    {
      id: "active" as const,
      label: "Active Supports",
      shortLabel: "Active",
      value: counts.active,
      tone: "text-aerotake-success",
      icon: "bg-[#ecfdf3] text-aerotake-success",
    },
    {
      id: "closed" as const,
      label: "Closed Supports",
      shortLabel: "Closed",
      value: counts.closed,
      tone: "text-[#dc2626]",
      icon: "bg-[#fef2f2] text-[#dc2626]",
    },
  ];

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1360px] flex-col gap-5 px-3 py-4 pb-24 sm:px-6 sm:py-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-aerotake-navy">Support</h1>
        <p className="mt-1 text-[13px] text-aerotake-muted">
          Create tickets, track active cases, and review closed conversations.
        </p>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <aside className="w-full shrink-0 lg:sticky lg:top-4 lg:w-[236px]">
          <div className="rounded-2xl bg-white p-4 shadow-[0_10px_32px_rgba(15,23,42,0.05)]">
            <div className="flex items-center gap-3 border-b border-aerotake-border px-1 pb-4 lg:flex-col lg:text-center">
              <SupportAvatar />
              <div className="min-w-0 lg:w-full">
                <p className="truncate text-[14px] font-semibold text-aerotake-navy">
                  AeroTake Aviation
                </p>
                <p className="truncate text-[12px] text-aerotake-muted">partner@aerotake.com</p>
              </div>
            </div>

            <nav className="mt-3 flex gap-1 lg:flex-col">
              <NavItem
                active={view === "dashboard"}
                icon={GridIcon}
                label="Dashboard"
                shortLabel="Home"
                onClick={() => {
                  setView("dashboard");
                  setPage(1);
                }}
              />
              <NavItem
                active={view === "active"}
                icon={TicketStubIcon}
                label="Active Supports"
                shortLabel="Active"
                onClick={() => {
                  setView("active");
                  setPage(1);
                }}
              />
              <NavItem
                active={view === "closed"}
                icon={CloseIcon}
                label="Closed Supports"
                shortLabel="Closed"
                onClick={() => {
                  setView("closed");
                  setPage(1);
                }}
              />
            </nav>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {cards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => {
                  setView(card.id);
                  setPage(1);
                }}
                className={`rounded-2xl bg-white p-3 text-left shadow-[0_10px_32px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(15,23,42,0.08)] sm:p-5 ${
                  view === card.id ? "ring-2 ring-aerotake-coral/25" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2 sm:gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-aerotake-muted sm:text-[13px]">
                      <span className="sm:hidden">{card.shortLabel}</span>
                      <span className="hidden sm:inline">{card.label}</span>
                    </p>
                    <p className={`mt-1.5 text-[22px] leading-none font-bold sm:mt-2 sm:text-[32px] ${card.tone}`}>
                      {card.value}
                    </p>
                  </div>
                  <span className={`hidden h-12 w-12 shrink-0 items-center justify-center rounded-full sm:flex ${card.icon}`}>
                    <TicketStubIcon className="h-5 w-5" />
                  </span>
                </div>
              </button>
            ))}
          </div>

          <section className="rounded-2xl bg-white p-4 shadow-[0_10px_32px_rgba(15,23,42,0.05)] sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <h2 className="text-[16px] font-bold text-aerotake-navy">Supports Summary</h2>
              <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                <input
                  value={bookingDraft}
                  onChange={(event) => setBookingDraft(event.target.value)}
                  placeholder="Enter Booking Id"
                  className="h-11 w-full rounded-xl border border-aerotake-border bg-[#f8fafc] px-3.5 text-[13px] text-aerotake-navy outline-none placeholder:text-aerotake-muted focus:border-aerotake-coral focus:bg-white focus:ring-2 focus:ring-aerotake-coral/15 sm:w-[240px]"
                />
                <button
                  type="button"
                  onClick={openCreate}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-aerotake-coral px-4 text-[13px] font-semibold text-white shadow-[0_10px_20px_rgba(249,115,96,0.28)] hover:bg-aerotake-coral-dark sm:w-auto"
                >
                  <SendIcon className="h-4 w-4" />
                  Create Support
                </button>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                entries
              </label>
              <label className="relative w-full sm:max-w-[240px]">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-aerotake-muted">
                  <SearchIcon className="h-4 w-4" />
                </span>
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search..."
                  className="h-10 w-full rounded-xl border border-aerotake-border bg-white pr-3 pl-9 text-[13px] text-aerotake-navy outline-none placeholder:text-aerotake-muted focus:border-aerotake-coral"
                />
              </label>
            </div>

            <div className="mt-4 space-y-3 md:hidden">
              {visible.length ? (
                visible.map((ticket, index) => (
                  <article
                    key={ticket.id}
                    className="rounded-xl border border-aerotake-border bg-[#f8fafc] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-aerotake-muted">
                          #{(currentPage - 1) * pageSize + index + 1} · {ticket.id}
                        </p>
                        <p className="mt-1 text-[13px] font-semibold text-aerotake-navy">
                          {ticket.subject}
                        </p>
                      </div>
                      <StatusBadge status={ticket.status} />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-aerotake-border bg-white px-3 py-2">
                        <p className="text-[10px] font-semibold tracking-wide text-aerotake-muted uppercase">
                          Booking
                        </p>
                        <p className="mt-0.5 text-[12px] font-semibold text-aerotake-coral">
                          {ticket.bookingId}
                        </p>
                        <p className="mt-0.5 text-[11px] font-bold text-aerotake-navy">
                          PNR {ticket.pnr}
                        </p>
                      </div>
                      <div className="rounded-lg border border-aerotake-border bg-white px-3 py-2">
                        <p className="text-[10px] font-semibold tracking-wide text-aerotake-muted uppercase">
                          Category
                        </p>
                        <p className="mt-0.5 text-[12px] font-semibold text-aerotake-navy">
                          {ticket.category}
                        </p>
                        <p className="mt-0.5 text-[11px] text-aerotake-muted">
                          {ticket.updatedAt}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSelected(ticket)}
                        className="inline-flex h-10 items-center justify-center rounded-lg border border-aerotake-border bg-white text-[12px] font-semibold text-aerotake-navy"
                      >
                        View
                      </button>
                      {ticket.status === "active" ? (
                        <button
                          type="button"
                          onClick={() => setStatus(ticket.id, "closed")}
                          className="inline-flex h-10 items-center justify-center rounded-lg bg-[#fff1f0] text-[12px] font-semibold text-aerotake-coral"
                        >
                          Close
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setStatus(ticket.id, "active")}
                          className="inline-flex h-10 items-center justify-center rounded-lg bg-[#ecfdf3] text-[12px] font-semibold text-aerotake-success"
                        >
                          Reopen
                        </button>
                      )}
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-xl border border-aerotake-border px-4 py-10 text-center">
                  <p className="text-[14px] font-semibold text-aerotake-navy">
                    No data available in table
                  </p>
                  <p className="mt-1 text-[13px] text-aerotake-muted">
                    Create a support ticket with a booking ID to get started.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead className="bg-[#f8fafc] text-[12px] font-semibold tracking-wide text-aerotake-muted uppercase">
                  <tr>
                    <th className="rounded-l-xl px-4 py-3">Sl.No</th>
                    <th className="px-4 py-3">Support Details</th>
                    <th className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSortDir((value) => (value === "asc" ? "desc" : "asc"))}
                        className="inline-flex items-center gap-1"
                      >
                        Status
                        <span className="flex flex-col text-aerotake-muted">
                          <ChevronUpIcon className={`h-3 w-3 ${sortDir === "asc" ? "text-aerotake-coral" : ""}`} />
                          <ChevronDownIcon className={`-mt-1 h-3 w-3 ${sortDir === "desc" ? "text-aerotake-coral" : ""}`} />
                        </span>
                      </button>
                    </th>
                    <th className="rounded-r-xl px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length ? (
                    visible.map((ticket, index) => (
                      <tr key={ticket.id} className="border-t border-aerotake-border/80 hover:bg-[#fffaf8]">
                        <td className="px-4 py-4 text-[13px] font-medium text-aerotake-navy">
                          {(currentPage - 1) * pageSize + index + 1}
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-[13px] font-semibold text-aerotake-navy">{ticket.subject}</p>
                          <p className="mt-1 text-[12px] text-aerotake-muted">
                            {ticket.id} · Booking{" "}
                            <span className="font-medium text-aerotake-coral">{ticket.bookingId}</span>
                            {" · "}PNR {ticket.pnr}
                          </p>
                          <p className="mt-1 text-[11px] text-aerotake-muted">
                            {ticket.category} · Updated {ticket.updatedAt}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge status={ticket.status} />
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setSelected(ticket)}
                              className="h-9 rounded-lg border border-aerotake-border px-3 text-[12px] font-semibold text-aerotake-navy hover:bg-aerotake-canvas"
                            >
                              View
                            </button>
                            {ticket.status === "active" ? (
                              <button
                                type="button"
                                onClick={() => setStatus(ticket.id, "closed")}
                                className="h-9 rounded-lg bg-[#fff1f0] px-3 text-[12px] font-semibold text-aerotake-coral hover:bg-[#ffe4e0]"
                              >
                                Close
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setStatus(ticket.id, "active")}
                                className="h-9 rounded-lg bg-[#ecfdf3] px-3 text-[12px] font-semibold text-aerotake-success hover:bg-[#dcfce7]"
                              >
                                Reopen
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-16 text-center">
                        <p className="text-[14px] font-semibold text-aerotake-navy">
                          No data available in table
                        </p>
                        <p className="mt-1 text-[13px] text-aerotake-muted">
                          Create a support ticket with a booking ID to get started.
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
                  ? `Showing ${fromCount} to ${toCount} of ${filtered.length} entries`
                  : "No entries to show"}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2">
                <PageButton
                  disabled={currentPage === 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  Previous
                </PageButton>
                <PageButton
                  disabled={currentPage === pageCount}
                  onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                >
                  Next
                </PageButton>
              </div>
            </div>
          </section>
        </div>
      </div>

      {createOpen ? (
        <Modal title="Create Support" onClose={() => setCreateOpen(false)}>
          <div className="space-y-3">
            <Field label="Booking ID">
              <input
                value={form.bookingId}
                onChange={(event) => setForm((value) => ({ ...value, bookingId: event.target.value }))}
                placeholder="ATKBD26080001"
                className={fieldClass}
              />
            </Field>
            <Field label="Category">
              <select
                value={form.category}
                onChange={(event) => setForm((value) => ({ ...value, category: event.target.value }))}
                className={fieldClass}
              >
                {categories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </Field>
            <Field label="Subject">
              <textarea
                value={form.subject}
                onChange={(event) => setForm((value) => ({ ...value, subject: event.target.value }))}
                rows={4}
                placeholder="Describe the issue for this booking"
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
              onClick={createTicket}
              disabled={!form.bookingId.trim() || !form.subject.trim()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-aerotake-coral px-4 text-[13px] font-semibold text-white disabled:opacity-40 sm:h-10"
            >
              <SendIcon className="h-4 w-4" />
              Submit ticket
            </button>
          </div>
        </Modal>
      ) : null}

      {selected ? (
        <Modal title={selected.id} onClose={() => setSelected(null)}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusBadge status={selected.status} />
            <p className="text-[12px] text-aerotake-muted">Updated {selected.updatedAt}</p>
          </div>
          <p className="mt-4 text-[15px] font-semibold text-aerotake-navy">{selected.subject}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-[#f8fafc] p-4 text-[13px]">
            <Meta label="Booking ID" value={selected.bookingId} />
            <Meta label="GDS PNR" value={selected.pnr} />
            <Meta label="Category" value={selected.category} />
            <Meta label="Created" value={selected.createdAt} />
          </div>
          <div className="mt-5 grid grid-cols-1 gap-2 sm:flex sm:justify-end">
            {selected.status === "active" ? (
              <button
                type="button"
                onClick={() => setStatus(selected.id, "closed")}
                className="h-11 rounded-xl bg-[#fff1f0] px-4 text-[13px] font-semibold text-aerotake-coral sm:h-10"
              >
                Close ticket
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStatus(selected.id, "active")}
                className="h-11 rounded-xl bg-[#ecfdf3] px-4 text-[13px] font-semibold text-aerotake-success sm:h-10"
              >
                Reopen ticket
              </button>
            )}
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

function NavItem({
  active,
  icon: Icon,
  label,
  shortLabel,
  onClick,
}: {
  active: boolean;
  icon: (props: { className?: string }) => React.ReactNode;
  label: string;
  shortLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-[11px] transition sm:flex-row sm:gap-2 sm:px-3 sm:text-[13px] lg:justify-start ${
        active
          ? "bg-[#fff1f0] font-semibold text-aerotake-coral"
          : "text-aerotake-navy/70 hover:bg-aerotake-canvas hover:text-aerotake-navy"
      }`}
    >
      {active ? (
        <span className="absolute top-2 bottom-2 left-0 hidden w-[3px] rounded-full bg-aerotake-coral lg:block" />
      ) : null}
      <Icon className="h-4 w-4" />
      <span className="sm:hidden">{shortLabel}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function StatusBadge({ status }: { status: SupportStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        status === "active" ? "bg-[#ecfdf3] text-aerotake-success" : "bg-[#fef2f2] text-[#dc2626]"
      }`}
    >
      {status === "active" ? <CheckIcon className="h-3 w-3" /> : <CloseIcon className="h-3 w-3" />}
      {status === "active" ? "Active" : "Closed"}
    </span>
  );
}

function PageButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-10 w-full items-center justify-center gap-1 rounded-lg border border-aerotake-border bg-white px-3 text-[13px] font-semibold text-aerotake-navy hover:bg-aerotake-canvas disabled:opacity-40 sm:h-9 sm:w-auto"
    >
      {children === "Previous" ? <ChevronLeftIcon className="h-4 w-4" /> : null}
      {children}
      {children === "Next" ? <ChevronRightIcon className="h-4 w-4" /> : null}
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
      <p className="mt-1 break-words font-medium text-aerotake-navy">{value}</p>
    </div>
  );
}

function SupportAvatar() {
  return (
    <span className="relative h-12 w-12 overflow-hidden rounded-full bg-[#d7c4b3] ring-2 ring-[#fff1f0] lg:h-16 lg:w-16">
      <svg viewBox="0 0 80 80" className="h-full w-full" aria-hidden>
        <rect width="80" height="80" fill="#d7c4b3" />
        <circle cx="40" cy="30" r="13" fill="#3f2a1d" />
        <path d="M18 78c3-18 12-28 22-28s19 10 22 28" fill="#1f2a44" />
        <circle cx="40" cy="34" r="11" fill="#e8c7a8" />
        <path d="M24 30c6-12 26-14 32-2-8-8-24-8-32 2Z" fill="#2b1b12" />
      </svg>
    </span>
  );
}
