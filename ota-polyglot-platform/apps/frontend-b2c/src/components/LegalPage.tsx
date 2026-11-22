import type { Metadata } from "next";
import Link from "next/link";

type Props = {
  title: string;
  description: string;
  children: React.ReactNode;
};

export function LegalPage({ title, description, children }: Props) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
      <h1 className="mb-4 text-3xl font-bold text-navy sm:text-4xl">{title}</h1>
      <p className="mb-6 text-sm text-slate">{description}</p>
      <div className="space-y-4 text-[15px] leading-relaxed text-slate">{children}</div>
      <Link
        href="/contact"
        className="mt-8 inline-flex text-sm font-semibold text-primary-strong hover:text-primary-hover"
      >
        Questions? Contact us
      </Link>
    </div>
  );
}

export function legalMetadata(title: string, description: string): Metadata {
  return { title: `${title} — Aerotake`, description };
}
