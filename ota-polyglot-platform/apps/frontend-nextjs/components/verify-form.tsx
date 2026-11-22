"use client";

import AuthBackLink from "@/components/auth-back-link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ButtonSpinner } from "@/components/ui/button-spinner";

export default function VerifyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showCode, setShowCode] = useState(true);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isResetFlow = searchParams.get("flow") === "reset";
  const userId = searchParams.get("userId");
  const rememberMe = searchParams.get("remember") !== "0";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Password-reset code entry doesn't call the backend here — the code is
    // verified together with the new password on the next screen, in a
    // single /api/v1/auth/reset-password call. That screen is out of scope
    // for this task; only the mock navigation is preserved.
    if (isResetFlow) {
      router.push("/set-password");
      return;
    }

    setError(null);
    if (!userId) {
      setError("Missing verification session. Please log in again.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/verify-device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, code, rememberMe }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.message ?? "That code didn't work. Please try again.");
        return;
      }
      router.push("/dashboard");
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="w-full" onSubmit={handleSubmit}>
      <AuthBackLink
        href={isResetFlow ? "/forgot-password" : "/"}
        label={isResetFlow ? "Go back" : "Back to login"}
      />

      <h1 className="mt-8 text-[32px] font-bold leading-tight tracking-tight text-aerotake-navy">
        Verify code
      </h1>
      <p className="mt-2 text-[15px] leading-6 text-aerotake-muted">
        An authentication code has been sent to your email.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      <div className="relative mt-8">
        <label
          htmlFor="code"
          className="absolute -top-2.5 left-3 z-10 bg-aerotake-white px-1.5 text-sm text-aerotake-muted"
        >
          Enter Code
        </label>
        <div className="relative">
          <input
            id="code"
            name="code"
            type={showCode ? "text" : "password"}
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
            className="h-14 w-full rounded-lg border border-aerotake-border bg-aerotake-white px-4 pr-12 text-sm tracking-wide text-aerotake-navy outline-none focus:border-aerotake-coral focus:ring-2 focus:ring-aerotake-coral/20"
          />
          <button
            type="button"
            aria-label={showCode ? "Hide code" : "Show code"}
            onClick={() => setShowCode((value) => !value)}
            className="absolute inset-y-0 right-3.5 flex items-center text-aerotake-muted hover:text-aerotake-navy"
          >
            {showCode ? <EyeIcon /> : <EyeOffIcon />}
          </button>
        </div>
      </div>

      <p className="mt-4 text-sm text-aerotake-muted">
        Didn&apos;t receive a code?{" "}
        <button
          type="button"
          className="font-medium text-aerotake-coral hover:underline"
        >
          Resend
        </button>
      </p>

      <button
        type="submit"
        disabled={submitting}
        aria-busy={submitting}
        className="mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-aerotake-coral text-[15px] font-semibold text-white transition-colors hover:bg-aerotake-coral-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? <ButtonSpinner /> : null}
        {submitting ? "Verifying…" : "Verify"}
      </button>
    </form>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
      <path
        d="M3 3l18 18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M10.6 10.7a2.5 2.5 0 0 0 3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M6.6 6.8C4.6 8.1 3.1 10 2.2 12c1.8 4.1 5.6 7 9.8 7 1.7 0 3.4-.5 4.8-1.3M17.4 15.7C19 14.5 20.4 13 21.8 12c-1.8-4.1-5.6-7-9.8-7-1 0-1.9.1-2.8.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
      <path
        d="M2 12c1.8-4.1 5.6-7 10-7s8.2 2.9 10 7c-1.8 4.1-5.6 7-10 7S3.8 16.1 2 12Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
