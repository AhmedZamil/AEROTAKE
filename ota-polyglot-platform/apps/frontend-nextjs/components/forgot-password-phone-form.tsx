"use client";

import AuthBackLink from "@/components/auth-back-link";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ForgotPasswordPhoneForm() {
  const router = useRouter();

  return (
    <form
      className="w-full"
      onSubmit={(event) => {
        event.preventDefault();
        router.push("/verify?flow=reset");
      }}
    >
      <AuthBackLink href="/forgot-password" label="Go back" />

      <h1 className="mt-8 text-[32px] font-bold leading-tight tracking-tight text-aerotake-navy">
        Forgot your password?
      </h1>
      <p className="mt-2 text-[15px] leading-6 text-aerotake-muted">
        Don&apos;t worry, happens to all of us. Enter your phone number below to
        recover your password
      </p>

      <div className="relative mt-8">
        <label
          htmlFor="phone"
          className="absolute -top-2.5 left-3 z-10 bg-aerotake-white px-1.5 text-sm text-aerotake-muted"
        >
          Phone Number
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          defaultValue="XXXXXXXXXXX"
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
          href="/forgot-password"
          className="text-sm font-medium text-aerotake-coral hover:underline"
        >
          Use email
        </Link>
      </div>
    </form>
  );
}
