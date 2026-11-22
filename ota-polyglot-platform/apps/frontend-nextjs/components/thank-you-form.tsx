"use client";

import { useRouter } from "next/navigation";

export default function ThankYouForm() {
  const router = useRouter();

  return (
    <div className="w-full text-center">
      <h1 className="text-[32px] font-bold leading-tight tracking-tight text-aerotake-navy">
        Thank You
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-[15px] leading-6 text-aerotake-muted">
        Your registration has been successfully submitted. We will review it
        shortly, and you will receive an email with the next steps.
      </p>

      <button
        type="button"
        onClick={() => router.push("/")}
        className="mt-8 h-12 w-full rounded-lg bg-aerotake-coral text-[15px] font-semibold text-white transition-colors hover:bg-aerotake-coral-dark"
      >
        Home
      </button>
    </div>
  );
}
