import type { Metadata } from "next";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact Us — Aerotake",
  description: "Contact Aerotake for flight booking support.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
      <h1 className="mb-2 text-3xl font-bold text-navy sm:text-4xl">Contact Us</h1>
      <p className="mb-8 text-[15px] text-slate">
        Reach us at{" "}
        <a href={`mailto:${SITE.email}`} className="font-semibold text-primary-strong">
          {SITE.email}
        </a>{" "}
        or call{" "}
        <a href={`tel:${SITE.phoneTel}`} className="font-semibold text-primary-strong">
          {SITE.phoneDisplay}
        </a>
        .
      </p>
      <p className="mt-10 text-sm text-slate">{SITE.address}</p>
      <p className="mt-1 text-sm text-slate">{SITE.hours}</p>
    </div>
  );
}
