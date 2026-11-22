"use client";

import AuthBackLink from "@/components/auth-back-link";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ForgotPasswordForm() {
  const router = useRouter();

  return (
    <form
      className="w-full"
      onSubmit={(event) => {
        event.preventDefault();
        router.push("/verify?flow=reset");
      }}
    >
      <AuthBackLink href="/" label="Back to login" />

      <h1 className="mt-8 text-[32px] font-bold leading-tight tracking-tight text-aerotake-navy">
        Forgot your password?
      </h1>
      <p className="mt-2 text-[15px] leading-6 text-aerotake-muted">
        Don&apos;t worry, happens to all of us. Enter your email below to recover
        your password
      </p>

      <div className="relative mt-8">
        <label
          htmlFor="email"
          className="absolute -top-2.5 left-3 z-10 bg-aerotake-white px-1.5 text-sm text-aerotake-muted"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue="john.doe@gmail.com"
          className="h-14 w-full rounded-lg border border-aerotake-border bg-aerotake-white px-4 text-sm text-aerotake-navy outline-none focus:border-aerotake-coral focus:ring-2 focus:ring-aerotake-coral/20"
        />
      </div>

      <button
        type="submit"
        className="mt-8 h-12 w-full rounded-lg bg-aerotake-coral text-[15px] font-semibold text-white transition-colors hover:bg-aerotake-coral-dark"
      >
        Submit
      </button>

      <div className="mt-5 text-center">
        <Link
          href="/forgot-password/phone"
          className="text-sm font-medium text-aerotake-coral hover:underline"
        >
          Use phone Number
        </Link>
      </div>
    </form>
  );
}
