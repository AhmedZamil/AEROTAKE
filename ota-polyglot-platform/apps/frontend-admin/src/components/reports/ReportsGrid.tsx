import { FileText } from "lucide-react";

const reports = [
  { id: "general-ledger", title: "General Ledger", href: "#" },
  { id: "general-ledger-details", title: "General Ledger Details", href: "#" },
  { id: "sales-report", title: "Sales Report", href: "#" },
  { id: "top-up", title: "Top-Up", href: "#" },
  { id: "refund-void", title: "Refund & Void", href: "#" },
  { id: "partial-due", title: "Partial Due", href: "#" },
  { id: "partial-settlement", title: "Partial Settlement", href: "#" },
  { id: "revenue-summary", title: "Revenue Summary", href: "#" },
  { id: "day-close-summary", title: "Day Close Summary", href: "#" },
];

export default function ReportsGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {reports.map((report) => (
        <button
          key={report.id}
          type="button"
          className="group flex min-h-[140px] flex-col items-center justify-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-8 text-center shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-soft text-brand transition group-hover:bg-brand group-hover:text-white">
            <FileText className="h-6 w-6" />
          </div>
          <span className="text-sm font-semibold text-slate-800">
            {report.title}
          </span>
        </button>
      ))}
    </div>
  );
}
