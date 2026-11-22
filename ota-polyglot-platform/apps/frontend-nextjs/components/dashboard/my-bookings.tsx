"use client";

import { useMemo, useState } from "react";
import AirlineMark from "./airline-mark";
import SupportBookingLink from "./support-booking-link";
import {
  dummyBookings,
  formatFare,
  type Booking,
  type BookingStatus,
  type BookingTab,
} from "@/data/bookings";
import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CloseIcon,
  FilterIcon,
  HoldIcon,
  InfoIcon,
  MoreIcon,
  PlaneTakeoffIcon,
} from "./icons";

const PAGE_SIZE = 5;
const defaultRange = "01/08/2026 - 22/08/2026";

const tabs: { id: BookingTab; label: string }[] = [
  { id: "ticket", label: "Ticket" },
  { id: "void", label: "Void" },
  { id: "refund", label: "Refund" },
  { id: "reissue", label: "Reissue" },
];

const statusFilters: { id: "all" | BookingStatus; label: string; shortLabel: string }[] = [
  { id: "all", label: "All", shortLabel: "All" },
  { id: "on-hold", label: "On Hold", shortLabel: "On Hold" },
  { id: "booking-cancelled", label: "Booking Cancelled", shortLabel: "Cancelled" },
  { id: "in-progress", label: "In Progress", shortLabel: "Progress" },
  { id: "confirmed", label: "Confirmed", shortLabel: "Confirmed" },
  { id: "ticket-cancelled", label: "Ticket Cancelled", shortLabel: "Tkt Cancel" },
  { id: "expired", label: "Expired", shortLabel: "Expired" },
];

const statusStyles: Record<
  BookingStatus,
  { label: string; className: string; icon: "check" | "hold" | "close" }
> = {
  confirmed: {
    label: "Confirmed",
    className: "bg-[#ecfdf3] text-[#16a34a]",
    icon: "check",
  },
  "on-hold": {
    label: "On Hold",
    className: "bg-[#fff7ed] text-[#c2410c]",
    icon: "hold",
  },
  "booking-cancelled": {
    label: "Booking Cancelled",
    className: "bg-[#fef2f2] text-[#dc2626]",
    icon: "close",
  },
  "in-progress": {
    label: "In Progress",
    className: "bg-[#eff6ff] text-[#2563eb]",
    icon: "hold",
  },
  "ticket-cancelled": {
    label: "Ticket Cancelled",
    className: "bg-[#fef2f2] text-[#dc2626]",
    icon: "close",
  },
  expired: {
    label: "Expired",
    className: "bg-[#f3f4f6] text-aerotake-muted",
    icon: "close",
  },
};

export default function MyBookings() {
  const [tab, setTab] = useState<BookingTab>("ticket");
  const [status, setStatus] = useState<"all" | BookingStatus>("all");
  const [pnrDraft, setPnrDraft] = useState("");
  const [bookingIdDraft, setBookingIdDraft] = useState("");
  const [rangeDraft, setRangeDraft] = useState(defaultRange);
  const [applied, setApplied] = useState({
    pnr: "",
    bookingId: "",
    range: defaultRange,
  });
  const [page, setPage] = useState(1);
  const [openDetails, setOpenDetails] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, BookingStatus>>({});

  const filtered = useMemo(() => {
    const { start, end } = splitRange(applied.range);
    return dummyBookings.filter((booking) => {
      const currentStatus = statusOverrides[booking.id] ?? booking.status;
      if (booking.tab !== tab) {
        return false;
      }
      if (status !== "all" && currentStatus !== status) {
        return false;
      }
      if (applied.pnr && !booking.pnr.toLowerCase().includes(applied.pnr.toLowerCase())) {
        return false;
      }
      if (
        applied.bookingId &&
        !booking.id.toLowerCase().includes(applied.bookingId.toLowerCase())
      ) {
        return false;
      }
      if (start && booking.bookedDate < start) {
        return false;
      }
      if (end && booking.bookedDate > end) {
        return false;
      }
      return true;
    });
  }, [applied, status, statusOverrides, tab]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const fromCount = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const toCount = Math.min(currentPage * PAGE_SIZE, filtered.length);

  function applyFilters() {
    setApplied({
      pnr: pnrDraft.trim(),
      bookingId: bookingIdDraft.trim(),
      range: rangeDraft.trim() || defaultRange,
    });
    setPage(1);
    setFiltersOpen(false);
  }

  function clearFilters() {
    setPnrDraft("");
    setBookingIdDraft("");
    setRangeDraft(defaultRange);
    setApplied({ pnr: "", bookingId: "", range: defaultRange });
    setStatus("all");
    setPage(1);
    setFiltersOpen(false);
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

  const filtersActive =
    status !== "all" ||
    Boolean(applied.pnr) ||
    Boolean(applied.bookingId) ||
    applied.range !== defaultRange;

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1360px] flex-col gap-5 px-3 py-4 pb-24 sm:px-6 sm:py-5">
      <h1 className="text-[22px] font-bold tracking-tight text-aerotake-navy">My Bookings</h1>

      <div className="flex gap-4 overflow-x-auto border-b border-aerotake-border sm:flex-wrap sm:gap-6 sm:overflow-visible">
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                setStatus("all");
                setPage(1);
                setOpenDetails(null);
                setOpenMenu(null);
              }}
              className={`relative shrink-0 pb-3 text-[14px] font-medium ${
                active ? "text-aerotake-coral" : "text-aerotake-muted hover:text-aerotake-navy"
              }`}
            >
              {item.label}
              <span
                className={`absolute inset-x-0 -bottom-px h-[2px] rounded-full ${
                  active ? "bg-aerotake-coral" : "bg-transparent"
                }`}
              />
            </button>
          );
        })}
      </div>

      <section className="rounded-2xl bg-[#f7f8fa] p-3 sm:p-5">
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
          } flex-col gap-3 sm:mt-0 sm:flex`}
        >
          <div className="grid grid-cols-2 gap-2 sm:hidden">
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
                  className={`h-9 rounded-lg px-2 text-[12px] font-semibold ${
                    item.id === "expired" ? "col-span-2" : ""
                  } ${
                    active
                      ? "bg-aerotake-coral text-white"
                      : "border border-transparent bg-aerotake-coral-light text-[#fa573a]"
                  }`}
                >
                  {item.shortLabel}
                </button>
              );
            })}
          </div>
          <div className="hidden flex-wrap gap-x-5 gap-y-2 sm:flex">
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
                  className={`relative pb-2 text-[13px] font-medium ${
                    active ? "text-aerotake-coral" : "text-aerotake-muted hover:text-aerotake-navy"
                  }`}
                >
                  {item.label}
                  <span
                    className={`absolute inset-x-0 -bottom-px h-[2px] rounded-full ${
                      active ? "bg-aerotake-coral" : "bg-transparent"
                    }`}
                  />
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
              <FilterField label="GDS PNR">
                <input
                  value={pnrDraft}
                  onChange={(event) => setPnrDraft(event.target.value)}
                  placeholder="Enter GDS PNR"
                  className="h-11 w-full rounded-lg border border-aerotake-border bg-white px-3 text-[13px] text-aerotake-navy outline-none placeholder:text-aerotake-muted focus:border-aerotake-coral"
                />
              </FilterField>
              <FilterField label="Booking ID">
                <input
                  value={bookingIdDraft}
                  onChange={(event) => setBookingIdDraft(event.target.value)}
                  placeholder="Enter Booking ID"
                  className="h-11 w-full rounded-lg border border-aerotake-border bg-white px-3 text-[13px] text-aerotake-navy outline-none placeholder:text-aerotake-muted focus:border-aerotake-coral"
                />
              </FilterField>
              <FilterField label="Date Range">
                <span className="relative block">
                  <input
                    value={rangeDraft}
                    onChange={(event) => setRangeDraft(event.target.value)}
                    placeholder="01/08/2026 - 22/08/2026"
                    className="h-11 w-full rounded-lg border border-aerotake-border bg-white py-0 pr-10 pl-3 text-[13px] text-aerotake-navy outline-none placeholder:text-aerotake-muted focus:border-aerotake-coral"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-aerotake-coral">
                    <CalendarIcon className="h-4 w-4" />
                  </span>
                </span>
              </FilterField>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:flex lg:shrink-0">
              <button
                type="button"
                onClick={applyFilters}
                className="h-11 w-full rounded-lg bg-aerotake-navy px-5 text-[13px] font-semibold text-white hover:bg-[#1e293b] lg:min-w-[128px] lg:w-auto"
              >
                Apply Filter
              </button>
              <button
                type="button"
                onClick={clearFilters}
                className="h-11 w-full rounded-lg bg-aerotake-coral-light px-5 text-[13px] font-semibold text-aerotake-coral hover:bg-[#ffe4dc] lg:min-w-[110px] lg:w-auto"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-4">
        {visible.length ? (
          visible.map((booking) => {
            const currentStatus = statusOverrides[booking.id] ?? booking.status;
            return (
              <BookingCard
                key={booking.id}
                booking={{ ...booking, status: currentStatus }}
                detailsOpen={openDetails === booking.id}
                menuOpen={openMenu === booking.id}
                copied={copied === booking.pnr}
                onToggleDetails={() =>
                  setOpenDetails((value) => (value === booking.id ? null : booking.id))
                }
                onToggleMenu={() =>
                  setOpenMenu((value) => (value === booking.id ? null : booking.id))
                }
                onCopyPnr={() => {
                  void copyPnr(booking.pnr);
                  setOpenMenu(null);
                }}
                onContinue={() => {
                  setStatusOverrides((value) => ({ ...value, [booking.id]: "confirmed" }));
                  setOpenMenu(null);
                }}
              />
            );
          })
        ) : (
          <div className="rounded-2xl bg-white px-6 py-16 text-center shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
            <p className="text-[15px] font-semibold text-aerotake-navy">No bookings found</p>
            <p className="mt-1 text-[13px] text-aerotake-muted">
              Try another tab, status, or clear the current filters.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-aerotake-muted">
          Showing {fromCount} to {toCount} of {filtered.length} bookings
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
    </div>
  );
}

function BookingCard({
  booking,
  detailsOpen,
  menuOpen,
  copied,
  onToggleDetails,
  onToggleMenu,
  onCopyPnr,
  onContinue,
}: {
  booking: Booking;
  detailsOpen: boolean;
  menuOpen: boolean;
  copied: boolean;
  onToggleDetails: () => void;
  onToggleMenu: () => void;
  onCopyPnr: () => void;
  onContinue: () => void;
}) {
  const status = statusStyles[booking.status];

  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
      <div className="flex">
        <span className="w-[5px] shrink-0 bg-aerotake-coral" />
        <div className="min-w-0 flex-1 p-3 sm:p-5">
          <div className="flex items-start justify-between gap-2 lg:flex-wrap lg:items-center">
            <div className="min-w-0 flex-1 lg:contents">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${status.className}`}
              >
                {status.icon === "check" ? (
                  <CheckIcon className="h-3.5 w-3.5" />
                ) : status.icon === "hold" ? (
                  <HoldIcon className="h-3.5 w-3.5" />
                ) : (
                  <CloseIcon className="h-3.5 w-3.5" />
                )}
                {status.label}
              </span>
              <p className="mt-1.5 text-[13px] text-aerotake-navy lg:mt-0">
                Booking ID{" "}
                <span className="font-bold text-aerotake-coral">{booking.id}</span>
              </p>
              <p className="mt-0.5 text-[12px] text-aerotake-muted lg:mt-0 lg:ml-auto">
                Booked On: {booking.bookedOn}
              </p>
            </div>
            <div className="relative shrink-0">
              <button
                type="button"
                aria-label="Booking options"
                onClick={onToggleMenu}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-aerotake-muted hover:bg-aerotake-canvas hover:text-aerotake-navy"
              >
                <MoreIcon />
              </button>
              {menuOpen ? (
                <div className="absolute top-full right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-aerotake-border bg-white py-1 shadow-[0_12px_32px_rgba(15,23,42,0.12)]">
                  <button
                    type="button"
                    onClick={onCopyPnr}
                    className="flex w-full px-3.5 py-2 text-left text-[13px] text-aerotake-navy hover:bg-aerotake-canvas"
                  >
                    {copied ? "PNR copied" : "Copy PNR"}
                  </button>
                  <button
                    type="button"
                    onClick={onToggleDetails}
                    className="flex w-full px-3.5 py-2 text-left text-[13px] text-aerotake-navy hover:bg-aerotake-canvas"
                  >
                    View itinerary
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[200px_minmax(0,1fr)_150px_180px] lg:items-center lg:gap-5">
            <div className="flex items-start gap-3">
              <AirlineMark code={booking.airlineCode} size="lg" />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-aerotake-navy">{booking.airline}</p>
                <p className="mt-0.5 text-[12px] text-aerotake-muted">
                  {booking.flightCode} | {booking.cabin}
                </p>
                <span
                  className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    booking.refundable
                      ? "bg-[#ecfdf3] text-[#16a34a]"
                      : "bg-[#f3f4f6] text-aerotake-muted"
                  }`}
                >
                  {booking.refundable ? "Refundable" : "Non-refundable"}
                  <InfoIcon />
                </span>
              </div>
            </div>

            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-aerotake-navy">
                  {booking.fromCode}
                  <span className="hidden sm:inline"> {booking.fromCity}</span>
                </p>
                <p className="mt-1 text-[18px] leading-none font-bold text-aerotake-coral sm:text-[22px]">
                  {booking.departTime}
                </p>
                <p className="mt-1.5 text-[11px] text-aerotake-muted">{booking.departDate}</p>
                <p className="hidden text-[11px] text-aerotake-muted sm:block">{booking.fromAirport}</p>
              </div>
              <div className="min-w-0 flex-1 px-1 text-center">
                <p className="text-[11px] text-aerotake-muted">{booking.duration}</p>
                <div className="relative my-2 flex items-center">
                  <span className="h-px flex-1 border-t border-dashed border-[#c5cad3]" />
                  <span className="mx-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-aerotake-coral">
                    <PlaneTakeoffIcon className="h-4 w-4" />
                  </span>
                  <span className="h-px flex-1 border-t border-dashed border-[#c5cad3]" />
                </div>
                <p className="text-[11px] text-aerotake-muted">
                  {booking.stops === 0 ? "Non-stop" : `${booking.stops} stop`}
                </p>
              </div>
              <div className="min-w-0 text-right">
                <p className="text-[12px] font-semibold text-aerotake-navy">
                  {booking.toCode}
                  <span className="hidden sm:inline"> {booking.toCity}</span>
                </p>
                <p className="mt-1 text-[18px] leading-none font-bold text-aerotake-coral sm:text-[22px]">
                  {booking.arriveTime}
                </p>
                <p className="mt-1.5 text-[11px] text-aerotake-muted">{booking.arriveDate}</p>
                <p className="hidden text-[11px] text-aerotake-muted sm:block">{booking.toAirport}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-[12px] lg:block lg:space-y-2">
              <div>
                <p>
                  <span className="text-aerotake-muted">PNR</span>
                  <span className="mt-0.5 block font-semibold text-aerotake-coral">{booking.pnr}</span>
                </p>
                <button
                  type="button"
                  onClick={onCopyPnr}
                  className="mt-1 text-[11px] font-semibold text-aerotake-coral lg:hidden"
                >
                  {copied ? "Copied" : "Copy PNR"}
                </button>
              </div>
              <MetaRow label="Travelers" value={booking.travelers} />
              <div className="col-span-2 lg:col-span-1">
                <MetaRow label="Ticket No." value={booking.ticketNo} />
              </div>
            </div>

            <div className="flex w-full flex-col items-start gap-2 lg:w-auto lg:items-end">
              <div className="lg:text-right">
                <p className="text-[11px] text-aerotake-muted">Total Fare</p>
                <p className="mt-1 text-[20px] leading-none font-bold break-words text-aerotake-coral">
                  {formatFare(booking.price)}
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:flex-col">
              {booking.status === "on-hold" ? (
                <button
                  type="button"
                  onClick={onContinue}
                  className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-aerotake-coral px-4 text-[13px] font-semibold text-white hover:bg-aerotake-coral-dark lg:w-auto"
                >
                  Continue Booking
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onToggleDetails}
                  className="inline-flex h-10 w-full items-center justify-center gap-1 rounded-lg border border-aerotake-coral px-4 text-[13px] font-semibold text-aerotake-coral hover:bg-[#fff1f0] lg:w-auto"
                >
                  {detailsOpen ? "Hide Details" : "View Details"}
                  {detailsOpen ? (
                    <ChevronUpIcon className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDownIcon className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
              <SupportBookingLink
                bookingId={booking.id}
                pnr={booking.pnr}
                className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#0f766e] px-4 text-[13px] font-semibold text-white hover:bg-[#0d635d] lg:w-auto"
              >
                Support
              </SupportBookingLink>
              </div>
            </div>
          </div>

          {detailsOpen ? (
            <div className="mt-5 grid gap-3 rounded-xl bg-[#f8fafc] p-4 text-[13px] sm:grid-cols-3">
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-aerotake-muted uppercase">
                  Route
                </p>
                <p className="mt-1 font-medium text-aerotake-navy">
                  {booking.fromCity} ({booking.fromCode}) → {booking.toCity} ({booking.toCode})
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-aerotake-muted uppercase">
                  Passengers
                </p>
                <p className="mt-1 font-medium text-aerotake-navy">{booking.travelers}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-aerotake-muted uppercase">
                  Baggage
                </p>
                <p className="mt-1 font-medium text-aerotake-navy">20 KG check-in · 7 KG cabin</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function MetaRow({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <p>
      <span className="text-aerotake-muted">{label}</span>
      <span className={`mt-0.5 block font-semibold ${accent ? "text-aerotake-coral" : "text-aerotake-navy"}`}>
        {value}
      </span>
    </p>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-aerotake-navy">{label}</span>
      {children}
    </label>
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
