"use client";

import { useEffect, useRef, useState } from "react";
import type { PartnerProfile } from "@/data/profile";
import { usePartnerProfile } from "./partner-profile";
import ProfileAvatar from "./profile-avatar";
import { CameraIcon, CheckIcon } from "./icons";

const fieldClass =
  "h-11 w-full rounded-xl border border-aerotake-border bg-white px-3.5 text-[13px] text-aerotake-navy outline-none placeholder:text-aerotake-muted focus:border-aerotake-coral focus:ring-2 focus:ring-aerotake-coral/15";

const countries = ["Bangladesh", "India", "United Arab Emirates", "United States"];
const states = ["Dhaka", "Chittagong", "Sylhet", "Khulna"];
const cities = ["Dhaka", "Chattogram", "Sylhet", "Khulna"];
const districts = ["Dhaka", "Gazipur", "Narayanganj", "Tangail"];
const agencyTypes = ["Retail", "Corporate", "Online", "Wholesale"];

export default function ProfileSettings() {
  const { profile, updateProfile } = usePartnerProfile();
  const [form, setForm] = useState<PartnerProfile>(profile);
  const [saved, setSaved] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(profile);
  }, [profile]);

  function setField<K extends keyof PartnerProfile>(key: K, value: PartnerProfile[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setPhotoError("Please choose a JPG, PNG, or WEBP image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError("Image must be 2 MB or smaller.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      if (!result) {
        setPhotoError("Could not read that image. Try another file.");
        return;
      }
      setField("avatarUrl", result);
      setPhotoError("");
    };
    reader.onerror = () => setPhotoError("Could not read that image. Try another file.");
    reader.readAsDataURL(file);
  }

  function handleRemovePhoto() {
    setField("avatarUrl", null);
    setPhotoError("");
  }

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    updateProfile({
      ...form,
      agencyName: form.agencyName.trim() || profile.agencyName,
      agencyId: form.agencyId.trim() || profile.agencyId,
      contactName: form.contactName.trim(),
      email: form.email.trim(),
    });
    setSaved(true);
  }

  function handleReset() {
    setForm(profile);
    setSaved(false);
    setPhotoError("");
  }

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5 px-4 py-4 pb-24 sm:px-6 sm:py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-aerotake-navy">
            Update Profile
          </h1>
          <p className="mt-1 text-[13px] text-aerotake-muted">
            Agency identity, photo, and contact details used on bookings and invoices.
          </p>
        </div>
        {saved ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ecfdf3] px-3 py-1.5 text-[12px] font-semibold text-[#16a34a]">
            <CheckIcon className="h-3.5 w-3.5" />
            Profile saved
          </span>
        ) : null}
      </div>

      <section className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.05)] sm:p-6">
        <div className="flex flex-wrap items-center gap-4 border-b border-aerotake-border pb-5">
          <ProfileAvatar name={form.agencyName} avatarUrl={form.avatarUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-semibold text-aerotake-navy">
              {form.agencyName || "Agency name"}
            </p>
            <p className="mt-0.5 text-[13px] text-aerotake-muted">
              {form.agencyId || "Agency ID"} · {form.agencyType}
            </p>
            <p className="mt-1 text-[12px] text-aerotake-muted">{form.email}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={handlePhotoChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-aerotake-coral px-3 text-[12px] font-semibold text-white hover:bg-aerotake-coral-dark"
              >
                <CameraIcon />
                Change photo
              </button>
              {form.avatarUrl ? (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="inline-flex h-9 items-center rounded-lg border border-aerotake-border px-3 text-[12px] font-semibold text-aerotake-navy hover:bg-aerotake-canvas"
                >
                  Remove
                </button>
              ) : null}
            </div>
            <p className="mt-2 text-[11px] text-aerotake-muted">JPG, PNG or WEBP · max 2 MB</p>
            {photoError ? (
              <p className="mt-1 text-[12px] font-medium text-aerotake-coral">{photoError}</p>
            ) : null}
          </div>
        </div>

        <form onSubmit={handleSave} className="mt-5 space-y-6">
          <Section title="Agency identity">
            <Field label="Agency name">
              <input
                value={form.agencyName}
                onChange={(event) => setField("agencyName", event.target.value)}
                className={fieldClass}
                required
              />
            </Field>
            <Field label="Agency ID">
              <input
                value={form.agencyId}
                onChange={(event) => setField("agencyId", event.target.value)}
                className={fieldClass}
                required
              />
            </Field>
            <Field label="Contact person">
              <input
                value={form.contactName}
                onChange={(event) => setField("contactName", event.target.value)}
                className={fieldClass}
              />
            </Field>
            <Field label="Agency type">
              <select
                value={form.agencyType}
                onChange={(event) => setField("agencyType", event.target.value)}
                className={fieldClass}
              >
                {agencyTypes.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
          </Section>

          <Section title="Contact details">
            <Field label="Agency email">
              <input
                type="email"
                value={form.email}
                onChange={(event) => setField("email", event.target.value)}
                className={fieldClass}
                required
              />
            </Field>
            <Field label="Mobile number">
              <input
                type="tel"
                value={form.mobile}
                onChange={(event) => setField("mobile", event.target.value)}
                className={fieldClass}
              />
            </Field>
            <Field label="Office contact">
              <input
                type="tel"
                value={form.officeContact}
                onChange={(event) => setField("officeContact", event.target.value)}
                className={fieldClass}
              />
            </Field>
            <Field label="Address" className="sm:col-span-2 lg:col-span-3">
              <input
                value={form.address}
                onChange={(event) => setField("address", event.target.value)}
                className={fieldClass}
              />
            </Field>
          </Section>

          <Section title="Location">
            <Field label="Country">
              <select
                value={form.country}
                onChange={(event) => setField("country", event.target.value)}
                className={fieldClass}
              >
                {countries.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="State">
              <select
                value={form.state}
                onChange={(event) => setField("state", event.target.value)}
                className={fieldClass}
              >
                {states.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="City">
              <select
                value={form.city}
                onChange={(event) => setField("city", event.target.value)}
                className={fieldClass}
              >
                {cities.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="District">
              <select
                value={form.district}
                onChange={(event) => setField("district", event.target.value)}
                className={fieldClass}
              >
                {districts.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
          </Section>

          <Section title="Compliance">
            <Field label="Trade license">
              <input
                value={form.tradeLicense}
                onChange={(event) => setField("tradeLicense", event.target.value)}
                className={fieldClass}
              />
            </Field>
            <Field label="Civil aviation">
              <input
                value={form.civilAviation}
                onChange={(event) => setField("civilAviation", event.target.value)}
                className={fieldClass}
              />
            </Field>
            <Field label="ATAB / TOAB / Other">
              <input
                value={form.membership}
                onChange={(event) => setField("membership", event.target.value)}
                className={fieldClass}
              />
            </Field>
          </Section>

          <div className="flex flex-wrap justify-end gap-3 border-t border-aerotake-border pt-5">
            <button
              type="button"
              onClick={handleReset}
              className="h-11 rounded-xl border border-aerotake-border px-5 text-[13px] font-semibold text-aerotake-navy hover:bg-aerotake-canvas"
            >
              Reset
            </button>
            <button
              type="submit"
              className="h-11 rounded-xl bg-aerotake-coral px-5 text-[13px] font-semibold text-white shadow-[0_10px_20px_rgba(249,115,96,0.28)] hover:bg-aerotake-coral-dark"
            >
              Save changes
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
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
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
