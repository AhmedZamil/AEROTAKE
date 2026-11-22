import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About Us — Aerotake",
  description: "Learn about Aerotake — Plan. Book. Fly.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
      <h1 className="mb-4 text-3xl font-bold text-navy sm:text-4xl">About Aerotake</h1>
      <p className="mb-8 text-[15px] leading-relaxed text-slate sm:text-base">
        Aerotake helps travellers search, compare and book flights. Fares come straight from the airlines&apos; own booking systems, and the
        price you see includes taxes and fees.
      </p>
      <Link href="/" className="btn-primary inline-flex min-h-11 rounded-full px-6 py-3 text-sm">
        Search flights
      </Link>
    </div>
  );
}
