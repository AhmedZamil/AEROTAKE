"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AirlineMark from "./airline-mark";
import { usePartnerProfile } from "./partner-profile";
import {
  BellIcon,
  BookingsIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  PlusIcon,
  ReportsIcon,
  RocketIcon,
  TicketStubIcon,
  UserPlusIcon,
  WalletIcon,
} from "./icons";

/** Shape of GET /api/dashboard/bookings — wraps the real
 * GET /api/v1/agents/{id}/bookings endpoint. No route/origin-destination
 * field: Booking has nothing like that persisted, only ever existed
 * transiently in the pre-booking search/cache layer. */
interface RecentBooking {
  id: string;
  pnr: string;
  status: string;
  supplierCode: string;
  finalPrice: number;
  currency: string;
  createdAt: string;
  ticketingDeadline: string | null;
  primaryTraveler: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  Confirmed: "bg-[#ecfdf3] text-aerotake-success",
  Pending: "bg-[#fff7ed] text-aerotake-warning",
};

// Matches core-engine's own TicketingWindow (24h from reservation) — an
// alert fires once a Pending booking's real deadline falls inside this
// window, not on an arbitrary frontend-chosen threshold.
const TICKETING_ALERT_WINDOW_MS = 24 * 60 * 60 * 1000;
const LOW_CREDIT_THRESHOLD = 0.1;

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

const kpis = [
  {
    label: "Total Booking",
    value: "1,250",
    change: "15.8%",
    icon: BookingsIcon,
    tone: "bg-[#fff1f0] text-[#ef4444]",
  },
  {
    label: "Total Ticket",
    value: "1,036",
    change: "12.4%",
    icon: TicketStubIcon,
    tone: "bg-[#f3e8ff] text-[#7c3aed]",
  },
  {
    label: "Sales in BDT",
    value: "৳ 2,485,750",
    change: "18.6%",
    icon: WalletIcon,
    tone: "bg-[#fff7ed] text-[#f59e0b]",
  },
  {
    label: "Top Ticketed Airline",
    value: "Biman Bangladesh",
    change: "22.1%",
    icon: RocketIcon,
    tone: "bg-[#ecfdf3] text-[#16a34a]",
  },
];

const airlineSales = [
  { name: "Biman Bangladesh", value: 92 },
  { name: "US-Bangla Airlines", value: 74 },
  { name: "Emirates", value: 61 },
  { name: "Qatar Airways", value: 48 },
  { name: "Saudia", value: 36 },
  { name: "Air Arabia", value: 22 },
];

const eventDots: Record<number, string[]> = {
  3: ["#f59e0b"],
  8: ["#ef4444", "#7c3aed"],
  12: ["#16a34a"],
  15: ["#f59e0b", "#ef4444"],
  18: ["#7c3aed"],
  22: ["#ef4444"],
  26: ["#16a34a", "#0ea5e9"],
  29: ["#f59e0b"],
};

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const weekdays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export default function DashboardHome() {
  const { credit, identity } = usePartnerProfile();
  const [bookings, setBookings] = useState<RecentBooking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(Boolean(identity.agentId));

  useEffect(() => {
    if (!identity.agentId) {
      setBookingsLoading(false);
      return;
    }

    let cancelled = false;
    setBookingsLoading(true);
    fetch("/api/dashboard/bookings", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: RecentBooking[]) => {
        if (!cancelled) setBookings(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        // Leave the list empty — this is a decoration widget, not the
        // money-moving path.
      })
      .finally(() => {
        if (!cancelled) setBookingsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [identity.agentId]);

  const alerts = useMemo(() => {
    const items: { id: string; icon: typeof WalletIcon; message: string; tone: string }[] = [];

    if (credit && credit.creditLimit !== null && credit.available !== null && credit.creditLimit > 0) {
      if (credit.available < credit.creditLimit * LOW_CREDIT_THRESHOLD) {
        items.push({
          id: "low-credit",
          icon: WalletIcon,
          tone: "bg-[#fff1f0] text-[#ef4444]",
          message: `Available credit is low: ${formatMoney(credit.available, "USD")} left of your ${formatMoney(
            credit.creditLimit,
            "USD",
          )} limit.`,
        });
      }
    }

    const now = Date.now();
    for (const booking of bookings) {
      if (booking.status !== "Pending" || !booking.ticketingDeadline) continue;
      const deadline = new Date(booking.ticketingDeadline).getTime();
      if (deadline < now || deadline - now > TICKETING_ALERT_WINDOW_MS) continue;
      items.push({
        id: `ticketing-${booking.id}`,
        icon: ClockIcon,
        tone: "bg-[#fff7ed] text-aerotake-warning",
        message: `PNR ${booking.pnr} needs ticketing before ${formatDate(booking.ticketingDeadline)}.`,
      });
    }

    return items;
  }, [credit, bookings]);

  const [cursor, setCursor] = useState({ year: 2026, month: 4 });
  const today = { year: 2026, month: 4, day: 22 };

  const cells = useMemo(() => {
    const firstWeekday = new Date(cursor.year, cursor.month, 1).getDay();
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const items: Array<number | null> = Array.from({ length: firstWeekday }, () => null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      items.push(day);
    }
    while (items.length % 7 !== 0) {
      items.push(null);
    }
    return items;
  }, [cursor]);

  const isCurrentMonth = cursor.year === today.year && cursor.month === today.month;

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-5 px-4 py-5 pb-24 sm:px-6">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-aerotake-navy">
          Welcome back, Admin!{" "}
          <span aria-hidden>👋</span>
        </h1>
        <p className="mt-1 text-sm text-aerotake-muted">
          Here’s what’s happening with your business today.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-aerotake-navy">
            <span className="text-aerotake-coral">
              <WalletIcon />
            </span>
            Credit Balance
          </h2>
          {credit && credit.creditLimit !== null ? (
            <div className="mt-4 space-y-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] text-aerotake-muted">Available</span>
                <span className="text-[20px] font-bold tracking-tight text-aerotake-navy">
                  {formatMoney(credit.available ?? 0, "USD")}
                </span>
              </div>
              <div className="flex items-baseline justify-between text-[12px] text-aerotake-muted">
                <span>Used</span>
                <span>{formatMoney(credit.creditUsed ?? 0, "USD")}</span>
              </div>
              <div className="flex items-baseline justify-between text-[12px] text-aerotake-muted">
                <span>Limit ({credit.tier ?? "—"} tier)</span>
                <span>{formatMoney(credit.creditLimit, "USD")}</span>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-[13px] text-aerotake-muted">
              {identity.agentId ? "Loading credit balance…" : "No agency credit to display."}
            </p>
          )}
        </article>

        <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-aerotake-navy">
            <span className="text-aerotake-coral">
              <BellIcon />
            </span>
            Alerts
          </h2>
          {alerts.length === 0 ? (
            <p className="mt-4 text-[13px] text-aerotake-muted">Nothing needs your attention right now.</p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {alerts.map((alert) => (
                <li key={alert.id} className="flex items-start gap-2.5">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${alert.tone}`}>
                    <alert.icon />
                  </span>
                  <p className="text-[13px] text-aerotake-navy">{alert.message}</p>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <article
            key={kpi.label}
            className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)]"
          >
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${kpi.tone}`}>
              <kpi.icon />
            </div>
            <p className="mt-4 text-[12px] text-aerotake-muted">{kpi.label}</p>
            <p className="mt-1 truncate text-[22px] leading-none font-bold tracking-tight text-aerotake-navy">
              {kpi.value}
            </p>
            <p className="mt-2 text-[12px] font-medium text-aerotake-success">
              ↗ {kpi.change}{" "}
              <span className="font-normal text-aerotake-muted">from last month</span>
            </p>
          </article>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
        <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-aerotake-navy">
              <span className="text-aerotake-coral">
                <CalendarIcon />
              </span>
              Event Calendar
            </h2>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() =>
                    setCursor((value) =>
                      value.month === 0
                        ? { year: value.year - 1, month: 11 }
                        : { year: value.year, month: value.month - 1 },
                    )
                  }
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-aerotake-muted hover:bg-aerotake-canvas"
                >
                  <ChevronLeftIcon />
                </button>
                <p className="min-w-[108px] text-center text-sm font-semibold text-aerotake-navy">
                  {monthNames[cursor.month]} {cursor.year}
                </p>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() =>
                    setCursor((value) =>
                      value.month === 11
                        ? { year: value.year + 1, month: 0 }
                        : { year: value.year, month: value.month + 1 },
                    )
                  }
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-aerotake-muted hover:bg-aerotake-canvas"
                >
                  <ChevronRightIcon />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setCursor({ year: today.year, month: today.month })}
                className="h-8 rounded-lg border border-aerotake-coral px-3 text-[12px] font-semibold text-aerotake-coral hover:bg-[#fff1f0]"
              >
                Today
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-7 gap-1 text-center">
            {weekdays.map((day) => (
              <p key={day} className="pb-2 text-[11px] font-semibold tracking-wide text-aerotake-muted">
                {day}
              </p>
            ))}
            {cells.map((day, index) => {
              const isToday = Boolean(day && isCurrentMonth && day === today.day);
              const dots = day && isCurrentMonth ? eventDots[day] : undefined;

              return (
                <div
                  key={`${cursor.month}-${index}`}
                  className="flex min-h-[64px] flex-col items-center rounded-xl px-1 py-1.5"
                >
                  {day ? (
                    <>
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${
                          isToday
                            ? "bg-aerotake-coral font-semibold text-white"
                            : "text-aerotake-navy"
                        }`}
                      >
                        {day}
                      </span>
                      <span className="mt-1 flex h-1.5 items-center justify-center gap-0.5">
                        {dots?.map((color) => (
                          <span
                            key={color}
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: color }}
                          />
                        ))}
                      </span>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        </article>

        <div className="flex flex-col gap-4">
          <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-aerotake-navy">
                Highest Ticketed Airlines
              </h2>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg border border-aerotake-border px-2.5 py-1 text-[12px] text-aerotake-muted"
              >
                This Month
                <ChevronDownIcon className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-5 space-y-3">
              {airlineSales.map((airline) => (
                <div key={airline.name} className="flex items-center gap-3">
                  <p className="w-[118px] shrink-0 truncate text-[12px] text-aerotake-navy">
                    {airline.name}
                  </p>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#f3f4f6]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-aerotake-coral to-[#fb923c]"
                      style={{ width: `${airline.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-aerotake-navy">
                Recent Bookings
              </h2>
              <Link
                href="/dashboard/bookings"
                className="text-[12px] font-medium text-aerotake-coral hover:underline"
              >
                View All
              </Link>
            </div>
            {bookingsLoading ? (
              <p className="py-6 text-center text-[13px] text-aerotake-muted">Loading recent bookings…</p>
            ) : bookings.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-aerotake-muted">No bookings yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-[#f1f3f5]">
                {bookings.map((booking) => (
                  <li key={booking.id} className="flex items-center gap-3 py-3">
                    <AirlineMark code={booking.supplierCode.slice(0, 2).toUpperCase()} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-aerotake-navy">
                        {booking.pnr} · {formatMoney(booking.finalPrice, booking.currency)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-aerotake-muted">
                        {booking.primaryTraveler ?? "—"} · {formatDate(booking.createdAt)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        STATUS_STYLES[booking.status] ?? "bg-aerotake-canvas text-aerotake-muted"
                      }`}
                    >
                      {booking.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <h2 className="text-[15px] font-semibold text-aerotake-navy">
              Quick Actions
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                {
                  label: "New Booking",
                  href: "/dashboard/search",
                  icon: PlusIcon,
                  tone: "bg-[#fff1f0] text-[#ef4444]",
                },
                {
                  label: "Issue Ticket",
                  href: "/dashboard/bookings",
                  icon: TicketStubIcon,
                  tone: "bg-[#eff6ff] text-[#2563eb]",
                },
                {
                  label: "Add Customer",
                  href: "/dashboard/passengers",
                  icon: UserPlusIcon,
                  tone: "bg-[#ecfdf3] text-[#16a34a]",
                },
                {
                  label: "Reports",
                  href: "/dashboard/reports",
                  icon: ReportsIcon,
                  tone: "bg-[#f3e8ff] text-[#7c3aed]",
                },
              ].map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className="flex flex-col items-center gap-2 rounded-xl bg-[#f8f9fb] px-2 py-4 text-center hover:bg-white hover:shadow-sm"
                >
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-full ${action.tone}`}
                  >
                    <action.icon />
                  </span>
                  <span className="text-[12px] font-medium text-aerotake-navy">
                    {action.label}
                  </span>
                </Link>
              ))}
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
