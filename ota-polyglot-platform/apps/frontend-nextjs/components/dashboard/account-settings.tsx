"use client";

import { useEffect, useState } from "react";
import type { PartnerAccount } from "@/data/profile";
import { usePartnerProfile } from "./partner-profile";
import { CheckIcon, LockIcon } from "./icons";

const fieldClass =
  "h-11 w-full rounded-xl border border-aerotake-border bg-white px-3.5 text-[13px] text-aerotake-navy outline-none placeholder:text-aerotake-muted focus:border-aerotake-coral focus:ring-2 focus:ring-aerotake-coral/15";

const timezones = ["Asia/Dhaka (GMT+6)", "Asia/Dubai (GMT+4)", "Asia/Kolkata (GMT+5:30)", "UTC"];
const languages = ["English", "Bangla"];

export default function AccountSettings() {
  const { account, updateAccount } = usePartnerProfile();
  const [form, setForm] = useState<PartnerAccount>(account);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saved, setSaved] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    setForm(account);
  }, [account]);

  function setField<K extends keyof PartnerAccount>(key: K, value: PartnerAccount[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function handleSaveAccount(event: React.FormEvent) {
    event.preventDefault();
    updateAccount({
      ...form,
      loginEmail: form.loginEmail.trim() || account.loginEmail,
      phone: form.phone.trim(),
    });
    setSaved(true);
  }

  function handleSavePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordSaved(false);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Fill in all password fields.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }

    setPasswordError("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordSaved(true);
  }

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5 px-4 py-4 pb-24 sm:px-6 sm:py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-aerotake-navy">
            Account Settings
          </h1>
          <p className="mt-1 text-[13px] text-aerotake-muted">
            Login, security, and notification preferences for this partner account.
          </p>
        </div>
        {saved ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ecfdf3] px-3 py-1.5 text-[12px] font-semibold text-[#16a34a]">
            <CheckIcon className="h-3.5 w-3.5" />
            Settings saved
          </span>
        ) : null}
      </div>

      <section className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.05)] sm:p-6">
        <form onSubmit={handleSaveAccount} className="space-y-6">
          <Section title="Sign-in details">
            <Field label="Login email">
              <input
                type="email"
                value={form.loginEmail}
                onChange={(event) => setField("loginEmail", event.target.value)}
                className={fieldClass}
                required
              />
            </Field>
            <Field label="Recovery phone">
              <input
                type="tel"
                value={form.phone}
                onChange={(event) => setField("phone", event.target.value)}
                className={fieldClass}
              />
            </Field>
            <Field label="Timezone">
              <select
                value={form.timezone}
                onChange={(event) => setField("timezone", event.target.value)}
                className={fieldClass}
              >
                {timezones.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Language">
              <select
                value={form.language}
                onChange={(event) => setField("language", event.target.value)}
                className={fieldClass}
              >
                {languages.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
          </Section>

          <Section title="Notifications">
            <Toggle
              label="Email alerts"
              description="Booking confirmations, voids, and refunds"
              checked={form.emailAlerts}
              onChange={(checked) => setField("emailAlerts", checked)}
            />
            <Toggle
              label="SMS alerts"
              description="Critical ticket and payment updates"
              checked={form.smsAlerts}
              onChange={(checked) => setField("smsAlerts", checked)}
            />
            <Toggle
              label="Marketing emails"
              description="Deals, fare promotions, and product news"
              checked={form.marketingEmails}
              onChange={(checked) => setField("marketingEmails", checked)}
            />
          </Section>

          <div className="flex justify-end border-t border-aerotake-border pt-5">
            <button
              type="submit"
              className="h-11 rounded-xl bg-aerotake-coral px-5 text-[13px] font-semibold text-white shadow-[0_10px_20px_rgba(249,115,96,0.28)] hover:bg-aerotake-coral-dark"
            >
              Save settings
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.05)] sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="text-aerotake-coral">
            <LockIcon />
          </span>
          <h2 className="text-[14px] font-semibold text-aerotake-navy">Password</h2>
          {passwordSaved ? (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#ecfdf3] px-3 py-1 text-[11px] font-semibold text-[#16a34a]">
              <CheckIcon className="h-3.5 w-3.5" />
              Password updated
            </span>
          ) : null}
        </div>
        <form onSubmit={handleSavePassword} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Current password">
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => {
                  setCurrentPassword(event.target.value);
                  setPasswordError("");
                  setPasswordSaved(false);
                }}
                className={fieldClass}
                autoComplete="current-password"
              />
            </Field>
            <Field label="New password">
              <input
                type="password"
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value);
                  setPasswordError("");
                  setPasswordSaved(false);
                }}
                className={fieldClass}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirm new password">
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setPasswordError("");
                  setPasswordSaved(false);
                }}
                className={fieldClass}
                autoComplete="new-password"
              />
            </Field>
          </div>
          {passwordError ? (
            <p className="text-[12px] font-medium text-aerotake-coral">{passwordError}</p>
          ) : (
            <p className="text-[12px] text-aerotake-muted">
              Use at least 8 characters. Password changes apply on next login.
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              className="h-11 rounded-xl border border-aerotake-border px-5 text-[13px] font-semibold text-aerotake-navy hover:bg-aerotake-canvas"
            >
              Update password
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-[14px] font-semibold text-aerotake-navy">{title}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[12px] font-medium text-aerotake-navy">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-aerotake-border px-3.5 py-3 sm:col-span-2">
      <span>
        <span className="block text-[13px] font-medium text-aerotake-navy">{label}</span>
        <span className="mt-0.5 block text-[12px] text-aerotake-muted">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 accent-aerotake-coral"
      />
    </label>
  );
}
