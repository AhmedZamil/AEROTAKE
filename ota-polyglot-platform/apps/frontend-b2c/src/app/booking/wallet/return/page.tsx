"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function ReturnInner() {
  const router = useRouter();
  const params = useSearchParams();
  const status = params.get("status") ?? "";
  const topUpId = params.get("topUpId") ?? "";
  const [note, setNote] = useState(status === "success" ? "Confirming your card payment…" : "");
  const [balance, setBalance] = useState<string | null>(null);

  useEffect(() => {
    if (!topUpId || status !== "success") return;
    let cancelled = false;
    let tries = 0;
    const tick = async () => {
      const res = await fetch(`/api/wallet/top-ups/${topUpId}`);
      if (cancelled) return;
      if (res.ok) {
        const body = (await res.json()) as { status?: string; balance?: number; currency?: string; amount?: number };
        if (body.status === "Paid") {
          setBalance(`${Number(body.balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${body.currency ?? ""}`.trim());
          setNote(`Added ${Number(body.amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${body.currency ?? ""}.`.trim());
          return;
        }
        if (body.status === "Failed") {
          setNote("The card payment was not confirmed, so your balance was not changed.");
          return;
        }
      }
      tries += 1;
      if (tries >= 8) {
        setNote("We haven’t confirmed the card payment yet. Check your balance in a moment before adding money again.");
        return;
      }
      window.setTimeout(() => void tick(), 2000);
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [status, topUpId]);

  const failed = status === "fail" || status === "cancel";
  const title = status === "success" ? "Adding money" : status === "cancel" ? "Top-up cancelled" : "Top-up didn’t go through";

  return (
    <div className="mx-auto max-w-lg px-4 py-10 text-center sm:px-6">
      <h1 className="text-3xl font-bold text-navy">{title}</h1>
      <p className="mt-3 text-sm text-slate">
        {status === "success"
          ? note
          : failed
            ? "No money was added to your wallet."
            : "We couldn’t read this top-up."}
      </p>
      {balance ? <p className="mt-3 text-sm font-semibold text-navy">Wallet balance {balance}</p> : null}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => router.push("/my-bookings")} className="btn-primary inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold">
          My bookings
        </button>
        <Link href="/" className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-semibold">
          Back to search
        </Link>
      </div>
    </div>
  );
}

export default function WalletTopUpReturnPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-lg px-4 py-10 text-sm text-slate">Loading…</div>}>
      <ReturnInner />
    </Suspense>
  );
}
