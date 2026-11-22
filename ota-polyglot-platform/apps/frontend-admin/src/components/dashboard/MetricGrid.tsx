import {
  Ban,
  CalendarDays,
  CircleDollarSign,
  Hourglass,
  PlaneTakeoff,
  RefreshCcw,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Ticket,
} from "lucide-react";
import { dashboardMock } from "@/data/dashboardMock";

export default function MetricGrid() {
  const { processing, metrics: m } = dashboardMock;

  const cards = [
    {
      label: "Total Booking",
      value: String(m.totalBooking),
      sub: `(Flight/Hotel) · ${m.totalBookingProcessing} in processing`,
      icon: PlaneTakeoff,
      iconBg: "bg-violet-100",
      iconColor: "text-violet-600",
      showCalendar: true,
    },
    {
      label: "Total Ticket",
      value: String(m.totalTicket),
      icon: Ticket,
      iconBg: "bg-sky-100",
      iconColor: "text-sky-600",
      showCalendar: true,
    },
    {
      label: "Total Sales",
      value: m.totalSales,
      icon: CircleDollarSign,
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-600",
      showCalendar: true,
    },
    {
      label: "Partial Pay Due",
      value: String(m.partialPayDue),
      icon: CircleDollarSign,
      iconBg: "bg-orange-100",
      iconColor: "text-orange-500",
    },
    {
      label: "Todays TopUp",
      value: m.todaysTopUp,
      sub: `${m.todaysTopUpProcessing} in processing`,
      icon: Hourglass,
      iconBg: "bg-indigo-100",
      iconColor: "text-indigo-600",
    },
    {
      label: "No of Void pending",
      value: String(m.voidPending),
      icon: Ban,
      iconBg: "bg-cyan-100",
      iconColor: "text-cyan-600",
    },
    {
      label: "No of Refund pending",
      value: String(m.refundPending),
      icon: RotateCcw,
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-600",
    },
    {
      label: "No of Reissue pending",
      value: String(m.reissuePending),
      icon: RefreshCcw,
      iconBg: "bg-rose-100",
      iconColor: "text-rose-500",
    },
  ];

  return (
    <div className="grid gap-3 lg:grid-cols-[200px_1fr] xl:grid-cols-[220px_1fr]">
      <div className="ticket-notch relative flex min-h-[180px] flex-col overflow-hidden rounded-2xl bg-brand text-white shadow-md shadow-brand/20 sm:min-h-[220px] lg:min-h-[220px]">
        <button
          type="button"
          className="flex flex-1 items-center justify-between px-5 py-5 text-left transition hover:bg-white/5"
        >
          <div>
            <p className="text-[28px] leading-none font-bold">
              {processing.processing}
            </p>
            <p className="mt-2 text-sm font-medium text-white/95">Processing</p>
          </div>
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-dark/70">
            <RefreshCw className="h-5 w-5 text-white" />
          </span>
        </button>

        <div className="relative mx-5">
          <div className="ticket-divider" />
        </div>

        <button
          type="button"
          className="flex flex-1 items-center justify-between px-5 py-5 text-left transition hover:bg-white/5"
        >
          <div>
            <p className="text-[28px] leading-none font-bold">
              {processing.actionRequire}
            </p>
            <p className="mt-2 text-sm font-medium text-white/95">
              Action Require
            </p>
          </div>
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-dark/70">
            <Sparkles className="h-5 w-5 text-white" />
          </span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="relative flex min-w-0 items-center gap-3 overflow-hidden rounded-2xl border border-transparent bg-white px-3.5 py-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition hover:border-brand/20 hover:shadow-md sm:px-4"
            >
              {card.showCalendar && (
                <CalendarDays className="absolute top-3 right-3 h-3.5 w-3.5 shrink-0 text-slate-300" />
              )}

              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12 ${card.iconBg}`}
              >
                <Icon className={`h-5 w-5 ${card.iconColor}`} />
              </div>

              <div className="min-w-0 flex-1 overflow-hidden pr-3">
                <p
                  title={card.value}
                  className="truncate text-lg leading-tight font-bold text-slate-900 sm:text-xl xl:text-2xl"
                >
                  {card.value}
                </p>
                <p
                  title={card.label}
                  className="mt-1.5 truncate text-[12px] font-medium text-slate-700 sm:text-[13px]"
                >
                  {card.label}
                </p>
                {card.sub && (
                  <p
                    title={card.sub}
                    className="mt-0.5 truncate text-[11px] font-medium text-emerald-500"
                  >
                    {card.sub}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
