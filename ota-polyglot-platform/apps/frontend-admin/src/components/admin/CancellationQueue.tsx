"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import { ErrorNote, LiveBanner, messageOf, useLiveUser } from "@/components/admin/LiveScreen";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";

type CancelItem = {
  id: string;
  pnr: string;
  channel: string;
  bookingStatus: string;
  contactEmail: string | null;
  total: number;
  currency: string;
  customerNote: string | null;
  opsNote: string | null;
  status: string;
  createdAt: string;
  supplierPnr: string | null;
  supplierCode: string;
  routeSummary: string | null;
  travelers: string[];
  paymentStatus: string | null;
  refundStatus: string | null;
};

const channels = [
  { value: "B2C", label: "B2C" },
  { value: "B2B_AGENT", label: "B2B agency" },
  { value: "B2B_SUB_AGENT", label: "Sub-agent" },
  { value: "WHITE_LABEL", label: "White label" },
  { value: "", label: "All channels" },
];

export function CancellationQueueContent() {
  const user = useLiveUser();
  const [items, setItems] = useState<CancelItem[]>([]);
  const [status, setStatus] = useState("Requested");
  const [channel, setChannel] = useState("B2C");
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ status, pageSize: "50" });
    if (channel) params.set("channel", channel);
    const data = await adminApi<{ items: CancelItem[] }>(`/api/admin/cancellation-requests?${params.toString()}`);
    setItems(data.items);
  }, [status, channel]);

  useEffect(() => {
    load().catch((err) => setError(messageOf(err)));
  }, [load]);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Cancel requests</h1>
      <LiveBanner user={user}>
        Tickets a customer asked to cancel after they were issued. Cancel with the airline first, then complete the request to refund the card. Reject leaves the booking as it is.
      </LiveBanner>
      <ErrorNote error={error} />

      <div className="flex flex-wrap gap-3">
        <label className="text-sm text-slate-600">
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="Requested">Open</option>
            <option value="Completed">Completed</option>
            <option value="Rejected">Rejected</option>
            <option value="all">All</option>
          </select>
        </label>
        <label className="text-sm text-slate-600">
          Channel
          <select
            value={channel}
            onChange={(event) => setChannel(event.target.value)}
            className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
          >
            {channels.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
            No requests in this queue.
          </p>
        ) : (
          items.map((item) => (
            <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <button
                type="button"
                onClick={() => setOpenId(openId === item.id ? null : item.id)}
                className="flex w-full flex-wrap items-baseline justify-between gap-2 text-left"
              >
                <span className="font-semibold text-slate-900">
                  {item.pnr} · {item.routeSummary ?? "Route not stored"}
                </span>
                <span className="text-sm text-slate-500">
                  {item.currency} {item.total.toLocaleString()} · {item.status} · {item.channel}
                </span>
              </button>
              <p className="mt-1 text-sm text-slate-500">
                {item.travelers.join(", ") || "No traveller names"} · {new Date(item.createdAt).toLocaleString()}
              </p>
              {openId === item.id ? (
                <Detail
                  item={item}
                  onError={setError}
                  onDone={async () => {
                    setError("");
                    await load();
                  }}
                />
              ) : null}
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function Detail({
  item,
  onDone,
  onError,
}: {
  item: CancelItem;
  onDone: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<"complete" | "reject" | null>(null);
  const busy = pending !== null;
  const open = item.status === "Requested";

  async function act(kind: "complete" | "reject") {
    setPending(kind);
    try {
      await adminApi(`/api/admin/cancellation-requests/${item.id}/${kind}`, {
        method: "POST",
        body: { note: note.trim() || null },
      });
      await onDone();
    } catch (err) {
      onError(messageOf(err));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-4 text-sm">
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Supplier reference</dt>
          <dd className="font-medium text-slate-900">
            {item.supplierCode} {item.supplierPnr ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Booking</dt>
          <dd className="font-medium text-slate-900">
            {item.bookingStatus}
            {item.paymentStatus ? ` · payment ${item.paymentStatus}` : ""}
            {item.refundStatus ? ` · refund ${item.refundStatus}` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Contact</dt>
          <dd className="font-medium text-slate-900">{item.contactEmail ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Customer note</dt>
          <dd className="font-medium text-slate-900">{item.customerNote ?? "—"}</dd>
        </div>
      </dl>
      {item.opsNote ? <p className="mt-3 text-slate-500">Ops note: {item.opsNote}</p> : null}
      {open ? (
        <div className="mt-4 space-y-3">
          <label className="block text-sm text-slate-600" htmlFor={`note-${item.id}`}>
            Note
            <textarea
              id={`note-${item.id}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              placeholder="Required to reject. Optional when you complete."
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" />
            <span>I have cancelled this ticket with the airline. Completing refunds the customer through SSLCommerz.</span>
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy || !confirmed}
              aria-busy={pending === "complete"}
              onClick={() => act("complete")}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending === "complete" ? <ButtonSpinner /> : null}
              Complete and refund
            </button>
            <button
              type="button"
              disabled={busy || note.trim().length === 0}
              aria-busy={pending === "reject"}
              onClick={() => act("reject")}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
            >
              {pending === "reject" ? <ButtonSpinner className="h-4 w-4 text-slate-800" /> : null}
              Reject
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
