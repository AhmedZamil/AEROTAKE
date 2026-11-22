"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronDown, Plus, RotateCcw, Search } from "lucide-react";
import {
  partnerRequestMock,
  type PartnerRequestItem,
} from "@/data/partnerRequestMock";
import { partnerTabs } from "@/data/partnerMock";

function statusClass(status: PartnerRequestItem["status"]) {
  switch (status) {
    case "Approved":
      return "bg-emerald-50 text-emerald-700";
    case "Request":
      return "bg-sky-50 text-sky-700";
    case "Under Review":
      return "bg-amber-50 text-amber-700";
    case "Rejected":
      return "bg-rose-50 text-rose-600";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export default function PartnerRequestContent() {
  const pathname = usePathname();
  const [enrollmentCode, setEnrollmentCode] = useState("");
  const [legalName, setLegalName] = useState("");
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");
  const [branch, setBranch] = useState("All Branches");
  const [requestStatus, setRequestStatus] = useState("All Requests");
  const [timeRange, setTimeRange] = useState("All Time");
  const [searched, setSearched] = useState(true);
  const [applied, setApplied] = useState({
    enrollmentCode: "",
    legalName: "",
    email: "",
    contact: "",
    branch: "All Branches",
    requestStatus: "All Requests",
    timeRange: "All Time",
  });

  const filtered = useMemo(() => {
    if (!searched) return [];

    let rows = [...partnerRequestMock];

    if (applied.enrollmentCode.trim()) {
      const q = applied.enrollmentCode.trim().toLowerCase();
      rows = rows.filter((r) =>
        r.enrollmentCode.toLowerCase().includes(q),
      );
    }
    if (applied.legalName.trim()) {
      const q = applied.legalName.trim().toLowerCase();
      rows = rows.filter((r) => r.legalName.toLowerCase().includes(q));
    }
    if (applied.email.trim()) {
      const q = applied.email.trim().toLowerCase();
      rows = rows.filter((r) => r.email.toLowerCase().includes(q));
    }
    if (applied.contact.trim()) {
      const q = applied.contact.trim().toLowerCase();
      rows = rows.filter((r) => r.contact.toLowerCase().includes(q));
    }
    if (applied.branch !== "All Branches") {
      rows = rows.filter((r) => r.branch === applied.branch);
    }
    if (applied.requestStatus !== "All Requests") {
      rows = rows.filter((r) => r.status === applied.requestStatus);
    }

    return rows;
  }, [searched, applied]);

  function handleSearch() {
    setApplied({
      enrollmentCode,
      legalName,
      email,
      contact,
      branch,
      requestStatus,
      timeRange,
    });
    setSearched(true);
  }

  function handleReset() {
    setEnrollmentCode("");
    setLegalName("");
    setEmail("");
    setContact("");
    setBranch("All Branches");
    setRequestStatus("All Requests");
    setTimeRange("All Time");
    setApplied({
      enrollmentCode: "",
      legalName: "",
      email: "",
      contact: "",
      branch: "All Branches",
      requestStatus: "All Requests",
      timeRange: "All Time",
    });
    setSearched(true);
  }

  const branches = [
    "All Branches",
    ...Array.from(new Set(partnerRequestMock.map((p) => p.branch))),
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
          <TextField
            value={enrollmentCode}
            onChange={setEnrollmentCode}
            placeholder="Enter enrollment code"
          />
          <TextField
            value={legalName}
            onChange={setLegalName}
            placeholder="Enter legal name"
          />
          <TextField
            value={email}
            onChange={setEmail}
            placeholder="Enter email address"
          />
          <TextField
            value={contact}
            onChange={setContact}
            placeholder="Enter contact number"
          />
          <SelectField
            value={branch}
            onChange={setBranch}
            options={branches}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="w-full sm:w-[180px]">
            <SelectField
              value={requestStatus}
              onChange={setRequestStatus}
              options={[
                "All Requests",
                "Request",
                "Under Review",
                "Approved",
                "Rejected",
              ]}
            />
          </div>
          <div className="w-full sm:w-[180px]">
            <SelectField
              value={timeRange}
              onChange={setTimeRange}
              options={["All Time", "Today", "Last 7 Days", "Last 30 Days"]}
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
              Please click search to view partner requests
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[280px] items-center justify-center">
            <p className="text-sm text-slate-400">No partner requests found</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {[
                    "Enrollment Code",
                    "Legal Name",
                    "Email",
                    "Contact",
                    "Branch",
                    "Status",
                    "Requested",
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
                      {row.enrollmentCode}
                    </td>
                    <td
                      title={row.legalName}
                      className="max-w-[180px] truncate px-3 py-3.5 font-medium text-slate-800"
                    >
                      {row.legalName}
                    </td>
                    <td
                      title={row.email}
                      className="max-w-[200px] truncate px-3 py-3.5 text-slate-600"
                    >
                      {row.email}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-slate-600">
                      {row.contact}
                    </td>
                    <td
                      title={row.branch}
                      className="max-w-[130px] truncate px-3 py-3.5 text-slate-700"
                    >
                      {row.branch}
                    </td>
                    <td className="px-3 py-3.5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(row.status)}`}
                      >
                        {row.status}
                      </span>
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

function TextField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15"
    />
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
