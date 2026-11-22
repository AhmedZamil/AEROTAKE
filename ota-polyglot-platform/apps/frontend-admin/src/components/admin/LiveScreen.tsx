"use client";

import { FormEvent, useCallback, useEffect, useState, type ReactNode } from "react";
import { fetchSession, type AuthUser } from "@/lib/auth";
import { AdminApiError, adminApi, PRODUCTS, TIERS } from "@/lib/admin-api";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";

export function useLiveUser() {
  const [user, setUser] = useState<AuthUser | null>(null);
  useEffect(() => {
    fetchSession().then(setUser);
  }, []);
  return user;
}

export function LiveBanner({ user, children }: { user: AuthUser | null; children: string }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
      <p className="font-medium">{children}</p>
      <p className="mt-1 text-emerald-800/80">
        Signed in as {user?.email ?? "…"} · {user ? `${user.tenantLabel} (${user.tenantId})` : "loading tenant"}
      </p>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

export function ErrorNote({ error }: { error: string }) {
  if (!error) return null;
  return (
    <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
      {error}
    </p>
  );
}

export function messageOf(err: unknown): string {
  return err instanceof AdminApiError ? err.message : "Something went wrong. Try again.";
}

type ExchangeRate = {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  source: string;
};

export function ExchangeRatesContent() {
  const user = useLiveUser();
  const [rows, setRows] = useState<ExchangeRate[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const busy = pending !== null;
  const [fromCurrency, setFrom] = useState("USD");
  const [toCurrency, setTo] = useState("BDT");
  const [rate, setRate] = useState("110");
  const [editing, setEditing] = useState<string | null>(null);
  const [editRate, setEditRate] = useState("");

  const load = useCallback(async () => {
    const data = await adminApi<{ items: ExchangeRate[] }>("/api/admin/exchange-rates");
    setRows(data.items);
  }, []);

  useEffect(() => {
    load().catch((err) => setError(messageOf(err)));
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setPending("create");
    try {
      await adminApi("/api/admin/exchange-rates", {
        method: "POST",
        body: { fromCurrency, toCurrency, rate: Number(rate), source: "admin-ui" },
      });
      await load();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPending(null);
    }
  }

  async function onSave(id: string) {
    setError("");
    setPending(`save:${id}`);
    try {
      await adminApi(`/api/admin/exchange-rates/${id}`, { method: "PUT", body: { rate: Number(editRate) } });
      setEditing(null);
      await load();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPending(null);
    }
  }

  async function onClose(id: string) {
    setError("");
    setPending(`close:${id}`);
    try {
      await adminApi(`/api/admin/exchange-rates/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Exchange rates</h1>
      <LiveBanner user={user}>
        These rates are shared by every tenant. Creating an open rate closes the previous open row for the same pair.
      </LiveBanner>
      <ErrorNote error={error} />

      <form onSubmit={onCreate} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
        <Field label="From">
          <input className={inputClass} value={fromCurrency} maxLength={3} onChange={(e) => setFrom(e.target.value.toUpperCase())} required />
        </Field>
        <Field label="To">
          <input className={inputClass} value={toCurrency} maxLength={3} onChange={(e) => setTo(e.target.value.toUpperCase())} required />
        </Field>
        <Field label="Rate">
          <input className={inputClass} value={rate} inputMode="decimal" onChange={(e) => setRate(e.target.value)} required />
        </Field>
        <div className="flex items-end">
          <button type="submit" disabled={busy} aria-busy={pending === "create"} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            {pending === "create" ? <ButtonSpinner /> : null}
            Add rate
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Pair</th>
              <th className="px-4 py-3">Rate</th>
              <th className="px-4 py-3">From</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {row.fromCurrency} → {row.toCurrency}
                </td>
                <td className="px-4 py-3">
                  {editing === row.id ? (
                    <input className={inputClass} value={editRate} onChange={(e) => setEditRate(e.target.value)} />
                  ) : (
                    row.rate
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{new Date(row.effectiveFrom).toLocaleString()}</td>
                <td className="px-4 py-3 text-slate-600">{row.source}</td>
                <td className="px-4 py-3 text-right">
                  {editing === row.id ? (
                    <button type="button" className="mr-2 inline-flex items-center gap-1 text-brand disabled:opacity-60" onClick={() => onSave(row.id)} disabled={busy} aria-busy={pending === `save:${row.id}`}>
                      {pending === `save:${row.id}` ? <ButtonSpinner className="h-3.5 w-3.5" /> : null}
                      Save
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="mr-2 text-slate-600"
                      onClick={() => {
                        setEditing(row.id);
                        setEditRate(String(row.rate));
                      }}
                    >
                      Edit
                    </button>
                  )}
                  <button type="button" className="inline-flex items-center gap-1 text-rose-600 disabled:opacity-60" onClick={() => onClose(row.id)} disabled={busy} aria-busy={pending === `close:${row.id}`}>
                    {pending === `close:${row.id}` ? <ButtonSpinner className="h-3.5 w-3.5" /> : null}
                    Close
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No open rates.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type MarkupRule = {
  id: string;
  channel: string;
  tier: string | null;
  productType: string;
  markupPercent: number;
  subAgentDefaultMargin: number;
  isActive: boolean;
};

export function MarkupRulesContent() {
  const user = useLiveUser();
  const [rows, setRows] = useState<MarkupRule[]>([]);
  const [channelFilter, setChannelFilter] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const busy = pending !== null;
  const [channel, setChannel] = useState("B2B_AGENT");
  const [tier, setTier] = useState(1);
  const [productType, setProductType] = useState("*");
  const [percent, setPercent] = useState("8");
  const [margin, setMargin] = useState("0");

  const load = useCallback(async () => {
    const q = channelFilter ? `?channel=${encodeURIComponent(channelFilter)}&pageSize=100` : "?pageSize=100";
    const data = await adminApi<{ items: MarkupRule[] }>(`/api/admin/markup-rules${q}`);
    setRows(data.items);
  }, [channelFilter]);

  useEffect(() => {
    load().catch((err) => setError(messageOf(err)));
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setPending("create");
    try {
      await adminApi("/api/admin/markup-rules", {
        method: "POST",
        body: {
          channel,
          tier: channel === "B2C" ? null : tier,
          productType,
          markupPercent: Number(percent) / 100,
          subAgentDefaultMargin: Number(margin),
        },
      });
      await load();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPending(null);
    }
  }

  async function toggle(row: MarkupRule) {
    setError("");
    setPending(`toggle:${row.id}`);
    try {
      const action = row.isActive ? "deactivate" : "activate";
      await adminApi(`/api/admin/markup-rules/${row.id}/${action}`, { method: "POST" });
      await load();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Markup rules</h1>
      <LiveBanner user={user}>
        Rules belong to the signed-in tenant. B2C rules have no tier. B2B rules need a tier. Percent is stored as a fraction (8 means 8%).
      </LiveBanner>
      <ErrorNote error={error} />

      <form onSubmit={onCreate} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-6">
        <Field label="Channel">
          <select className={inputClass} value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="B2B_AGENT">B2B agent</option>
            <option value="B2C">B2C</option>
          </select>
        </Field>
        <Field label="Tier">
          <select className={inputClass} value={tier} disabled={channel === "B2C"} onChange={(e) => setTier(Number(e.target.value))}>
            {TIERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Product">
          <select className={inputClass} value={productType} onChange={(e) => setProductType(e.target.value)}>
            {PRODUCTS.map((p) => (
              <option key={p} value={p}>
                {p === "*" ? "All products" : p}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Markup %">
          <input className={inputClass} value={percent} inputMode="decimal" onChange={(e) => setPercent(e.target.value)} required />
        </Field>
        <Field label="Sub-agent margin">
          <input className={inputClass} value={margin} inputMode="decimal" onChange={(e) => setMargin(e.target.value)} required />
        </Field>
        <div className="flex items-end">
          <button type="submit" disabled={busy} aria-busy={pending === "create"} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            {pending === "create" ? <ButtonSpinner /> : null}
            Add rule
          </button>
        </div>
      </form>

      <div className="flex gap-2">
        {["", "B2B_AGENT", "B2C"].map((value) => (
          <button
            key={value || "all"}
            type="button"
            onClick={() => setChannelFilter(value)}
            className={`rounded-full px-3 py-1 text-sm ${channelFilter === value ? "bg-brand text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
          >
            {value === "" ? "All" : value === "B2B_AGENT" ? "B2B" : "B2C"}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Channel</th>
              <th className="px-4 py-3">Tier</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Markup</th>
              <th className="px-4 py-3">Margin</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-50">
                <td className="px-4 py-3">{row.channel === "B2B_AGENT" ? "B2B" : row.channel}</td>
                <td className="px-4 py-3">{row.tier ?? "—"}</td>
                <td className="px-4 py-3">{row.productType}</td>
                <td className="px-4 py-3">{(row.markupPercent * 100).toFixed(2)}%</td>
                <td className="px-4 py-3">{row.subAgentDefaultMargin}</td>
                <td className="px-4 py-3">{row.isActive ? "Active" : "Inactive"}</td>
                <td className="px-4 py-3 text-right">
                  <button type="button" className="inline-flex items-center gap-1 text-brand disabled:opacity-60" disabled={busy} aria-busy={pending === `toggle:${row.id}`} onClick={() => toggle(row)}>
                    {pending === `toggle:${row.id}` ? <ButtonSpinner className="h-3.5 w-3.5" /> : null}
                    {row.isActive ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No markup rules for this tenant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type Agency = {
  id: string;
  displayName: string;
  email: string;
  tier: string;
  creditLimit: number;
  creditUsed: number;
  availableCredit: number;
  isActive: boolean;
};

export function AgenciesContent() {
  const user = useLiveUser();
  const [rows, setRows] = useState<Agency[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const busy = pending !== null;
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState(1);
  const [creditLimit, setCreditLimit] = useState("0");

  const load = useCallback(async (term: string) => {
    const q = term.trim() ? `?search=${encodeURIComponent(term.trim())}&pageSize=50` : "?pageSize=50";
    const data = await adminApi<{ items: Agency[] }>(`/api/admin/agencies${q}`);
    setRows(data.items);
  }, []);

  useEffect(() => {
    load("").catch((err) => setError(messageOf(err)));
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setPending("create");
    try {
      await adminApi("/api/admin/agencies", {
        method: "POST",
        body: { displayName, email, tier, creditLimit: Number(creditLimit) },
      });
      setDisplayName("");
      setEmail("");
      await load(search);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPending(null);
    }
  }

  async function toggle(row: Agency) {
    setError("");
    setPending(`toggle:${row.id}`);
    try {
      const action = row.isActive ? "deactivate" : "activate";
      await adminApi(`/api/admin/agencies/${row.id}/${action}`, { method: "POST" });
      await load(search);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Agencies</h1>
      <LiveBanner user={user}>
        Live agencies for this tenant. B2B lists the travel agencies. The B2C tenant usually has none, because customers are not agencies. Other partner screens still use sample data.
      </LiveBanner>
      <ErrorNote error={error} />

      <form onSubmit={onCreate} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-5">
        <Field label="Name">
          <input className={inputClass} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </Field>
        <Field label="Email">
          <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Tier">
          <select className={inputClass} value={tier} onChange={(e) => setTier(Number(e.target.value))}>
            {TIERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Credit limit">
          <input className={inputClass} value={creditLimit} inputMode="decimal" onChange={(e) => setCreditLimit(e.target.value)} required />
        </Field>
        <div className="flex items-end">
          <button type="submit" disabled={busy} aria-busy={pending === "create"} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            {pending === "create" ? <ButtonSpinner /> : null}
            Add agency
          </button>
        </div>
      </form>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPending("search");
          load(search)
            .catch((err) => setError(messageOf(err)))
            .finally(() => setPending(null));
        }}
      >
        <input className={inputClass} placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button type="submit" disabled={busy} aria-busy={pending === "search"} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white disabled:opacity-60">
          {pending === "search" ? <ButtonSpinner /> : null}
          Search
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Agency</th>
              <th className="px-4 py-3">Tier</th>
              <th className="px-4 py-3">Credit</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{row.displayName}</div>
                  <div className="text-slate-500">{row.email}</div>
                </td>
                <td className="px-4 py-3">{row.tier}</td>
                <td className="px-4 py-3">
                  {row.availableCredit} available · {row.creditUsed} used of {row.creditLimit}
                </td>
                <td className="px-4 py-3">{row.isActive ? "Active" : "Inactive"}</td>
                <td className="px-4 py-3 text-right">
                  <button type="button" className="inline-flex items-center gap-1 text-brand disabled:opacity-60" disabled={busy} aria-busy={pending === `toggle:${row.id}`} onClick={() => toggle(row)}>
                    {pending === `toggle:${row.id}` ? <ButtonSpinner className="h-3.5 w-3.5" /> : null}
                    {row.isActive ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No agencies in this tenant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
