import {
  Ban,
  CheckCircle2,
  Clock3,
  MessageSquare,
  UserPlus,
  Wallet,
} from "lucide-react";
import { dashboardMock } from "@/data/dashboardMock";

const typeMeta: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  topup: { icon: Wallet, color: "bg-emerald-50 text-emerald-600" },
  partner: { icon: UserPlus, color: "bg-sky-50 text-sky-600" },
  ticket: { icon: MessageSquare, color: "bg-violet-50 text-violet-600" },
  booking: { icon: Clock3, color: "bg-amber-50 text-amber-600" },
  refund: { icon: CheckCircle2, color: "bg-emerald-50 text-emerald-600" },
  void: { icon: Ban, color: "bg-rose-50 text-rose-500" },
};

export default function RecentActivity() {
  const activities = dashboardMock.recentActivity;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-slate-900">
        Recent Activity
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        {activities.map((item) => {
          const meta = typeMeta[item.type] || typeMeta.booking;
          const Icon = meta.icon;
          return (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-3 transition hover:border-brand/20 hover:bg-brand-soft/40"
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${meta.color}`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">
                  {item.title}
                </p>
                <p className="text-xs text-slate-400">{item.time}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
