"use client";

import AuthBackLink from "@/components/auth-back-link";
import { useRouter } from "next/navigation";

export default function WelcomeBackForm() {
  const router = useRouter();

  return (
    <div className="w-full">
      <AuthBackLink href="/signup/agency" label="Go back" />

      <h1 className="mt-8 text-[32px] font-bold leading-tight tracking-tight text-aerotake-navy">
        Welcome Back!
      </h1>
      <p className="mt-2 text-[15px] leading-6 text-aerotake-muted">
        Let&apos;s Continue Your Sign Up
      </p>

      <button
        type="button"
        onClick={() => router.push("/signup/documents")}
        className="mt-8 h-12 w-full rounded-lg bg-aerotake-coral text-[15px] font-semibold text-white transition-colors hover:bg-aerotake-coral-dark"
      >
        Continue
      </button>
    </div>
  );
}
