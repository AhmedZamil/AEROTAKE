"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { branchMock, type BranchItem } from "@/data/branchMock";
import { partnerTabs } from "@/data/partnerMock";

function statusClass(status: BranchItem["status"]) {
  return status === "Active"
    ? "bg-emerald-50 text-emerald-700"
    : "bg-slate-100 text-slate-600";
}

function CountryFlag({ code }: { code: string }) {
  const flag =
    code === "BD"
      ? "🇧🇩"
      : code === "AE"
        ? "🇦🇪"
        : code === "SA"
          ? "🇸🇦"
          : "🏳️";

  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-base leading-none" aria-hidden>
        {flag}
      </span>
      <span className="font-medium text-slate-700">{code}</span>
    </span>
  );
}

export default function PartnerBranchContent() {
  const pathname = usePathname();

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
          Partners
        </h1>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 self-start rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
        >
          <Plus className="h-4 w-4" />
          New Partner/Agent
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto overscroll-x-contain border-b border-slate-200 pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {partnerTabs.map((tab) => {
          const active = tab.href === pathname;
          return (
            <Link
              key={tab.label}
              href={tab.href}
              className={`relative shrink-0 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition ${
                active ? "text-brand" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
              {active && (
                <span className="absolute right-1 bottom-0 left-1 h-0.5 rounded-full bg-brand" />
              )}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">
          Manage Branches
        </h2>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 self-start rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
        >
          <Plus className="h-4 w-4" />
          Create New Branch
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="table-scroll">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead>
              <tr className="bg-slate-800 text-white">
                {[
                  "SL",
                  "Branch",
                  "Country",
                  "Address",
                  "Timezone",
                  "Currency",
                  "Last Updated",
                  "Status",
                  "Actions",
                ].map((col) => (
                  <th
                    key={col}
                    className="px-4 py-3.5 text-xs font-semibold tracking-wide whitespace-nowrap uppercase"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {branchMock.map((row, index) => (
                <tr
                  key={row.id}
                  className="border-b border-slate-100 transition hover:bg-slate-50/80"
                >
                  <td className="px-4 py-4 font-medium text-slate-700">
                    {index + 1}
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-slate-900">{row.name}</p>
                    <p className="mt-0.5 text-xs font-medium text-brand">
                      ID: {row.code}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <CountryFlag code={row.countryCode} />
                  </td>
                  <td
                    title={row.address}
                    className="max-w-[280px] px-4 py-4 text-slate-600"
                  >
                    <span className="line-clamp-2">{row.address}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-slate-700">
                    {row.timezone}
                  </td>
                  <td className="px-4 py-4 font-medium text-slate-800">
                    {row.currency}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-slate-500">
                    {row.lastUpdated}
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(row.status)}`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
