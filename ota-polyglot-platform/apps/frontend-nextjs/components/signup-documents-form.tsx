"use client";

import AuthBackLink from "@/components/auth-back-link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type UploadFieldProps = {
  id: string;
  label: string;
  file: File | null;
  onSelect: (file: File | null) => void;
  required?: boolean;
};

function UploadField({ id, label, file, onSelect, required = false }: UploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative">
      <span className="absolute -top-2.5 left-3 z-10 bg-aerotake-white px-1.5 text-sm text-aerotake-muted">
        {label}
        {required ? <span className="text-aerotake-coral"> *</span> : null}
      </span>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex h-14 w-full items-center justify-between rounded-lg border border-aerotake-border bg-aerotake-white px-4 text-left outline-none transition-colors hover:border-aerotake-muted/50 focus-visible:border-aerotake-coral focus-visible:ring-2 focus-visible:ring-aerotake-coral/20"
      >
        <span
          className={`truncate text-sm ${file ? "text-aerotake-navy" : "text-aerotake-muted"}`}
        >
          {file ? file.name : "Upload Document"}
        </span>
        <DocumentIcon />
      </button>
      <input
        ref={inputRef}
        id={id}
        name={id}
        type="file"
        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
        className="sr-only"
        onChange={(event) => {
          onSelect(event.target.files?.[0] ?? null);
        }}
      />
    </div>
  );
}

export default function SignupDocumentsForm() {
  const router = useRouter();
  const [kycFile, setKycFile] = useState<File | null>(null);
  const [agreementFile, setAgreementFile] = useState<File | null>(null);

  return (
    <form
      className="w-full"
      onSubmit={(event) => {
        event.preventDefault();
        if (!kycFile || !agreementFile) return;
        router.push("/thank-you/documents");
      }}
    >
      <AuthBackLink href="/signup/agency" label="Go back" />

      <h1 className="mt-8 text-[32px] font-bold leading-tight tracking-tight text-aerotake-navy">
        Sign up
      </h1>
      <p className="mt-1 text-[15px] leading-6 text-aerotake-muted">Document Upload</p>

      <div className="mt-8 space-y-5">
        <UploadField
          id="kyc"
          label="KYC Form"
          file={kycFile}
          onSelect={setKycFile}
          required
        />
        <UploadField
          id="agreement"
          label="Upload Signed Agreement"
          file={agreementFile}
          onSelect={setAgreementFile}
          required
        />
      </div>

      <button
        type="submit"
        disabled={!kycFile || !agreementFile}
        className="mt-8 h-12 w-full rounded-lg bg-aerotake-coral text-[15px] font-semibold text-white transition-colors hover:bg-aerotake-coral-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        Submit
      </button>
    </form>
  );
}

function DocumentIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0 text-aerotake-muted/70"
      fill="none"
      aria-hidden
    >
      <path
        d="M7 3.5h7.2L19 8.3V20a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 6 20V5A1.5 1.5 0 0 1 7.5 3.5H7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M14 3.5V8h4.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9 12h6M9 15.5h6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
