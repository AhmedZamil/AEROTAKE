"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Captcha from "@/components/Captcha";
import { useApp } from "@/context/AppProviders";
import { safeNextPath } from "@/lib/auth-redirect";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { emailValidationError } from "@/lib/email";
import {
  DIAL_CODES,
  digitsOnly,
  joinContactPhone,
  phoneInputMaxLength,
  phonePlaceholder,
  phoneValidationError,
} from "@/lib/phone";

const DIAL_LABELS: Record<(typeof DIAL_CODES)[number], string> = {
  "+880": "🇧🇩 +880",
  "+971": "🇦🇪 +971",
  "+44": "🇬🇧 +44",
  "+91": "🇮🇳 +91",
  "+1": "🇺🇸 +1",
};

type Values = { email: string; password: string; phone: string };

type GoogleId = {
  initialize: (o: { client_id: string; callback: (r: { credential: string }) => void }) => void;
  renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

type Mode = "signin" | "register";

/**
 * Sign in or create an account: email and password (a mobile number, an email and a password is all it takes), or Google. Everything is verified by
 * core-engine; the session lives in httpOnly cookies. Facebook joins this page when its app is set up.
 * Optional `?next=/path` returns the visitor to that relative path after sign-in (e.g. travellers after selecting a flight).
 */
export default function LoginForm() {
  const { refreshUser } = useApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const afterAuth = safeNextPath(searchParams.get("next"));
  const [mode, setMode] = useState<Mode>("signin");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [clientId, setClientId] = useState<string | null | undefined>(undefined);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [loginNeedsCheck, setLoginNeedsCheck] = useState(false);
  const [badOrigin, setBadOrigin] = useState(false);
  const [phoneCountry, setPhoneCountry] = useState<string>("+880");
  const [phone, setPhone] = useState("");
  const pending = useRef<Values | null>(null);
  const button = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = window.location.hostname;
    setBadOrigin(h === "[::]" || h === "[::1]" || h === "127.0.0.1");
  }, []);

  useEffect(() => {
    void fetch("/api/auth/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((c: { googleClientId: string | null; turnstileSiteKey: string | null }) => {
        setClientId(c.googleClientId);
        setSiteKey(c.turnstileSiteKey);
      })
      .catch(() => setClientId(null));
  }, []);

  useEffect(() => {
    if (!clientId) return;
    const start = () => {
      if (!window.google || !button.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          setError("");
          const res = await fetch("/api/auth/social", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: "google", idToken: credential }),
          });
          if (!res.ok) {
            setError(res.status === 403 ? "This account can't be used to sign in." : "We couldn't sign you in with Google. Please try again.");
            return;
          }
          await refreshUser();
          router.push(afterAuth);
        },
      });
      window.google.accounts.id.renderButton(button.current, { theme: "outline", size: "large", width: 320, text: "continue_with" });
    };
    if (window.google) return start();
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = start;
    document.head.appendChild(script);
  }, [clientId, refreshUser, router, afterAuth]);

  // Sends the form. The "are you a person?" token (Cloudflare Turnstile, which shows nothing to most people) is required to register, and to
  // sign in only after a few failed tries; it is single-use, so a fresh one is requested after every attempt.
  const send = async (values: Values, captchaToken: string | null) => {
    setBusy(true);
    try {
      const res = await fetch(mode === "register" ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "register" ? { ...values, captchaToken } : { email: values.email, password: values.password, captchaToken }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.error === "captcha_required") {
          setLoginNeedsCheck(true); // the widget appears; the attempt is sent again by itself when it finishes
          setError("One quick check, and we will try again.");
          pending.current = values;
        } else {
          setError(
            res.status === 429
              ? "Too many attempts. Please wait a few minutes and try again."
              : (body.message ?? "We couldn't sign you in. Please try again."),
          );
        }
        setResetKey((k) => k + 1);
        return;
      }
      await refreshUser();
      router.push(afterAuth);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // A pending attempt goes out the moment the check finishes.
  useEffect(() => {
    if (token && pending.current) {
      const values = pending.current;
      pending.current = null;
      setError("");
      void send(values, token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const values: Values = {
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
      phone: mode === "register" && phone ? joinContactPhone(phoneCountry, phone) : "",
    };
    if (mode === "register") {
      const emailErr = emailValidationError(values.email);
      if (emailErr) return setError(emailErr);
      const phoneErr = phone ? phoneValidationError(phoneCountry, phone) : null;
      if (phoneErr) return setError(phoneErr);
      if (!values.password) return setError("Enter a password.");
      if (values.password.length < 8) return setError("Use at least 8 characters for the password.");
    } else if (!values.email || !values.password) {
      return setError("Enter your email and password.");
    }

    setError("");
    const needsCheck = Boolean(siteKey) && (mode === "register" || loginNeedsCheck);
    if (needsCheck && !token) {
      pending.current = values; // the check is still finishing: send as soon as it does
      return;
    }
    await send(values, needsCheck ? token : null);
  };

  const register = mode === "register";
  return (
    <div className="mx-auto max-w-md px-4 py-10 sm:px-6">
      <h1 className="mb-2 text-3xl font-bold text-navy">{register ? "Create your account" : "Sign in"}</h1>
      <p className="mb-6 text-sm text-slate">
        {register
          ? "Just your email and a password. You need an account to reserve seats."
          : afterAuth.startsWith("/booking")
            ? "Sign in to continue your booking."
            : "Welcome back. Sign in to manage bookings and reserve seats."}
      </p>

      {badOrigin ? (
        <p className="form-error mb-4 rounded-xl px-4 py-3 text-sm" role="alert">
          Google sign-in only works from{" "}
          <a className="font-semibold underline" href={`http://localhost:${window.location.port || "3001"}${window.location.pathname}${window.location.search}`}>
            http://localhost:{window.location.port || "3001"}
          </a>
          . This address ({window.location.host}) is blocked by Google&apos;s OAuth rules.
        </p>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-2" role="tablist" aria-label="Sign in or create an account">
        {(["signin", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setError("");
              setToken(null);
              pending.current = null;
            }}
            className={`min-h-11 rounded-full text-sm font-semibold ${mode === m ? "bg-primary-strong text-white" : "border border-border bg-card text-navy"}`}
          >
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form className="space-y-4 rounded-2xl border border-border bg-card p-5" onSubmit={submit} noValidate>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-semibold">
            Email
          </label>
          <input id="email" name="email" type="email" autoComplete="email" className="input-field h-12 w-full rounded-xl px-3 text-base" />
        </div>
        {register ? (
          <div>
            <label htmlFor="phone" className="mb-1 block text-sm font-semibold">
              Mobile number
            </label>
            <div className="flex gap-2">
              <select
                aria-label="Country code"
                className="input-field h-12 w-[118px] shrink-0 rounded-xl px-2 text-sm"
                value={phoneCountry}
                onChange={(e) => {
                  setPhoneCountry(e.target.value);
                  setPhone((p) => digitsOnly(p).slice(0, phoneInputMaxLength(e.target.value)));
                }}
              >
                {DIAL_CODES.map((d) => (
                  <option key={d} value={d}>
                    {DIAL_LABELS[d]}
                  </option>
                ))}
              </select>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={phoneInputMaxLength(phoneCountry)}
                placeholder={phonePlaceholder(phoneCountry)}
                value={phone}
                onChange={(e) => setPhone(digitsOnly(e.target.value).slice(0, phoneInputMaxLength(phoneCountry)))}
                className="input-field h-12 min-w-0 flex-1 rounded-xl px-3 text-base"
              />
            </div>
          </div>
        ) : null}
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-semibold">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={register ? "new-password" : "current-password"}
              className="input-field h-12 w-full rounded-xl px-3 pr-16 text-base"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-primary-strong"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          {register ? <p className="mt-1 text-xs text-slate">At least 8 characters. A short sentence you will remember works well.</p> : null}
        </div>
        {siteKey && (register || loginNeedsCheck) ? <Captcha siteKey={siteKey} resetKey={resetKey} onToken={setToken} /> : null}
        <button type="submit" disabled={busy} aria-busy={busy} className="btn-primary inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl">
          {busy ? <ButtonSpinner /> : null}
          {busy ? "One moment…" : register ? "Create account" : "Sign in"}
        </button>
        {!register ? (
          <p className="text-center text-sm">
            <Link href="/forgot-password" className="font-semibold text-primary-strong">
              Forgot your password?
            </Link>
          </p>
        ) : null}
      </form>

      {clientId ? (
        <div className="mt-5">
          <div className="mb-4 flex items-center gap-3" aria-hidden>
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs font-semibold uppercase tracking-wide text-slate">or continue with</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <div ref={button} className="flex justify-center" />
        </div>
      ) : null}

      <p className="mt-6 text-sm text-slate">
        Already have a booking reference?{" "}
        <Link href="/manage-booking" className="font-semibold text-primary-strong">
          Manage a booking
        </Link>
      </p>
    </div>
  );
}
