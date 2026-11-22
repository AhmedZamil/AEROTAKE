"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Captcha from "@/components/Captcha";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const waiting = useRef(false);

  useEffect(() => {
    void fetch("/api/auth/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((c: { turnstileSiteKey: string | null }) => setSiteKey(c.turnstileSiteKey))
      .catch(() => setSiteKey(null));
  }, []);

  const send = async (captchaToken: string | null) => {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), captchaToken }) });
      if (res.status === 429) return setError("Too many requests. Please wait a while and try again.");
      if (res.status === 400) return setError("We couldn't confirm you are a person. Please try again.");
      setSent(true); // the answer is the same whether or not the address has an account
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
      setResetKey((k) => k + 1);
    }
  };

  useEffect(() => {
    if (token && waiting.current) {
      waiting.current = false;
      void send(token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return setError("Enter your email address.");
    setError("");
    if (siteKey && !token) {
      waiting.current = true; // the check is still finishing: send as soon as it does
      return;
    }
    await send(token);
  };

  return (
    <div className="mx-auto max-w-md px-4 py-10 sm:px-6">
      <h1 className="mb-2 text-3xl font-bold text-navy">Reset your password</h1>
      {sent ? (
        <div className="rounded-2xl border border-border bg-card p-5 text-sm text-slate" role="status">
          If there is an account for that email, we have sent a link to reset the password. It works once and expires in an hour.
        </div>
      ) : (
        <>
          <p className="mb-6 text-sm text-slate">Enter the email you signed up with and we will send you a link to choose a new password.</p>
          <form className="space-y-4 rounded-2xl border border-border bg-card p-5" onSubmit={submit} noValidate>
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <label htmlFor="email" className="block text-sm font-semibold">
              Email
            </label>
            <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field h-12 w-full rounded-xl px-3 text-base" />
            <Captcha siteKey={siteKey} resetKey={resetKey} onToken={setToken} />
            <button type="submit" disabled={busy} aria-busy={busy} className="btn-primary inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl">
              {busy ? <ButtonSpinner /> : null}
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </form>
        </>
      )}
      <p className="mt-6 text-sm">
        <Link href="/login" className="font-semibold text-primary-strong">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
