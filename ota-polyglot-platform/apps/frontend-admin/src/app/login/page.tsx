"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Mail, Building2 } from "lucide-react";
import { ADMIN_TENANTS, fetchSession } from "@/lib/auth";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";

const inputClass = {
  desktop:
    "w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pr-4 pl-10 text-sm text-slate-900 outline-none transition focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/20",
  mobile:
    "w-full rounded-full border border-slate-200/80 bg-[#f4f6f8] py-3.5 pr-4 pl-11 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand/40 focus:bg-white focus:ring-4 focus:ring-brand/10",
};

export default function LoginPage() {
  const router = useRouter();
  const [tenantId, setTenantId] = useState<string>(ADMIN_TENANTS[0].id);
  const [email, setEmail] = useState<string>(ADMIN_TENANTS[0].email);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [verifyUserId, setVerifyUserId] = useState<string | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    fetchSession().then((user) => {
      if (user) router.replace("/dashboard");
    });
  }, [router]);

  function onTenant(next: string) {
    setTenantId(next);
    const known = ADMIN_TENANTS.find((t) => t.id === next);
    if (known) setEmail(known.email);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!email.trim() || (!verifyUserId && !password.trim()) || (verifyUserId && !code.trim())) {
      setError(verifyUserId ? "Enter the verification code." : "Please enter email and password.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(verifyUserId ? "/api/auth/verify-device" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          verifyUserId
            ? { userId: verifyUserId, code, email, tenantId, rememberMe }
            : { email, password, tenantId, rememberMe },
        ),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        message?: string;
        deviceVerificationRequired?: boolean;
        userId?: string;
      };
      if (!res.ok) {
        setError(payload.message || "Sign-in failed.");
        return;
      }
      if (payload.deviceVerificationRequired && payload.userId) {
        setVerifyUserId(payload.userId);
        setError("");
        return;
      }
      router.replace("/dashboard");
    } catch {
      setError("Sign-in is unavailable. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function LoginForm({ variant }: { variant: "desktop" | "mobile" }) {
    const isMobile = variant === "mobile";

    return (
      <form onSubmit={handleSubmit} className={isMobile ? "space-y-4" : "space-y-5"}>
        <div>
          <label
            htmlFor={`${variant}-tenant`}
            className={
              isMobile
                ? "mb-2 block text-sm font-medium text-slate-800"
                : "mb-1.5 block text-sm font-medium text-slate-700"
            }
          >
            Tenant
          </label>
          <div className="relative">
            <Building2
              className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400 ${
                isMobile ? "left-4 h-4 w-4" : "left-3.5 h-4 w-4"
              }`}
            />
            <select
              id={`${variant}-tenant`}
              value={tenantId}
              onChange={(e) => onTenant(e.target.value)}
              className={inputClass[variant]}
            >
              {ADMIN_TENANTS.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.label} ({tenant.hint})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label
            htmlFor={`${variant}-email`}
            className={
              isMobile
                ? "mb-2 block text-sm font-medium text-slate-800"
                : "mb-1.5 block text-sm font-medium text-slate-700"
            }
          >
            Email
          </label>
          <div className="relative">
            <Mail
              className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400 ${
                isMobile ? "left-4 h-4 w-4" : "left-3.5 h-4 w-4"
              }`}
            />
            <input
              id={`${variant}-email`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass[variant]}
              placeholder="admin@skybridge.example"
              autoComplete="email"
            />
          </div>
        </div>

        {verifyUserId ? (
          <div>
            <label
              htmlFor={`${variant}-code`}
              className={
                isMobile
                  ? "mb-2 block text-sm font-medium text-slate-800"
                  : "mb-1.5 block text-sm font-medium text-slate-700"
              }
            >
              Verification code
            </label>
            <input
              id={`${variant}-code`}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={inputClass[variant]}
              placeholder="Code from email"
              autoComplete="one-time-code"
            />
          </div>
        ) : (
        <div>
          <label
            htmlFor={`${variant}-password`}
            className={
              isMobile
                ? "mb-2 block text-sm font-medium text-slate-800"
                : "mb-1.5 block text-sm font-medium text-slate-700"
            }
          >
            Password
          </label>
          <div className="relative">
            <Lock
              className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400 ${
                isMobile ? "left-4 h-4 w-4" : "left-3.5 h-4 w-4"
              }`}
            />
            <input
              id={`${variant}-password`}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClass[variant]} ${isMobile ? "pr-12" : "pr-11"}`}
              placeholder="Enter password"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className={`absolute top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 ${
                isMobile ? "right-4" : "right-3"
              }`}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
        )}

        {error && (
          <p
            className={
              isMobile
                ? "rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-600"
                : "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600"
            }
          >
            {error}
          </p>
        )}

        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-slate-600">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-brand"
            />
            Remember me
          </label>
          <button
            type="button"
            className="font-medium text-brand hover:text-brand-dark"
          >
            Forgot password?
          </button>
        </div>

        <button
          type="submit"
          disabled={loading}
          aria-busy={loading}
          className={
            isMobile
              ? "flex w-full items-center justify-center gap-2 rounded-full bg-brand py-3.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(252,85,59,0.28)] transition hover:bg-brand-dark disabled:opacity-70"
              : "flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-70"
          }
        >
          {loading ? <ButtonSpinner /> : null}
          {loading ? "Signing in..." : verifyUserId ? "Verify device" : "Sign in"}
        </button>
      </form>
    );
  }

  return (
    <>
      <div className="relative flex min-h-screen flex-col bg-[#f7f8fa] lg:hidden">
        <div className="relative overflow-hidden bg-black px-6 pt-8 pb-32 text-center">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 80% 70% at 50% -10%, #fc553b55 0%, transparent 55%), radial-gradient(ellipse 50% 40% at 80% 80%, #fc553b22 0%, transparent 50%)",
            }}
          />

          <div className="relative z-10 mx-auto flex max-w-md flex-col items-center">
            <Image
              src="/verticle_logo_1.png"
              alt="Aerotake"
              width={280}
              height={90}
              className="h-auto w-[200px] object-contain"
              priority
            />

            <h1 className="mt-8 text-[30px] font-semibold leading-none tracking-tight text-white">
              Super Admin
            </h1>
            <p className="mt-2 text-[30px] font-semibold leading-none tracking-tight text-brand">
              Control Center
            </p>
            <p className="mt-4 max-w-[280px] text-sm leading-relaxed text-white/65">
              Manage partners, bookings, tickets, and finance from one place.
              Plan. Book. Fly. Pray.
            </p>
          </div>
        </div>

        <div className="relative z-10 -mt-16 flex flex-1 flex-col rounded-t-[36px] bg-white px-6 pt-7 pb-6 shadow-[0_-12px_40px_rgba(0,0,0,0.18)]">
          <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col">
            <div className="mb-6">
              <h2 className="text-[26px] font-semibold tracking-tight text-slate-950">
                Welcome back
              </h2>
              <p className="mt-1.5 text-sm text-slate-500">
                Sign in to your Aerotake super admin account
              </p>
            </div>

            <LoginForm variant="mobile" />

            <p className="mt-7 text-center text-xs text-slate-400">
              Platform admin only. Agency staff and customers cannot sign in here.
            </p>

            <p className="mt-auto pt-10 text-center text-[11px] text-slate-400">
              © {new Date().getFullYear()} Aerotake. All rights reserved.
            </p>
          </div>
        </div>
      </div>

      <div className="hidden min-h-screen lg:flex">
        <div className="relative hidden w-[46%] overflow-hidden bg-black lg:flex lg:flex-col lg:justify-between lg:p-12">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              background:
                "radial-gradient(ellipse at 20% 20%, #fc553b55 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, #fc553b33 0%, transparent 45%)",
            }}
          />
          <div className="relative z-10">
            <Image
              src="/verticle_logo_1.png"
              alt="Aerotake"
              width={280}
              height={90}
              className="h-auto w-[260px] object-contain"
              priority
            />
          </div>
          <div className="relative z-10 max-w-md space-y-4">
            <h1 className="text-4xl font-semibold leading-tight text-white">
              Super Admin
              <span className="mt-1 block text-brand">Control Center</span>
            </h1>
            <p className="text-base leading-relaxed text-white/70">
              Manage partners, bookings, tickets, and finance from one place.
              Plan. Book. Fly. Pray.
            </p>
          </div>
          <p className="relative z-10 text-sm text-white/40">
            © {new Date().getFullYear()} Aerotake. All rights reserved.
          </p>
        </div>

        <div className="flex flex-1 items-center justify-center bg-[#f3f6f9] px-6 py-10">
          <div className="w-full max-w-[420px]">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-8 shadow-sm">
              <div className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900">
                  Welcome back
                </h2>
                <p className="mt-1.5 text-sm text-slate-500">
                  Sign in to your Aerotake super admin account
                </p>
              </div>

              <LoginForm variant="desktop" />

              <p className="mt-6 text-center text-xs text-slate-400">
                Platform admin only. Agency staff and customers cannot sign in here.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
