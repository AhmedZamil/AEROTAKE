"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronDown, Plus, Search } from "lucide-react";
import {
  emailPreferenceMock,
  emailPreferencePartners,
  type EmailPreferenceItem,
} from "@/data/emailPreferenceMock";
import { partnerTabs } from "@/data/partnerMock";

function statusClass(status: EmailPreferenceItem["status"]) {
  return status === "Active"
    ? "bg-emerald-50 text-emerald-700"
    : "bg-slate-100 text-slate-600";
}

export default function PartnerEmailPreferenceContent() {
  const pathname = usePathname();
  const [partner, setPartner] = useState<string>(emailPreferencePartners[0]);
  const [subject, setSubject] = useState("");
  const [serviceType, setServiceType] = useState("All Email Service Type");
  const [emailFor, setEmailFor] = useState("Email For");
  const [attachedPdf, setAttachedPdf] = useState("Attached PDF Option");
  const [customerCopy, setCustomerCopy] = useState("Customer Copy Option");
  const [status, setStatus] = useState("All Status");
  const [searched, setSearched] = useState(true);
  const [applied, setApplied] = useState({
    partner: emailPreferencePartners[0] as string,
    subject: "",
    serviceType: "All Email Service Type",
    emailFor: "Email For",
    attachedPdf: "Attached PDF Option",
    customerCopy: "Customer Copy Option",
    status: "All Status",
  });

  const filtered = useMemo(() => {
    if (!searched) return [];

    let rows = [...emailPreferenceMock];

    if (applied.partner) {
      rows = rows.filter((r) => r.partner === applied.partner);
    }
    if (applied.subject.trim()) {
      const q = applied.subject.trim().toLowerCase();
      rows = rows.filter((r) => r.subject.toLowerCase().includes(q));
    }
    if (applied.serviceType !== "All Email Service Type") {
      rows = rows.filter((r) => r.serviceType === applied.serviceType);
    }
    if (applied.emailFor !== "Email For") {
      rows = rows.filter((r) => r.emailFor === applied.emailFor);
    }
    if (applied.attachedPdf !== "Attached PDF Option") {
      rows = rows.filter((r) => r.attachedPdf === applied.attachedPdf);
    }
    if (applied.customerCopy !== "Customer Copy Option") {
      rows = rows.filter((r) => r.customerCopy === applied.customerCopy);
    }
    if (applied.status !== "All Status") {
      rows = rows.filter((r) => r.status === applied.status);
    }

    return rows;
  }, [searched, applied]);

  function handleSearch() {
    setApplied({
      partner,
      subject,
      serviceType,
      emailFor,
      attachedPdf,
      customerCopy,
      status,
    });
    setSearched(true);
  }

  function handleReset() {
    setPartner(emailPreferencePartners[0]);
    setSubject("");
    setServiceType("All Email Service Type");
    setEmailFor("Email For");
    setAttachedPdf("Attached PDF Option");
    setCustomerCopy("Customer Copy Option");
    setStatus("All Status");
    setApplied({
      partner: emailPreferencePartners[0],
      subject: "",
      serviceType: "All Email Service Type",
      emailFor: "Email For",
      attachedPdf: "Attached PDF Option",
      customerCopy: "Customer Copy Option",
      status: "All Status",
    });
    setSearched(true);
  }

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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SelectField
            value={partner}
            onChange={setPartner}
            options={[...emailPreferencePartners]}
          />
          <TextField
            value={subject}
            onChange={setSubject}
            placeholder="Search by subject"
          />
          <SelectField
            value={serviceType}
            onChange={setServiceType}
            options={[
              "All Email Service Type",
              "Booking Confirmation",
              "Payment",
              "Schedule Change",
              "Void/Refund",
              "Invoice",
              "Cancellation",
              "Finance",
              "Report",
            ]}
          />
          <SelectField
            value={emailFor}
            onChange={setEmailFor}
            options={["Email For", "Customer", "Partner", "Admin"]}
          />
          <SelectField
            value={attachedPdf}
            onChange={setAttachedPdf}
            options={["Attached PDF Option", "Yes", "No"]}
          />
          <SelectField
            value={customerCopy}
            onChange={setCustomerCopy}
            options={["Customer Copy Option", "Yes", "No"]}
          />
          <SelectField
            value={status}
            onChange={setStatus}
            options={["All Status", "Active", "Inactive"]}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSearch}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
          >
            <Search className="h-4 w-4" />
            Search
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-5 py-2.5 text-sm font-semibold text-rose-500 transition hover:bg-rose-100"
          >
            Reset
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
              Please click search to load Email Preferences
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[280px] items-center justify-center">
            <p className="text-sm text-slate-400">No email preferences found</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {[
                    "Partner",
                    "Subject",
                    "Service Type",
                    "Email For",
                    "Attached PDF",
                    "Customer Copy",
                    "Status",
                    "Updated",
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
                    <td
                      title={row.partner}
                      className="max-w-[180px] truncate px-3 py-3.5 font-medium text-slate-800"
                    >
                      {row.partner}
                    </td>
                    <td
                      title={row.subject}
                      className="max-w-[220px] truncate px-3 py-3.5 text-slate-700"
                    >
                      {row.subject}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-slate-700">
                      {row.serviceType}
                    </td>
                    <td className="px-3 py-3.5 text-slate-700">{row.emailFor}</td>
                    <td className="px-3 py-3.5 text-slate-600">
                      {row.attachedPdf}
                    </td>
                    <td className="px-3 py-3.5 text-slate-600">
                      {row.customerCopy}
                    </td>
                    <td className="px-3 py-3.5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(row.status)}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-slate-500">
                      {row.updatedAt}
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
