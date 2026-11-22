"use client";

import { useEffect, useState } from "react";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { startPayment, type PayMethod } from "@/lib/start-payment";

type Wallet = { balance: number; currency: string; instantTopUp: boolean };

/** Card (SSLCommerz) or the customer's Aerotake balance. Only the clicked choice shows a spinner. */
export default function PaymentChoices({
  bookingId,
  onPaid,
}: {
  bookingId: string;
  onPaid: (bookingStatus: string) => void;
}) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState<PayMethod | "topup" | "local" | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    const res = await fetch("/api/wallet");
    if (!res.ok) return;
    setWallet((await res.json()) as Wallet);
  };

  useEffect(() => {
    void load();
  }, []);

  const pay = async (method: PayMethod) => {
    setError("");
    setPending(method);
    try {
      const result = await startPayment(bookingId, { method, fresh: method === "sslcommerz" });
      if (!result.ok) {
        setError(result.message);
        if (result.code === "wallet_insufficient") void load();
        return;
      }
      if (result.paid) {
        onPaid(result.bookingStatus ?? "Pending");
        void load();
        return;
      }
      window.location.href = result.gatewayUrl;
    } catch {
      setError("We couldn’t start payment. Please try again.");
    } finally {
      setPending(null);
    }
  };

  const amountValue = () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 1) {
      setError("Enter an amount of at least 1.");
      return null;
    }
    return value;
  };

  const topUpByCard = async () => {
    const value = amountValue();
    if (value === null) return;
    setError("");
    setPending("topup");
    try {
      const key = sessionStorage.getItem("aerotake-topup-idem") ?? crypto.randomUUID();
      sessionStorage.setItem("aerotake-topup-idem", key);
      const res = await fetch("/api/wallet/top-up/card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: value, idempotencyKey: key }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string; gatewayUrl?: string; error?: string };
      if (!res.ok || !body.gatewayUrl) {
        if (body.error === "topup_retry_required" || body.error === "topup_already_paid") {
          sessionStorage.removeItem("aerotake-topup-idem");
        }
        setError(body.message ?? "We couldn’t start the card payment.");
        return;
      }
      sessionStorage.removeItem("aerotake-topup-idem");
      window.location.href = body.gatewayUrl;
    } catch {
      setError("We couldn’t start the card payment.");
    } finally {
      setPending(null);
    }
  };

  const topUpLocally = async () => {
    const value = amountValue();
    if (value === null) return;
    setError("");
    setPending("local");
    try {
      const res = await fetch("/api/wallet/top-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: value }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string; balance?: number; currency?: string; instantTopUp?: boolean };
      if (!res.ok) {
        setError(body.message ?? "We couldn’t add money to your wallet.");
        return;
      }
      setWallet({ balance: body.balance ?? 0, currency: body.currency ?? wallet?.currency ?? "BDT", instantTopUp: body.instantTopUp ?? true });
      setAmount("");
    } catch {
      setError("We couldn’t add money to your wallet.");
    } finally {
      setPending(null);
    }
  };

  const busy = pending !== null;
  const balanceLabel = wallet ? `${wallet.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${wallet.currency}` : "…";

  return (
    <div className="mt-5 space-y-3 text-left">
      <p className="text-center text-sm text-slate">
        Wallet balance <span className="font-semibold text-navy">{balanceLabel}</span>
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <label className="sr-only" htmlFor={`topup-${bookingId}`}>
          Amount to add
        </label>
        <input
          id={`topup-${bookingId}`}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          className="h-11 w-32 rounded-xl border border-border px-3 text-sm"
        />
        <button
          type="button"
          disabled={busy}
          aria-busy={pending === "topup"}
          onClick={() => void topUpByCard()}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold disabled:opacity-60"
        >
          {pending === "topup" ? <ButtonSpinner /> : null}
          {pending === "topup" ? "Opening payment…" : "Add money by card"}
        </button>
        {wallet?.instantTopUp ? (
          <button
            type="button"
            disabled={busy}
            aria-busy={pending === "local"}
            onClick={() => void topUpLocally()}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold disabled:opacity-60"
          >
            {pending === "local" ? <ButtonSpinner /> : null}
            Add without paying (local only)
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          disabled={busy}
          aria-busy={pending === "wallet"}
          onClick={() => void pay("wallet")}
          className="btn-primary inline-flex min-h-11 items-center gap-2 rounded-full px-6 text-sm font-semibold disabled:opacity-60"
        >
          {pending === "wallet" ? <ButtonSpinner /> : null}
          {pending === "wallet" ? "Paying…" : "Pay with wallet"}
        </button>
        <button
          type="button"
          disabled={busy}
          aria-busy={pending === "sslcommerz"}
          onClick={() => void pay("sslcommerz")}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-6 text-sm font-semibold disabled:opacity-60"
        >
          {pending === "sslcommerz" ? <ButtonSpinner /> : null}
          {pending === "sslcommerz" ? "Opening payment…" : "Pay by card"}
        </button>
      </div>
      {error ? (
        <p className="form-error rounded-xl px-4 py-3 text-center text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
