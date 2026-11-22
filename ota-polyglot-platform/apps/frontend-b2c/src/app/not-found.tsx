import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-primary-strong">
        404
      </p>
      <h1 className="mb-3 text-3xl font-bold text-navy sm:text-4xl">
        Page not found
      </h1>
      <p className="mb-8 max-w-md text-[15px] text-slate">
        The page you are looking for does not exist or has been moved.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/" className="btn-primary min-h-11 rounded-full px-6 py-3 text-sm">
          Back to home
        </Link>
        <Link
          href="/contact"
          className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-6 py-3 text-sm font-semibold text-navy transition hover:border-primary-strong hover:text-primary-strong"
        >
          Contact support
        </Link>
      </div>
    </div>
  );
}
