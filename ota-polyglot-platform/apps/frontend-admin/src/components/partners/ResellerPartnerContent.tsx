"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronDown, Plus, RotateCcw, Search } from "lucide-react";
import {
  partnerTabs,
  resellerMock,
  type ResellerItem,
} from "@/data/partnerMock";

function statusClass(status: ResellerItem["status"]) {
  switch (status) {
    case "Active":
      return "bg-emerald-50 text-emerald-700";
    case "Pending":
      return "bg-amber-50 text-amber-700";
    case "Inactive":
      return "bg-slate-100 text-slate-600";
    case "Suspended":
      return "bg-rose-50 text-rose-600";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export default function ResellerPartnerContent() {
  const pathname = usePathname();
  const [partner, setPartner] = useState("Partner");
  const [branch, setBranch] = useState("All Branches");
  const [level, setLevel] = useState("All Levels");
  const [type, setType] = useState("All Types");
  const [status, setStatus] = useState("All Status");
  const [limit, setLimit] = useState("Show Last 20 Data");
  const [searched, setSearched] = useState(true);
  const [applied, setApplied] = useState({
    partner: "Partner",
    branch: "All Branches",
    level: "All Levels",
    type: "All Types",
    status: "All Status",
  });

  const filtered = useMemo(() => {
    if (!searched) return [];

    let rows = [...resellerMock];

    if (applied.partner !== "Partner") {
      rows = rows.filter((r) => r.name === applied.partner);
    }
    if (applied.branch !== "All Branches") {
      rows = rows.filter((r) => r.branch === applied.branch);
    }
    if (applied.level !== "All Levels") {
      rows = rows.filter((r) => r.level === applied.level);
    }
    if (applied.type !== "All Types") {
      rows = rows.filter((r) => r.type === applied.type);
    }
    if (applied.status !== "All Status") {
      rows = rows.filter((r) => r.status === applied.status);
    }

    const take = limit.includes("50") ? 50 : 20;
    return rows.slice(0, take);
  }, [searched, applied, limit]);

  function handleSearch() {
    setApplied({ partner, branch, level, type, status });
    setSearched(true);
  }

  function handleReset() {
    setPartner("Partner");
    setBranch("All Branches");
    setLevel("All Levels");
    setType("All Types");
    setStatus("All Status");
    setLimit("Show Last 20 Data");
    setApplied({
      partner: "Partner",
      branch: "All Branches",
      level: "All Levels",
      type: "All Types",
      status: "All Status",
    });
    setSearched(true);
  }

  const partnerNames = ["Partner", ...resellerMock.map((p) => p.name)];
  const branches = [
    "All Branches",
    ...Array.from(new Set(resellerMock.map((p) => p.branch))),
  ];

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

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SelectField
            value={partner}
            onChange={setPartner}
            options={partnerNames}
          />
          <SelectField
            value={branch}
            onChange={setBranch}
            options={branches}
          />
          <SelectField
            value={level}
            onChange={setLevel}
            options={["All Levels", "MASTER", "AGENT", "SUB"]}
          />
          <SelectField
            value={type}
            onChange={setType}
            options={["All Types", "B2B", "B2C"]}
          />
          <SelectField
            value={status}
            onChange={setStatus}
            options={["All Status", "Active", "Inactive", "Pending", "Suspended"]}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="w-full sm:w-[220px]">
            <SelectField
              value={limit}
              onChange={setLimit}
              options={["Show Last 20 Data", "Show Last 50 Data"]}
            />
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-500 transition hover:bg-rose-100"
            aria-label="Reset filters"
            title="Reset"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleSearch}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
          >
            <Search className="h-4 w-4" />
            Search
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        {!searched ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 text-center">
            <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Search className="h-7 w-7" />
            </div>
            <p className="text-base font-semibold text-slate-900">
              Please click search to find resellers
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[280px] items-center justify-center">
            <p className="text-sm text-slate-400">No resellers found</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {[
                    "Code",
                    "Reseller",
                    "Branch",
                    "Level",
                    "Type",
                    "Email",
                    "Phone",
                    "Balance",
                    "Status",
                    "Joined",
                  ].map((col) => (
                    <th
                      key={col}
                      className="px-3 py-3 text-xs font-semibold tracking-wide whitespace-nowrap text-slate-500 uppercase"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-50 transition hover:bg-slate-50/80"
                  >
                    <td className="px-3 py-3.5 font-semibold text-slate-800">
                      {row.code}
                    </td>
                    <td
                      title={row.name}
                      className="max-w-[160px] truncate px-3 py-3.5 font-medium text-slate-800"
                    >
                      {row.name}
                    </td>
                    <td
                      title={row.branch}
                      className="max-w-[130px] truncate px-3 py-3.5 text-slate-700"
                    >
                      {row.branch}
                    </td>
                    <td className="px-3 py-3.5 text-slate-700">{row.level}</td>
                    <td className="px-3 py-3.5 text-slate-700">{row.type}</td>
                    <td
                      title={row.email}
                      className="max-w-[180px] truncate px-3 py-3.5 text-slate-600"
                    >
                      {row.email}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-slate-600">
                      {row.phone}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 font-semibold text-slate-900">
                      {row.balance}
                    </td>
                    <td className="px-3 py-3.5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(row.status)}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-slate-500">
                      {row.joinedAt}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-9 pl-3.5 text-sm text-slate-700 outline-none transition focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}
