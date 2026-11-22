"use client";

import AuthBackLink from "@/components/auth-back-link";
import {
  SignupFloatingField,
  SignupSelectField,
  signupFieldClass,
} from "@/components/signup-form-fields";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export default function SignupAgencyForm() {
  const router = useRouter();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState("");

  function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setLogoError("Please choose a JPG, PNG, or WEBP image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError("Logo must be 2 MB or smaller.");
      return;
    }

    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    setLogoError("");
  }

  function handleRemoveLogo() {
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoFile(null);
    setLogoPreview(null);
    setLogoError("");
  }

  return (
    <form
      className="w-full"
      onSubmit={(event) => {
        event.preventDefault();
        router.push("/signup/documents");
      }}
    >
      <AuthBackLink href="/signup" label="Go back" />

      <h1 className="mt-8 text-[32px] font-bold leading-tight tracking-tight text-aerotake-navy">
        Sign up
      </h1>
      <p className="mt-1 text-[15px] leading-6 text-aerotake-muted">Agency Details</p>

      <div className="mt-8 space-y-4">
        <div className="rounded-lg border border-aerotake-border bg-aerotake-white p-4">
          <p className="text-sm text-aerotake-muted">Agency Logo</p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-aerotake-border bg-[#f8fafc]">
              {logoPreview ? (
                <Image
                  src={logoPreview}
                  alt="Agency logo preview"
                  width={80}
                  height={80}
                  unoptimized
                  className="h-full w-full object-contain"
                />
              ) : (
                <ImageIcon />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <input
                ref={logoInputRef}
                id="agencyLogo"
                name="agencyLogo"
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={handleLogoChange}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="inline-flex h-10 items-center rounded-lg border border-aerotake-border px-4 text-[13px] font-semibold text-aerotake-navy hover:bg-[#f8fafc]"
                >
                  {logoFile ? "Change logo" : "Upload logo"}
                </button>
                {logoFile ? (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="inline-flex h-10 items-center rounded-lg px-4 text-[13px] font-semibold text-aerotake-coral hover:bg-[#fff1f0]"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <p className="mt-2 text-[12px] text-aerotake-muted">
                {logoFile ? logoFile.name : "Optional · JPG, PNG, or WEBP · Max 2 MB"}
              </p>
              {logoError ? (
                <p className="mt-1 text-[12px] text-aerotake-coral">{logoError}</p>
              ) : null}
            </div>
          </div>
        </div>

        <SignupFloatingField id="agencyName" label="Name" required>
          <input
            id="agencyName"
            name="agencyName"
            type="text"
            required
            defaultValue="John Doe Agency"
            className={signupFieldClass}
          />
        </SignupFloatingField>

        <SignupFloatingField id="address" label="Address" required>
          <input
            id="address"
            name="address"
            type="text"
            required
            defaultValue="john.doe@gmail.com"
            className={signupFieldClass}
          />
        </SignupFloatingField>

        <div className="grid grid-cols-2 gap-4">
          <SignupSelectField
            id="country"
            label="Country"
            placeholder="Select your country"
            options={["Bangladesh", "India", "United Arab Emirates", "United States"]}
          />
          <SignupSelectField
            id="state"
            label="State"
            placeholder="Select your state"
            options={["Dhaka", "Chittagong", "Sylhet", "Khulna"]}
          />
          <SignupSelectField
            id="city"
            label="City"
            placeholder="Select your city"
            options={["Dhaka", "Chittagong", "Sylhet", "Khulna"]}
          />
          <SignupSelectField
            id="district"
            label="District"
            placeholder="Select your district"
            options={["Dhaka", "Gazipur", "Narayanganj", "Tangail"]}
          />
          <SignupFloatingField id="tradeLicense" label="Trade License" required>
            <input
              id="tradeLicense"
              name="tradeLicense"
              type="text"
              required
              defaultValue="XXXXXXXXXXX"
              className={signupFieldClass}
            />
          </SignupFloatingField>
          <SignupFloatingField id="civilAviation" label="Civil Aviation">
            <input
              id="civilAviation"
              name="civilAviation"
              type="text"
              placeholder="XXXXXXXXXXX"
              className={signupFieldClass}
            />
          </SignupFloatingField>
          <SignupFloatingField id="membership" label="ATAB/TOAB/Other">
            <input
              id="membership"
              name="membership"
              type="text"
              placeholder="XXXXXXXXXXX"
              className={signupFieldClass}
            />
          </SignupFloatingField>
          <SignupSelectField
            id="agencyType"
            label="Agency Type"
            placeholder="Select agency type"
            options={["Retail", "Corporate", "Online", "Wholesale"]}
          />
        </div>

        <SignupFloatingField id="agencyEmail" label="Agency Email" required>
          <input
            id="agencyEmail"
            name="agencyEmail"
            type="email"
            autoComplete="email"
            required
            defaultValue="john.doe@gmail.com"
            className={signupFieldClass}
          />
        </SignupFloatingField>

        <div className="grid grid-cols-2 gap-4">
          <SignupFloatingField id="mobile" label="Mobile Number" required>
            <input
              id="mobile"
              name="mobile"
              type="tel"
              autoComplete="tel"
              required
              defaultValue="XXXXXXXXXXX"
              className={signupFieldClass}
            />
          </SignupFloatingField>
          <SignupFloatingField id="officeContact" label="Office Contact Number" required>
            <input
              id="officeContact"
              name="officeContact"
              type="tel"
              required
              defaultValue="XXXXXXXXXXX"
              className={signupFieldClass}
            />
          </SignupFloatingField>
        </div>
      </div>

      <button
        type="submit"
        className="mt-8 h-12 w-full rounded-lg bg-aerotake-coral text-[15px] font-semibold text-white transition-colors hover:bg-aerotake-coral-dark"
      >
        Submit
      </button>
    </form>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8 text-aerotake-muted/60" fill="none" aria-hidden>
      <rect
        x="3.5"
        y="5.5"
        width="17"
        height="13"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" />
      <path
        d="m6 16.5 4.5-4 3 2.5L17.5 11 20.5 16.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
