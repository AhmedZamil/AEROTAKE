"use client";

import { useRouter } from "next/navigation";

export default function WelcomeForm() {
  const router = useRouter();

  return (
    <div className="w-full text-center">
      <h1 className="text-[32px] font-bold leading-tight tracking-tight text-aerotake-navy">
        Welcome!
      </h1>
      <p className="mt-2 text-[15px] leading-6 text-aerotake-muted">
        Your Account has been created
      </p>

      <button
        type="button"
        onClick={() => router.push("/")}
        className="mt-8 h-12 w-full rounded-lg bg-aerotake-coral text-[15px] font-semibold text-white transition-colors hover:bg-aerotake-coral-dark"
      >
        Start
      </button>
    </div>
  );
}
