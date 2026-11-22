import { FileText } from "lucide-react";

const items = [
  { id: "top-up-list", title: "Top-Up List", href: "#" },
  { id: "sales", title: "Sales", href: "#" },
  { id: "analytics-details", title: "Analytics Details", href: "#" },
  { id: "analytics", title: "Analytics", href: "#" },
];

export default function SalesAnalyticsGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="group flex min-h-[150px] flex-col items-center justify-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-8 text-center shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-soft text-brand transition group-hover:bg-brand group-hover:text-white">
            <FileText className="h-6 w-6" />
          </div>
          <span className="text-sm font-semibold text-slate-800">
            {item.title}
          </span>
        </button>
      ))}
    </div>
  );
}
