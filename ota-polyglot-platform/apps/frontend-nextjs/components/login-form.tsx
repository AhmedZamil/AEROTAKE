"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ButtonSpinner } from "@/components/ui/button-spinner";

export default function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, rememberMe }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.message ?? "Login failed. Please check your credentials and try again.");
        return;
      }

      if (data.deviceVerificationRequired) {
        router.push(`/verify?userId=${encodeURIComponent(data.userId)}&remember=${rememberMe ? "1" : "0"}`);
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
      <p className="text-[13px] font-semibold tracking-[0.08em] text-aerotake-coral uppercase">
        Welcome Back
      </p>
      <h1 className="mt-1 text-[32px] font-bold leading-tight tracking-tight text-aerotake-navy">
        Partner Login
      </h1>
      <p className="mt-2 text-[15px] leading-6 text-aerotake-muted">
        Access your partner dashboard to manage bookings and explore the world
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-8">
        <label
          htmlFor="email"
          className="mb-2 block text-sm font-medium text-aerotake-navy"
        >
          Email Address
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-aerotake-muted/70">
            <MailIcon />
          </span>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="partner@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="h-12 w-full rounded-lg border border-aerotake-border bg-aerotake-white pr-4 pl-11 text-sm text-aerotake-navy outline-none placeholder:text-aerotake-muted/60 focus:border-aerotake-coral focus:ring-2 focus:ring-aerotake-coral/20"
          />
        </div>
      </div>

      <div className="mt-5">
        <label
          htmlFor="password"
          className="mb-2 block text-sm font-medium text-aerotake-navy"
        >
          Password
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-aerotake-muted/70">
            <LockIcon />
          </span>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="h-12 w-full rounded-lg border border-aerotake-border bg-aerotake-white px-11 text-sm tracking-wide text-aerotake-navy outline-none focus:border-aerotake-coral focus:ring-2 focus:ring-aerotake-coral/20"
          />
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((value) => !value)}
            className="absolute inset-y-0 right-3.5 flex items-center text-aerotake-muted/70 hover:text-aerotake-navy"
          >
            {showPassword ? <EyeIcon /> : <EyeOffIcon />}
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2 select-none">
          <input
            type="checkbox"
            name="remember"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
            className="peer sr-only"
          />
          <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border border-aerotake-border bg-aerotake-white peer-checked:border-aerotake-coral peer-checked:bg-aerotake-coral">
            <svg
              viewBox="0 0 12 12"
              className="h-3 w-3 text-white"
              fill="none"
              aria-hidden
            >
              <path
                d="M2.2 6.2 4.6 8.6 9.8 3.4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="text-sm text-aerotake-coral">Remember me</span>
        </label>
        <a
          href="/forgot-password"
          className="text-sm font-medium text-aerotake-coral hover:underline"
        >
          Forgot Password?
        </a>
      </div>

      <button
        type="submit"
        disabled={submitting}
        aria-busy={submitting}
        className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-aerotake-coral text-[15px] font-semibold text-white transition-colors hover:bg-aerotake-coral-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? <ButtonSpinner /> : null}
        {submitting ? "Signing in…" : "Login"}
      </button>

      <p className="mt-5 text-center text-sm text-aerotake-muted">
        Don&apos;t have an account?{" "}
        <a
          href="/signup"
          className="font-semibold text-aerotake-coral hover:underline"
        >
          Register Now
        </a>
      </p>
    </form>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
      <rect
        x="3.5"
        y="5.5"
        width="17"
        height="13"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M4 7.5 12 13l8-5.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
      <rect
        x="5"
        y="11"
        width="14"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M8 11V8a4 4 0 0 1 8 0v3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
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
