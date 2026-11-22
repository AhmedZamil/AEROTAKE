"use client";

import { useRouter } from "next/navigation";

export default function ThankYouDocumentsForm() {
  const router = useRouter();

  return (
    <div className="w-full text-center">
      <h1 className="text-[32px] font-bold leading-tight tracking-tight text-aerotake-navy">
        Thank You
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-[15px] leading-6 text-aerotake-muted">
        The Documents have been submitted. A confirmation email will be sent
        after verifying the documents.
      </p>

      <button
        type="button"
        onClick={() => router.push("/set-password?flow=signup")}
        className="mt-8 h-12 w-full rounded-lg bg-aerotake-coral text-[15px] font-semibold text-white transition-colors hover:bg-aerotake-coral-dark"
      >
        Continue
      </button>
    </div>
  );
}
