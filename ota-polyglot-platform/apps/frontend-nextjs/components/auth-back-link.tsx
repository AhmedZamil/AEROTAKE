"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AuthBackLink({
  href,
  label = "Go back",
  useHistory = false,
}: {
  href?: string;
  label?: string;
  useHistory?: boolean;
}) {
  const router = useRouter();
  const className =
    "inline-flex items-center gap-1.5 text-sm text-aerotake-muted hover:text-aerotake-navy";

  if (useHistory) {
    return (
      <button type="button" onClick={() => router.back()} className={className}>
        <ChevronLeftIcon />
        {label}
      </button>
    );
  }

  return (
    <Link href={href ?? "/"} className={className}>
      <ChevronLeftIcon />
      {label}
    </Link>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
      <path
        d="M12.5 4.5 7 10l5.5 5.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
