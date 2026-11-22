import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { dashboardMock } from "@/data/dashboardMock";

export default function TransactionsAndMap() {
  const { recentTransactions, agentLocations } = dashboardMock;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="min-h-[280px] rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-slate-900">
          Recent Transactions
        </h2>
        <div className="space-y-3">
          {recentTransactions.map((tx) => {
            const isCredit =
              tx.type === "Top Up" || tx.type === "Refund Credit";
            return (
              <div
                key={tx.id}
                className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-3 transition hover:border-brand/20 hover:bg-brand-soft/30"
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    isCredit
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-rose-50 text-rose-500"
                  }`}
                >
                  {isCredit ? (
                    <ArrowDownLeft className="h-4 w-4" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {tx.partner}
                  </p>
                  <p className="text-xs text-slate-400">
                    {tx.type} · {tx.method} · {tx.time}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`text-sm font-bold ${
                      isCredit ? "text-emerald-600" : "text-slate-900"
                    }`}
                  >
                    {isCredit ? "+" : "-"}
                    {tx.amount}
                  </p>
                  <p
                    className={`text-[11px] font-medium ${
                      tx.status === "Success"
                        ? "text-emerald-500"
                        : "text-amber-500"
                    }`}
                  >
                    {tx.status}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="min-h-[280px] rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-slate-900">
          Agent Location
        </h2>
        <div className="relative h-[240px] overflow-hidden rounded-xl bg-gradient-to-br from-emerald-50 via-sky-50 to-slate-100">
          <svg
            viewBox="0 0 800 400"
            className="absolute inset-0 h-full w-full opacity-40"
            aria-hidden
          >
            <path
              fill="#86efac"
              d="M120 90c40-30 90-20 130 10 25 18 55 10 70-5 30-30 80-20 95 15 10 25 40 35 65 20 35-20 80-5 95 30 20 45-5 90-40 105-30 12-45 45-25 70 15 20-5 55-35 50-40-8-70 25-55 55 40 10 20 55-15 50-45-5-80-35-75-75-5-40-45-55-75-35-35 25-85 10-95-30-8-30 5-65 35-80 20-10 25-40 5-55-25-20-20-55 20-70z"
            />
            <path
              fill="#6ee7b7"
              d="M480 70c50-25 110-10 145 30 30 35 75 40 110 15 25-18 55-5 60 25 8 45-25 80-60 95-20 8-30 35-15 50 20 20 5 55-25 55-40 0-70-30-65-65-5-35-40-50-70-30-35 25-85 15-100-25-12-30 0-70 20-90z"
            />
            <path
              fill="#a7f3d0"
              d="M280 250c35-15 70 5 75 40 5 30-15 60-45 65-35 5-65-20-65-50 0-25 10-45 35-55z"
            />
          </svg>

          {agentLocations.map((m) => (
            <div
              key={m.label}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ top: m.top, left: m.left }}
            >
              <div className="flex flex-col items-center gap-1">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${m.color} ring-2 ring-white shadow`}
                />
                <span className="rounded bg-white/95 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 shadow-sm">
                  {m.label} · {m.agents}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
