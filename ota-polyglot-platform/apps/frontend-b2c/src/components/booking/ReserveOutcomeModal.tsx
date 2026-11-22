"use client";

import { LuTriangleAlert } from "react-icons/lu";

type Problem = {
  kind: "problem";
  message: string;
  /** A short-lived failure. The customer can try the same fare again. */
  retryable: boolean;
};

type Price = {
  kind: "price";
  previousLabel: string;
  nextLabel: string;
  next: number;
  dropped: boolean;
};

export type ReserveDialog = Problem | Price;

type Props = {
  dialog: ReserveDialog | null;
  onRetry: () => void;
  onAcceptPrice: () => void;
  onSearch: () => void;
};

export default function ReserveOutcomeModal({ dialog, onRetry, onAcceptPrice, onSearch }: Props) {
  if (!dialog) return null;

  const price = dialog.kind === "price";
  const title = price ? "The price has changed" : "We couldn't reserve this fare";
  const message = price
    ? dialog.dropped
      ? `The price has changed. It dropped from ${dialog.previousLabel} to ${dialog.nextLabel}.`
      : `The price has changed. It was ${dialog.previousLabel}. It is now ${dialog.nextLabel}.`
    : dialog.message;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-navy/55 px-4 backdrop-blur-[1px]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="reserve-outcome-title"
      aria-describedby="reserve-outcome-message"
    >
      <div className="w-full max-w-[420px] rounded-2xl bg-card px-6 py-8 text-center shadow-[0_20px_60px_rgba(16,24,40,0.28)] sm:px-8">
        <div
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-warning text-white shadow-[0_0_0_6px_rgba(247,144,9,0.25)]"
          aria-hidden
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-card">
            <LuTriangleAlert className="h-6 w-6 text-warning" strokeWidth={2.5} />
          </span>
        </div>

        <h2 id="reserve-outcome-title" className="mt-5 text-lg font-bold leading-snug text-navy sm:text-xl">
          {title}
        </h2>
        <p id="reserve-outcome-message" className="mt-4 text-sm leading-relaxed text-slate" role={price ? undefined : "alert"}>
          {message}
        </p>

        <div className="mt-7 space-y-3">
          {price ? (
            <button type="button" onClick={onAcceptPrice} className="btn-primary inline-flex min-h-11 w-full items-center justify-center rounded-xl px-6 text-sm font-semibold">
              Continue at the new price
            </button>
          ) : dialog.retryable ? (
            <button type="button" onClick={onRetry} className="btn-primary inline-flex min-h-11 w-full items-center justify-center rounded-xl px-6 text-sm font-semibold">
              Try again
            </button>
          ) : null}
          <button
            type="button"
            onClick={onSearch}
            className={
              price || (dialog.kind === "problem" && dialog.retryable)
                ? "inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border px-6 text-sm font-semibold text-navy"
                : "btn-primary inline-flex min-h-11 w-full items-center justify-center rounded-xl px-6 text-sm font-semibold"
            }
          >
            Back to search results
          </button>
        </div>
      </div>
    </div>
  );
}
