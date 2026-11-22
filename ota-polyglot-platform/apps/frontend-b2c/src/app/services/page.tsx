import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Services — Aerotake",
  description: "Flight booking and travel services from Aerotake.",
};

export default function ServicesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
      <h1 className="mb-4 text-3xl font-bold text-navy sm:text-4xl">Services</h1>
      <ul className="mb-8 space-y-3 text-[15px] text-slate sm:text-base">
        <li>Flight search and booking</li>
        <li>Manage your booking with its reference, or from your account</li>
      </ul>
      <Link href="/contact" className="btn-primary inline-flex min-h-11 rounded-full px-6 py-3 text-sm">
        Contact us
      </Link>
    </div>
  );
}
