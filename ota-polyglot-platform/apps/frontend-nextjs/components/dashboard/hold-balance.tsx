"use client";

import { useMemo, useState } from "react";
import {
  dummyHoldTransactions,
  formatBalance,
  holdStatusMeta,
  holdTxnMeta,
  holdWallet,
  signedAmount,
  type HoldTransaction,
  type HoldTxnStatus,
  type HoldTxnType,
} from "@/data/hold-balance";
import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  ChevronUpIcon,
  CloseIcon,
  DollarIcon,
  FilterIcon,
  PlusIcon,
  SearchIcon,
  WalletIcon,
} from "./icons";

const pageSizeOptions = [10, 20, 50];
const defaultRange = "01/08/2026 - 24/08/2026";
const topUpMethods = ["Bank Transfer", "bKash", "Nagad", "Card"];

const typeFilters: { id: "all" | HoldTxnType; label: string }[] = [
  { id: "all", label: "All" },
  { id: "top-up", label: "Top-up" },
  { id: "hold", label: "Hold" },
  { id: "release", label: "Release" },
  { id: "debit", label: "Debit" },
  { id: "refund", label: "Refund" },
];

export default function HoldBalanceBoard() {
  const [transactions, setTransactions] = useState(dummyHoldTransactions);
  const [available, setAvailable] = useState(holdWallet.available);
  const [onHold] = useState(holdWallet.onHold);
  const [rangeDraft, setRangeDraft] = useState(defaultRange);
  const [appliedRange, setAppliedRange] = useState(defaultRange);
  const [typeFilter, setTypeFilter] = useState<"all" | HoldTxnType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | HoldTxnStatus>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<HoldTransaction | null>(null);
  const [form, setForm] = useState({
    amount: "",
    method: "Bank Transfer",
    note: "",
  });

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const { start, end } = splitRange(appliedRange);
    return transactions.filter((txn) => {
      if (typeFilter !== "all" && txn.type !== typeFilter) return false;
      if (statusFilter !== "all" && txn.status !== statusFilter) return false;
      if (start && txn.createdDate < start) return false;
      if (end && txn.createdDate > end) return false;
      if (!query) return true;
      return [txn.id, txn.bookingId ?? "", txn.pnr ?? "", txn.method, txn.note]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [appliedRange, search, statusFilter, transactions, typeFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const fromCount = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const toCount = Math.min(currentPage * pageSize, filtered.length);

  const totalBalance = available + onHold;
  const creditUsed = Math.min(100, Math.round((totalBalance / holdWallet.creditLimit) * 100));
  const filtersActive =
    typeFilter !== "all" || statusFilter !== "all" || appliedRange !== defaultRange;

  function applyFilters() {
    setAppliedRange(rangeDraft.trim() || defaultRange);
    setPage(1);
    setFiltersOpen(false);
  }

  function clearFilters() {
    setRangeDraft(defaultRange);
    setAppliedRange(defaultRange);
    setTypeFilter("all");
    setStatusFilter("all");
    setSearch("");
    setPage(1);
    setFiltersOpen(false);
  }

  function submitTopUp() {
    const amount = Number(form.amount.replace(/,/g, ""));
    if (!amount || amount <= 0) {
      return;
    }

    const txn: HoldTransaction = {
      id: `HB-${Date.now().toString().slice(-8)}`,
      type: "top-up",
      bookingId: null,
      pnr: null,
      amount,
      balanceAfter: available + amount,
      method: form.method,
      note: form.note.trim() || `Top-up via ${form.method}`,
      status: form.method === "Bank Transfer" ? "pending" : "success",
      createdAt: "24 Aug 2026, 04:02 PM",
      createdDate: "2026-08-24",
    };

    if (txn.status === "success") {
      setAvailable((value) => value + amount);
    }

    setTransactions((current) => [txn, ...current]);
    setTopUpOpen(false);
    setForm({ amount: "", method: "Bank Transfer", note: "" });
    setTypeFilter("top-up");
    setPage(1);
  }

  const summaryCards = [
    {
      label: "Available Balance",
      value: formatBalance(available),
      hint: "Ready to ticket",
      tone: "text-aerotake-coral",
      icon: "bg-[#fff1f0] text-aerotake-coral",
      Icon: WalletIcon,
    },
    {
      label: "On Hold",
      value: formatBalance(onHold),
      hint: "Locked for pending bookings",
      tone: "text-[#c2410c]",
      icon: "bg-[#fff7ed] text-[#c2410c]",
      Icon: ClockIcon,
    },
    {
      label: "Total Balance",
      value: formatBalance(totalBalance),
      hint: `Credit limit ${formatBalance(holdWallet.creditLimit)}`,
      tone: "text-aerotake-navy",
      icon: "bg-[#eff6ff] text-[#2563eb]",
      Icon: DollarIcon,
    },
    {
      label: "Last Top-up",
      value: holdWallet.lastTopUp,
      hint: holdWallet.agencyCode,
      tone: "text-aerotake-success",
      icon: "bg-[#ecfdf3] text-aerotake-success",
      Icon: CheckIcon,
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-5 px-3 py-4 pb-24 sm:px-6 sm:py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-aerotake-navy">Hold Balance</h1>
          <p className="mt-1 text-[13px] text-aerotake-muted">
            Track wallet credit, on-hold amounts, and top-up history for {holdWallet.agency}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setTopUpOpen(true)}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-aerotake-coral px-4 text-[13px] font-semibold text-white shadow-[0_10px_20px_rgba(249,115,96,0.28)] hover:bg-aerotake-coral-dark sm:w-auto"
        >
          <PlusIcon className="h-4 w-4" />
          Request Top-up
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {summaryCards.map((card) => {
            const Icon = card.Icon;
            return (
              <div
                key={card.label}
                className="rounded-2xl bg-white p-5 shadow-[0_10px_32px_rgba(15,23,42,0.05)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-aerotake-muted">{card.label}</p>
                    <p className={`mt-2 text-[22px] leading-tight font-bold break-words ${card.tone}`}>
                      {card.value}
                    </p>
                    <p className="mt-1.5 text-[12px] text-aerotake-muted">{card.hint}</p>
                  </div>
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${card.icon}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl bg-aerotake-navy p-5 text-white shadow-[0_10px_32px_rgba(15,23,42,0.12)]">
          <p className="text-[12px] font-medium tracking-wide text-white/60 uppercase">
            Agency Wallet
          </p>
          <p className="mt-2 text-[18px] font-bold">{holdWallet.agency}</p>
          <p className="mt-1 text-[13px] text-white/65">{holdWallet.agencyCode}</p>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between text-[12px]">
              <span className="text-white/65">Credit usage</span>
              <span className="font-semibold text-aerotake-coral">{creditUsed}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-aerotake-coral"
                style={{ width: `${creditUsed}%` }}
              />
            </div>
            <div className="mt-3 flex justify-between text-[12px] text-white/65">
              <span>Available {formatBalance(available)}</span>
              <span>Limit {formatBalance(holdWallet.creditLimit)}</span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/8 px-3 py-3">
              <p className="text-[11px] text-white/55">On Hold</p>
              <p className="mt-1 text-[14px] font-semibold">{formatBalance(onHold)}</p>
            </div>
            <div className="rounded-xl bg-white/8 px-3 py-3">
              <p className="text-[11px] text-white/55">Usable Now</p>
              <p className="mt-1 text-[14px] font-semibold text-aerotake-coral">
                {formatBalance(available)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <section className="rounded-2xl bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)] sm:p-5">
        <button
          type="button"
          onClick={() => setFiltersOpen((value) => !value)}
          className="flex h-11 w-full items-center justify-between rounded-xl border border-aerotake-border bg-aerotake-coral-light px-3.5 text-[13px] font-semibold text-aerotake-coral sm:hidden"
          aria-expanded={filtersOpen}
        >
          <span className="inline-flex items-center gap-2">
            <FilterIcon />
            Filter
            {filtersActive ? (
              <span className="rounded-full bg-aerotake-coral px-1.5 py-0.5 text-[10px] font-bold text-white">
                On
              </span>
            ) : null}
          </span>
          {filtersOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
        </button>
        <div
          className={`${
            filtersOpen ? "mt-3 flex" : "hidden"
          } flex-col gap-3 sm:mt-0 sm:flex sm:flex-col xl:flex-row xl:items-center`}
        >
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
            <span className="relative block sm:col-span-1">
              <input
                value={rangeDraft}
                onChange={(event) => setRangeDraft(event.target.value)}
                placeholder={defaultRange}
                className="h-11 w-full rounded-lg border border-aerotake-border bg-white py-0 pr-10 pl-3 text-[13px] text-aerotake-navy outline-none placeholder:text-aerotake-muted focus:border-aerotake-coral"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-aerotake-coral">
                <CalendarIcon className="h-4 w-4" />
              </span>
            </span>
            <span className="relative block">
              <select
                value={typeFilter}
                onChange={(event) => {
                  setTypeFilter(event.target.value as "all" | HoldTxnType);
                  setPage(1);
                }}
                className="h-11 w-full appearance-none rounded-lg border border-aerotake-border bg-white px-3 pr-9 text-[13px] text-aerotake-navy outline-none focus:border-aerotake-coral"
              >
                {typeFilters.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-aerotake-muted">
                <ChevronDownIcon className="h-4 w-4" />
              </span>
            </span>
            <span className="relative block">
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as "all" | HoldTxnStatus);
                  setPage(1);
                }}
                className="h-11 w-full appearance-none rounded-lg border border-aerotake-border bg-white px-3 pr-9 text-[13px] text-aerotake-navy outline-none focus:border-aerotake-coral"
              >
                <option value="all">All Status</option>
                <option value="success">Success</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-aerotake-muted">
                <ChevronDownIcon className="h-4 w-4" />
              </span>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
            <button
              type="button"
              onClick={applyFilters}
              className="h-11 w-full rounded-lg bg-aerotake-navy px-5 text-[13px] font-semibold text-white hover:bg-[#1e293b] sm:min-w-[128px] sm:w-auto"
            >
              Apply Filter
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="h-11 w-full rounded-lg border border-aerotake-coral bg-white px-5 text-[13px] font-semibold text-aerotake-coral hover:bg-[#fff1f0] sm:min-w-[110px] sm:w-auto"
            >
              Clear All
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-[16px] font-bold text-aerotake-navy">Transaction History</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-[13px] text-aerotake-muted">
              Show
              <span className="relative">
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                  className="h-9 appearance-none rounded-lg border border-aerotake-border bg-white py-0 pr-8 pl-3 text-[13px] text-aerotake-navy outline-none"
                >
                  {pageSizeOptions.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                  <ChevronDownIcon className="h-3.5 w-3.5" />
                </span>
              </span>
            </label>
            <label className="relative w-full sm:w-[240px]">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-aerotake-muted">
                <SearchIcon className="h-4 w-4" />
              </span>
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search txn / PNR / booking..."
                className="h-10 w-full rounded-xl border border-aerotake-border bg-white pr-3 pl-9 text-[13px] text-aerotake-navy outline-none placeholder:text-aerotake-muted focus:border-aerotake-coral"
              />
            </label>
          </div>
        </div>

        <div className="mt-4 space-y-3 md:hidden">
          {visible.length ? (
            visible.map((txn) => {
              const typeMeta = holdTxnMeta[txn.type];
              const statusMeta = holdStatusMeta[txn.status];
              return (
                <article
                  key={txn.id}
                  className="rounded-xl border border-aerotake-border bg-[#f8fafc] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-aerotake-navy">{txn.id}</p>
                      <p className="mt-0.5 text-[12px] text-aerotake-muted">{txn.createdAt}</p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusMeta.badge}`}
                    >
                      {statusMeta.label}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${typeMeta.badge}`}
                    >
                      {typeMeta.label}
                    </span>
                    <span className="text-[11px] text-aerotake-muted">{txn.method}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-aerotake-border bg-white px-3 py-2">
                      <p className="text-[10px] font-semibold tracking-wide text-aerotake-muted uppercase">
                        Amount
                      </p>
                      <p
                        className={`mt-0.5 text-[13px] font-bold ${
                          typeMeta.signed === "credit"
                            ? "text-aerotake-success"
                            : "text-aerotake-coral"
                        }`}
                      >
                        {signedAmount(txn)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-aerotake-border bg-white px-3 py-2">
                      <p className="text-[10px] font-semibold tracking-wide text-aerotake-muted uppercase">
                        Balance After
                      </p>
                      <p className="mt-0.5 text-[13px] font-semibold text-aerotake-navy">
                        {formatBalance(txn.balanceAfter)}
                      </p>
                    </div>
                    <div className="col-span-2 rounded-lg border border-aerotake-border bg-white px-3 py-2">
                      <p className="text-[10px] font-semibold tracking-wide text-aerotake-muted uppercase">
                        Reference
                      </p>
                      {txn.bookingId ? (
                        <p className="mt-0.5 text-[12px] text-aerotake-navy">
                          Booking{" "}
                          <span className="font-semibold text-aerotake-coral">{txn.bookingId}</span>
                          {" · "}PNR {txn.pnr}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-[12px] font-medium text-aerotake-muted">
                          Wallet operation
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelected(txn)}
                    className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-lg border border-aerotake-border bg-white text-[12px] font-semibold text-aerotake-navy"
                  >
                    View
                  </button>
                </article>
              );
            })
          ) : (
            <div className="rounded-xl border border-aerotake-border px-4 py-10 text-center">
              <p className="text-[15px] font-semibold text-aerotake-navy">No transactions found</p>
              <p className="mt-1 text-[13px] text-aerotake-muted">
                Try another filter or request a wallet top-up.
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead className="bg-[#f8fafc] text-[12px] font-semibold tracking-wide text-aerotake-muted uppercase">
              <tr>
                <th className="rounded-l-xl px-4 py-3">Transaction</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Balance After</th>
                <th className="px-4 py-3">Status</th>
                <th className="rounded-r-xl px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.length ? (
                visible.map((txn) => {
                  const typeMeta = holdTxnMeta[txn.type];
                  const statusMeta = holdStatusMeta[txn.status];
                  return (
                    <tr key={txn.id} className="border-t border-aerotake-border/80 hover:bg-[#fffaf8]">
                      <td className="px-4 py-4">
                        <p className="text-[13px] font-semibold text-aerotake-navy">{txn.id}</p>
                        <p className="mt-1 text-[12px] text-aerotake-muted">{txn.createdAt}</p>
                        <p className="mt-0.5 text-[11px] text-aerotake-muted">{txn.method}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${typeMeta.badge}`}
                        >
                          {typeMeta.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-[12px]">
                        {txn.bookingId ? (
                          <>
                            <p className="text-aerotake-muted">
                              Booking{" "}
                              <span className="font-semibold text-aerotake-coral">{txn.bookingId}</span>
                            </p>
                            <p className="mt-1 font-bold text-aerotake-navy">PNR {txn.pnr}</p>
                          </>
                        ) : (
                          <p className="font-medium text-aerotake-muted">Wallet operation</p>
                        )}
                      </td>
                      <td
                        className={`px-4 py-4 text-[13px] font-bold ${
                          typeMeta.signed === "credit" ? "text-aerotake-success" : "text-aerotake-coral"
                        }`}
                      >
                        {signedAmount(txn)}
                      </td>
                      <td className="px-4 py-4 text-[13px] font-semibold text-aerotake-navy">
                        {formatBalance(txn.balanceAfter)}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusMeta.badge}`}
                        >
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => setSelected(txn)}
                          className="h-9 rounded-lg border border-aerotake-border px-3 text-[12px] font-semibold text-aerotake-navy hover:bg-aerotake-canvas"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <p className="text-[15px] font-semibold text-aerotake-navy">No transactions found</p>
                    <p className="mt-1 text-[13px] text-aerotake-muted">
                      Try another filter or request a wallet top-up.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-aerotake-muted">
            {filtered.length
              ? `Showing ${fromCount} to ${toCount} of ${filtered.length} transactions`
              : "No entries to show"}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <PageButton
              ariaLabel="Previous page"
              disabled={currentPage === 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              <ChevronLeftIcon />
            </PageButton>
            {Array.from({ length: pageCount }, (_, index) => index + 1).map((item) => (
              <PageButton
                key={item}
                ariaLabel={`Page ${item}`}
                active={item === currentPage}
                onClick={() => setPage(item)}
              >
                {item}
              </PageButton>
            ))}
            <PageButton
              ariaLabel="Next page"
              disabled={currentPage === pageCount}
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            >
              <ChevronRightIcon />
            </PageButton>
          </div>
        </div>
      </section>

      {topUpOpen ? (
        <Modal title="Request Top-up" onClose={() => setTopUpOpen(false)}>
          <div className="space-y-3">
            <Field label="Amount (BDT)">
              <input
                value={form.amount}
                onChange={(event) => setForm((value) => ({ ...value, amount: event.target.value }))}
                placeholder="50000"
                inputMode="numeric"
                className={fieldClass}
              />
            </Field>
            <Field label="Payment method">
              <select
                value={form.method}
                onChange={(event) => setForm((value) => ({ ...value, method: event.target.value }))}
                className={fieldClass}
              >
                {topUpMethods.map((method) => (
                  <option key={method}>{method}</option>
                ))}
              </select>
            </Field>
            <Field label="Note">
              <textarea
                value={form.note}
                onChange={(event) => setForm((value) => ({ ...value, note: event.target.value }))}
                rows={3}
                placeholder="Reference number or remarks"
                className={`${fieldClass} h-auto py-2.5`}
              />
            </Field>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-2 sm:flex sm:justify-end">
            <button
              type="button"
              onClick={() => setTopUpOpen(false)}
              className="h-11 rounded-xl border border-aerotake-border px-4 text-[13px] font-semibold text-aerotake-navy sm:h-10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitTopUp}
              disabled={!Number(form.amount.replace(/,/g, ""))}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-aerotake-coral px-4 text-[13px] font-semibold text-white disabled:opacity-40 sm:h-10"
            >
              <PlusIcon className="h-4 w-4" />
              Submit top-up
            </button>
          </div>
        </Modal>
      ) : null}

      {selected ? (
        <Modal title={selected.id} onClose={() => setSelected(null)}>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                holdTxnMeta[selected.type].badge
              }`}
            >
              {holdTxnMeta[selected.type].label}
            </span>
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                holdStatusMeta[selected.status].badge
              }`}
            >
              {holdStatusMeta[selected.status].label}
            </span>
          </div>

          <div className="mt-4 grid gap-3 rounded-xl bg-[#f8fafc] p-4 text-[13px] sm:grid-cols-2">
            <Meta label="Amount" value={signedAmount(selected)} />
            <Meta label="Balance after" value={formatBalance(selected.balanceAfter)} />
            <Meta label="Method" value={selected.method} />
            <Meta label="Created" value={selected.createdAt} />
            <Meta label="Booking ID" value={selected.bookingId ?? "—"} />
            <Meta label="GDS PNR" value={selected.pnr ?? "—"} />
          </div>
          <p className="mt-4 text-[13px] leading-6 text-aerotake-navy">{selected.note}</p>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="h-11 w-full rounded-xl border border-aerotake-border px-4 text-[13px] font-semibold text-aerotake-navy sm:h-10 sm:w-auto"
            >
              Close
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

const fieldClass =
  "h-11 w-full rounded-xl border border-aerotake-border bg-white px-3 text-[13px] text-aerotake-navy outline-none focus:border-aerotake-coral";

function PageButton({
  children,
  onClick,
  disabled = false,
  active = false,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 min-w-8 items-center justify-center rounded-md text-[13px] font-semibold ${
        active
          ? "bg-aerotake-coral text-white"
          : "border border-aerotake-border bg-white text-aerotake-navy hover:bg-aerotake-canvas"
      } disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-aerotake-navy/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-lg rounded-t-2xl bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.18)] sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[16px] font-bold text-aerotake-navy">{title}</h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-aerotake-muted hover:bg-aerotake-canvas"
          >
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-aerotake-navy">{label}</span>
      {children}
    </label>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-wide text-aerotake-muted uppercase">{label}</p>
      <p className="mt-1 font-medium text-aerotake-navy">{value}</p>
    </div>
  );
}

function splitRange(range: string) {
  const [rawStart, rawEnd] = range.split("-").map((part) => part.trim());
  return {
    start: toIsoDate(rawStart),
    end: toIsoDate(rawEnd),
  };
}

function toIsoDate(value?: string) {
  if (!value) {
    return "";
  }
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    return "";
  }
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}
