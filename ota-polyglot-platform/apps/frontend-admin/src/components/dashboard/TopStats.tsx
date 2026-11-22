import {
  ClipboardList,
  Star,
  Users,
  Ticket,
  PlusCircle,
  FolderOpen,
  Clock,
} from "lucide-react";
import { dashboardMock } from "@/data/dashboardMock";

export default function TopStats() {
  const { partners, tickets } = dashboardMock;

  return (
    <div className="grid gap-3 sm:gap-4 xl:grid-cols-[1fr_1.15fr] [&>*]:min-w-0">
      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4 [&>*]:min-w-0">
        <StatMini
          label="Total Partner"
          value={String(partners.total)}
          icon={<Users className="h-4 w-4" />}
          iconClass="bg-emerald-50 text-emerald-600"
        />
        <StatMini
          label="Most Active Partners"
          value={String(partners.mostActive)}
          icon={<Star className="h-4 w-4" />}
          iconClass="bg-rose-50 text-rose-500"
        />
        <StatMini
          label="New Partner Request"
          value={String(partners.newRequests)}
          icon={<ClipboardList className="h-4 w-4" />}
          iconClass="bg-sky-50 text-sky-600"
        />
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-4 [&>*]:min-w-0">
        <TicketStat
          label="Total Tickets"
          value={String(tickets.total)}
          icon={<Ticket className="h-3.5 w-3.5" />}
          iconClass="bg-violet-50 text-violet-600"
        />
        <TicketStat
          label="New Tickets"
          value={String(tickets.new)}
          icon={<PlusCircle className="h-3.5 w-3.5" />}
          iconClass="bg-emerald-50 text-emerald-600"
        />
        <TicketStat
          label="Open Tickets"
          value={String(tickets.open)}
          icon={<FolderOpen className="h-3.5 w-3.5" />}
          iconClass="bg-amber-50 text-amber-600"
        />
        <TicketStat
          label="Response Time"
          value={tickets.responseTime}
          icon={<Clock className="h-3.5 w-3.5" />}
          iconClass="bg-brand-soft text-brand"
          isText
        />
      </div>
    </div>
  );
}

function StatMini({
  label,
  value,
  icon,
  iconClass,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  iconClass: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconClass}`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <p
          title={value}
          className="truncate text-xl font-bold text-slate-900"
        >
          {value}
        </p>
        <p title={label} className="truncate text-xs text-slate-500">
          {label}
        </p>
      </div>
    </div>
  );
}

function TicketStat({
  label,
  value,
  icon,
  iconClass,
  isText,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  iconClass: string;
  isText?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 overflow-hidden rounded-lg px-2 py-1.5">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconClass}`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <p
          title={value}
          className={`truncate font-bold text-slate-900 ${isText ? "text-sm" : "text-lg"}`}
        >
          {value}
        </p>
        <p title={label} className="truncate text-[11px] text-slate-500">
          {label}
        </p>
      </div>
    </div>
  );
}
