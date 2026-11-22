"use client";

import { LuTriangleAlert } from "react-icons/lu";

type Props = {
  open: boolean;
  onConfirm: () => void;
};

export default function TouristVisaNoticeModal({ open, onConfirm }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-navy/55 px-4 backdrop-blur-[1px]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="visa-notice-title"
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

        <h2
          id="visa-notice-title"
          className="mt-5 text-lg font-bold leading-snug text-navy sm:text-xl"
        >
          Important Notice for Tourist Visa Holders
        </h2>

        <p className="mt-4 text-sm font-bold text-navy">To avoid boarding denial, please ensure:</p>

        <ul className="mt-3 space-y-2 text-left text-sm leading-relaxed text-slate">
          <li className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate" aria-hidden />
            <span>Return ticket is with the same airline.</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate" aria-hidden />
            <span>Both flights are under one reservation (PNR).</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate" aria-hidden />
            <span>Return destination matches your original departure point.</span>
          </li>
        </ul>

        <button
          type="button"
          onClick={onConfirm}
          className="btn-primary mt-7 inline-flex min-h-11 w-full items-center justify-center rounded-xl px-6 text-sm font-semibold"
        >
          I Understand
        </button>
      </div>
    </div>
  );
}
