"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronDown, Plus, RotateCcw, Search } from "lucide-react";
import {
  apiLogMock,
  apiLogPartners,
  type ApiLogItem,
} from "@/data/apiLogMock";
import { partnerTabs } from "@/data/partnerMock";

function statusCodeClass(code: number) {
  if (code >= 200 && code < 300) return "bg-emerald-50 text-emerald-700";
  if (code >= 400 && code < 500) return "bg-amber-50 text-amber-700";
  return "bg-rose-50 text-rose-600";
}

export default function PartnerApiLogsContent() {
  const pathname = usePathname();
  const [partner, setPartner] = useState<string>(apiLogPartners[0]);
  const [apiType, setApiType] = useState("API Type");
  const [apiName, setApiName] = useState("All API");
  const [limit, setLimit] = useState("Last 20 Data");
  const [searched, setSearched] = useState(true);
  const [applied, setApplied] = useState({
    partner: apiLogPartners[0] as string,
    apiType: "API Type",
    apiName: "All API",
    limit: "Last 20 Data",
  });

  const filtered = useMemo(() => {
    if (!searched) return [];

    let rows = [...apiLogMock];

    if (applied.partner) {
      rows = rows.filter((r) => r.partner === applied.partner);
    }
    if (applied.apiType !== "API Type") {
      rows = rows.filter((r) => r.apiType === applied.apiType);
    }
    if (applied.apiName !== "All API") {
      rows = rows.filter((r) => r.apiName === applied.apiName);
    }

    const take = applied.limit.includes("50") ? 50 : 20;
    return rows.slice(0, take);
  }, [searched, applied]);

  function handleSearch() {
    setApplied({ partner, apiType, apiName, limit });
    setSearched(true);
  }

  function handleReset() {
    setPartner(apiLogPartners[0]);
    setApiType("API Type");
    setApiName("All API");
    setLimit("Last 20 Data");
    setApplied({
      partner: apiLogPartners[0],
      apiType: "API Type",
      apiName: "All API",
      limit: "Last 20 Data",
    });
    setSearched(true);
  }

  const apiTypes = [
    "API Type",
    ...Array.from(new Set(apiLogMock.map((r) => r.apiType))),
  ];
  const apiNames = [
    "All API",
    ...Array.from(new Set(apiLogMock.map((r) => r.apiName))),
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
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full sm:w-[220px]">
            <SelectField
              value={partner}
              onChange={setPartner}
              options={[...apiLogPartners]}
            />
          </div>
          <div className="w-full sm:w-[180px]">
            <SelectField
              value={apiType}
              onChange={setApiType}
              options={apiTypes}
            />
          </div>
          <div className="w-full sm:w-[180px]">
            <SelectField
              value={apiName}
              onChange={setApiName}
              options={apiNames}
            />
          </div>
          <div className="w-full sm:w-[160px]">
            <SelectField
              value={limit}
              onChange={setLimit}
              options={["Last 20 Data", "Last 50 Data"]}
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
              Please click search to load API logs
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[280px] items-center justify-center">
            <p className="text-sm text-slate-400">No API logs found</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {[
                    "Partner",
                    "API Type",
                    "API Name",
                    "Method",
                    "Endpoint",
                    "Status",
                    "Response",
                    "Requested At",
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
                {filtered.map((row: ApiLogItem) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-50 transition hover:bg-slate-50/80"
                  >
                    <td
                      title={row.partner}
                      className="max-w-[180px] truncate px-3 py-3.5 font-medium text-slate-800"
                    >
                      {row.partner}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-slate-700">
                      {row.apiType}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-slate-700">
                      {row.apiName}
                    </td>
                    <td className="px-3 py-3.5 font-semibold text-slate-800">
                      {row.method}
                    </td>
                    <td
                      title={row.endpoint}
                      className="max-w-[220px] truncate px-3 py-3.5 font-mono text-xs text-slate-600"
                    >
                      {row.endpoint}
                    </td>
                    <td className="px-3 py-3.5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusCodeClass(row.statusCode)}`}
                      >
                        {row.statusCode}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-slate-600">
                      {row.responseTime}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-slate-500">
                      {row.requestedAt}
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
