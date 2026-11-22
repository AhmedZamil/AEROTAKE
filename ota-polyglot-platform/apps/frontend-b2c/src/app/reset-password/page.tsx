"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/context/AppProviders";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";

/** The page the reset email links to. The token is in the URL fragment (#token=…), which browsers never send to a server or write to a log. */
export default function ResetPasswordPage() {
  const { refreshUser } = useApp();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const m = /(?:^|[#&])token=([^&]+)/.exec(window.location.hash);
    const id = window.setTimeout(() => setToken(m ? decodeURIComponent(m[1]!) : null), 0);
    return () => window.clearTimeout(id);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters.");
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      if (res.status === 204) {
        await refreshUser(); // every session ended, this browser's included
        return setDone(true);
      }
      const body = await res.json().catch(() => ({}));
      setError(res.status === 429 ? "Too many attempts. Please wait a few minutes." : (body.message ?? "We couldn't reset the password."));
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-10 sm:px-6">
      <h1 className="mb-2 text-3xl font-bold text-navy">Choose a new password</h1>
      {done ? (
        <div className="rounded-2xl border border-border bg-card p-5 text-sm" role="status">
          <p className="text-slate">Your password has been changed. You have been signed out everywhere, so sign in with the new one.</p>
          <Link href="/login" className="btn-primary mt-4 inline-flex min-h-11 items-center rounded-full px-6 text-sm font-semibold">
            Sign in
          </Link>
        </div>
      ) : token === null ? (
        <p className="rounded-2xl border border-border bg-card p-5 text-sm text-slate">
          This page needs the link from your reset email.{" "}
          <Link href="/forgot-password" className="font-semibold text-primary-strong">
            Ask for a new one
          </Link>
          .
        </p>
      ) : (
        <form className="space-y-4 rounded-2xl border border-border bg-card p-5" onSubmit={submit} noValidate>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <label htmlFor="password" className="block text-sm font-semibold">
            New password
          </label>
          <input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-field h-12 w-full rounded-xl px-3 text-base" />
          <p className="text-xs text-slate">At least 8 characters.</p>
          <button type="submit" disabled={busy || token === undefined} aria-busy={busy} className="btn-primary inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl">
            {busy ? <ButtonSpinner /> : null}
            {busy ? "Saving…" : "Change password"}
          </button>
        </form>
      )}
    </div>
  );
}
