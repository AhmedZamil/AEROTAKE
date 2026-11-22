"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/context/AppProviders";

/** The page the confirmation email links to (token in the URL fragment). Confirms the address and shows the outcome. */
export default function VerifyEmailPage() {
  const { refreshUser } = useApp();
  const [state, setState] = useState<"working" | "ok" | "bad" | "missing">("working");
  const [attached, setAttached] = useState(0);

  useEffect(() => {
    const m = /(?:^|[#&])token=([^&]+)/.exec(window.location.hash);
    if (!m) {
      const id = window.setTimeout(() => setState("missing"), 0);
      return () => window.clearTimeout(id);
    }
    let live = true;
    void fetch("/api/auth/verify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: decodeURIComponent(m[1]!) }) })
      .then(async (res) => {
        if (!live) return;
        if (res.ok) {
          setAttached(((await res.json().catch(() => ({}))) as { attachedGuestBookings?: number }).attachedGuestBookings ?? 0);
          setState("ok");
          await refreshUser();
        } else {
          setState("bad");
        }
      })
      .catch(() => live && setState("bad"));
    return () => {
      live = false;
    };
  }, [refreshUser]);

  return (
    <div className="mx-auto max-w-md px-4 py-10 text-center sm:px-6">
      <h1 className="mb-4 text-3xl font-bold text-navy">Confirm your email</h1>
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-slate" role="status">
        {state === "working" ? <p>Confirming…</p> : null}
        {state === "ok" ? (
          <>
            <p className="font-semibold text-success-text">Your email address is confirmed.</p>
            {attached > 0 ? <p className="mt-2">{attached} earlier booking{attached === 1 ? " was" : "s were"} added to your account.</p> : null}
            <Link href="/my-bookings" className="btn-primary mt-4 inline-flex min-h-11 items-center rounded-full px-6 text-sm font-semibold">
              My bookings
            </Link>
          </>
        ) : null}
        {state === "bad" ? (
          <p>
            This link is no longer valid. It may have been used already or have expired.{" "}
            <Link href="/my-bookings" className="font-semibold text-primary-strong">
              Sign in and ask for a new one.
            </Link>
          </p>
        ) : null}
        {state === "missing" ? <p>This page needs the link from your confirmation email.</p> : null}
      </div>
    </div>
  );
}
