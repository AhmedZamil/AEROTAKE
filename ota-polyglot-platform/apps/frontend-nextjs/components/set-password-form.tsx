"use client";

import AuthBackLink from "@/components/auth-back-link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function SetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSignupFlow = searchParams.get("flow") === "signup";
  const [showPassword, setShowPassword] = useState(true);
  const [showConfirm, setShowConfirm] = useState(true);

  return (
    <form
      className="w-full"
      onSubmit={(event) => {
        event.preventDefault();
        router.push(isSignupFlow ? "/welcome" : "/");
      }}
    >
      <AuthBackLink
        href={isSignupFlow ? "/thank-you/documents" : "/verify?flow=reset"}
        label="Go back"
      />

      <h1 className="mt-8 text-[32px] font-bold leading-tight tracking-tight text-aerotake-navy">
        Set a password
      </h1>
      <p className="mt-2 text-[15px] leading-6 text-aerotake-muted">
        Your previous password has been reseted. Please set a new password for
        your account.
      </p>

      <div className="relative mt-8">
        <label
          htmlFor="password"
          className="absolute -top-2.5 left-3 z-10 bg-aerotake-white px-1.5 text-sm text-aerotake-muted"
        >
          Create Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            defaultValue="7789BM6X@@H&$K_"
            className="h-14 w-full rounded-lg border border-aerotake-border bg-aerotake-white px-4 pr-12 text-sm tracking-wide text-aerotake-navy outline-none focus:border-aerotake-coral focus:ring-2 focus:ring-aerotake-coral/20"
          />
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((value) => !value)}
            className="absolute inset-y-0 right-3.5 flex items-center text-aerotake-muted hover:text-aerotake-navy"
          >
            {showPassword ? <EyeIcon /> : <EyeOffIcon />}
          </button>
        </div>
      </div>

      <div className="relative mt-5">
        <label
          htmlFor="confirm-password"
          className="absolute -top-2.5 left-3 z-10 bg-aerotake-white px-1.5 text-sm text-aerotake-muted"
        >
          Re-enter Password
        </label>
        <div className="relative">
          <input
            id="confirm-password"
            name="confirmPassword"
            type={showConfirm ? "text" : "password"}
            autoComplete="new-password"
            defaultValue="7789BM6X@@H&$K_"
            className="h-14 w-full rounded-lg border border-aerotake-border bg-aerotake-white px-4 pr-12 text-sm tracking-wide text-aerotake-navy outline-none focus:border-aerotake-coral focus:ring-2 focus:ring-aerotake-coral/20"
          />
          <button
            type="button"
            aria-label={showConfirm ? "Hide password" : "Show password"}
            onClick={() => setShowConfirm((value) => !value)}
            className="absolute inset-y-0 right-3.5 flex items-center text-aerotake-muted hover:text-aerotake-navy"
          >
            {showConfirm ? <EyeIcon /> : <EyeOffIcon />}
          </button>
        </div>
      </div>

      <button
        type="submit"
        className="mt-8 h-12 w-full rounded-lg bg-aerotake-coral text-[15px] font-semibold text-white transition-colors hover:bg-aerotake-coral-dark"
      >
        Set password
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
