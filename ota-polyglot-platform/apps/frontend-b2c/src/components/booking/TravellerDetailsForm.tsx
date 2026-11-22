"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  FieldErrors,
  UseFormRegister,
  UseFormSetValue,
  UseFormTrigger,
} from "react-hook-form";
import { LuCamera, LuInfo } from "react-icons/lu";
import type { PassengerForm } from "@/context/AppProviders";
import PassportScanModal, { type PassportScanResult } from "@/components/booking/PassportScanModal";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { emailValidationError, isEmailValid, shouldShowEmailHint } from "@/lib/email";
import { maxDobForAgeUnder, minDobForAgeAtLeast, todayIso, type TravellerBand } from "@/lib/dates";
import {
  isPlausiblePassportNumber,
  normalizePassportNumber,
  PASSPORT_NUMBER_MAX_LENGTH,
  passportExpiryError,
} from "@/lib/passport";
import {
  digitsOnly,
  isPhoneValid,
  phoneInputMaxLength,
  phonePlaceholder,
  phoneValidationError,
  shouldShowPhoneHint,
} from "@/lib/phone";

export type TravellerFormValues = {
  passengers: PassengerForm[];
  email: string;
  phone: string;
  phoneCountry: string;
};

type Props = {
  fields: { id: string }[];
  /** Adult / child / infant slot for each traveller (same order as search counts). */
  travellerSlots?: TravellerBand[];
  /** Date the age bands are judged on (departure). Falls back to today. */
  ageOn?: string;
  /** Initial / current passengers from the parent form (used to seed local state). */
  passengers: PassengerForm[];
  register: UseFormRegister<TravellerFormValues>;
  setValue: UseFormSetValue<TravellerFormValues>;
  trigger: UseFormTrigger<TravellerFormValues>;
  errors: FieldErrors<TravellerFormValues>;
  email: string;
  phone: string;
  /** Current dial so the national field can apply BD 11-digit rules. */
  phoneCountry: string;
  onBack: () => void;
  /** Defaults to "Back to fare" (previous checkout step). */
  backLabel?: string;
  onSubmit: () => void;
  submitting?: boolean;
  /** Defaults to "Reserve seats" / "Reserving…". */
  submitLabel?: string;
};

const SLOT_LABEL: Record<TravellerBand, string> = {
  adult: "Adult",
  child: "Child",
  infant: "Infant",
};

const SLOT_HINT: Record<TravellerBand, string> = {
  adult: "12+ years on the departure date",
  child: "2–11 years on the departure date",
  infant: "Under 2 on the departure date · travels on a lap",
};

const countries = [
  "Bangladesh",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "India",
  "Singapore",
  "Malaysia",
] as const;

const ALPHA3_TO_NATIONALITY: Record<string, (typeof countries)[number]> = {
  BGD: "Bangladesh",
  ARE: "United Arab Emirates",
  GBR: "United Kingdom",
  USA: "United States",
  IND: "India",
  SGP: "Singapore",
  MYS: "Malaysia",
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="form-error mt-1 text-xs" role="alert">
      {message}
    </p>
  );
}

function titleFromScan(result: PassportScanResult): string {
  if (result.title === "ms" || result.gender === "female") return "Ms";
  return "Mr";
}

function emptyPassenger(): PassengerForm {
  return {
    title: "Mr",
    firstName: "",
    lastName: "",
    gender: "",
    dob: "",
    nationality: "Bangladesh",
    passportNumber: "",
    passportExpiry: "",
    frequentFlyer: "",
    postCode: "",
  };
}

export default function TravellerDetailsForm({
  fields,
  travellerSlots,
  ageOn,
  passengers: passengersProp,
  register,
  setValue,
  trigger,
  errors,
  email,
  phone,
  phoneCountry,
  onBack,
  backLabel = "Back to fare",
  onSubmit,
  submitting = false,
  submitLabel,
}: Props) {
  const phoneMax = phoneInputMaxLength(phoneCountry);
  const phoneRegister = register("phone");
  const phoneCountryRegister = register("phoneCountry");
  const [activePax, setActivePax] = useState(0);
  const [scanOpen, setScanOpen] = useState(false);
  // Local controlled state (same pattern as B2B checkout) — RHF setValue alone was
  // not updating the inputs after OCR.
  const [paxList, setPaxList] = useState<PassengerForm[]>(() =>
    passengersProp.length > 0 ? passengersProp.map((p) => ({ ...emptyPassenger(), ...p })) : [emptyPassenger()],
  );
  const scanIndexRef = useRef(0);

  // Incoming search can add a child or infant slot after the first paint. Grow the local list to match.
  useEffect(() => {
    setPaxList((current) => {
      if (current.length === fields.length) return current;
      if (current.length > fields.length) return current.slice(0, fields.length);
      return [...current, ...Array.from({ length: fields.length - current.length }, () => emptyPassenger())];
    });
  }, [fields.length]);

  // Keep react-hook-form in sync so submit / zod still see the latest passengers.
  useEffect(() => {
    setValue("passengers", paxList, { shouldValidate: true, shouldDirty: true });
  }, [paxList, setValue]);

  const travellersComplete = useMemo(() => {
    return paxList.filter((p) => {
      return (
        Boolean(p?.firstName?.trim()) &&
        Boolean(p?.lastName?.trim()) &&
        Boolean(p?.gender) &&
        Boolean(p?.nationality) &&
        Boolean(p?.dob) &&
        isPlausiblePassportNumber(p?.passportNumber ?? "") &&
        passportExpiryError(p?.passportExpiry ?? "") === null
      );
    }).length;
  }, [paxList]);

  const contactComplete = isEmailValid(email) && isPhoneValid(phoneCountry, phone);

  const emailHintError =
    errors.email?.message ?? (shouldShowEmailHint(email) ? emailValidationError(email) : null);

  const phoneHintError =
    errors.phone?.message ??
    (shouldShowPhoneHint(phoneCountry, phone) ? phoneValidationError(phoneCountry, phone) : null);

  const index = Math.min(activePax, Math.max(0, fields.length - 1));
  const pax = paxList[index] ?? emptyPassenger();
  const slot: TravellerBand = travellerSlots?.[index] ?? "adult";
  const today = /^\d{4}-\d{2}-\d{2}$/.test(ageOn ?? "") ? ageOn! : todayIso();
  // HTML min = earliest (oldest person); max = latest (youngest person).
  const dobMin =
    slot === "infant"
      ? maxDobForAgeUnder(2, today)
      : slot === "child"
        ? maxDobForAgeUnder(12, today)
        : "1900-01-01";
  const dobMax =
    slot === "infant" ? today : slot === "child" ? minDobForAgeAtLeast(2, today) : minDobForAgeAtLeast(12, today);

  function patchPax(i: number, patch: Partial<PassengerForm>) {
    setPaxList((current) =>
      current.map((item, idx) => (idx === i ? { ...item, ...patch } : item)),
    );
  }

  function applyPassportScan(result: PassportScanResult) {
    const i = scanIndexRef.current;
    const nationality = result.nationality
      ? ALPHA3_TO_NATIONALITY[result.nationality.trim().toUpperCase()]
      : undefined;

    setPaxList((current) => {
      if (i < 0 || i >= current.length) return current;
      const existing = current[i];
      return current.map((item, idx) =>
        idx === i
          ? {
              ...item,
              title: titleFromScan(result),
              firstName: result.firstName || existing.firstName,
              lastName: result.lastName || existing.lastName,
              gender: result.gender || existing.gender,
              dob: result.dateOfBirth || existing.dob,
              passportNumber: result.passportNumber
                ? result.passportNumber.toUpperCase()
                : existing.passportNumber,
              passportExpiry: result.expiryDate || existing.passportExpiry,
              nationality: nationality ?? existing.nationality,
            }
          : item,
      );
    });
    setActivePax(i);
  }

  function openScan() {
    scanIndexRef.current = index;
    setScanOpen(true);
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
        <h2 className="text-lg font-bold text-navy">Provide Traveller Details</h2>
        <p className="text-sm font-semibold text-slate">
          {travellersComplete} of {fields.length} travellers · contact{" "}
          {contactComplete ? "complete" : "incomplete"}
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-border px-4 py-2 sm:px-5">
        {fields.map((field, i) => {
          const active = i === index;
          const band = travellerSlots?.[i] ?? "adult";
          return (
            <button
              key={field.id}
              type="button"
              onClick={() => setActivePax(i)}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-semibold transition ${
                active
                  ? "bg-primary-tint text-primary-strong ring-1 ring-primary-strong/25"
                  : "bg-bg text-slate hover:text-navy"
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  active ? "bg-primary-strong text-white" : "bg-border text-navy"
                }`}
              >
                {i + 1}
              </span>
              {SLOT_LABEL[band]} {i === 0 && band === "adult" ? "· primary" : ""}
            </button>
          );
        })}
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="rounded-xl border border-border bg-bg px-4 py-3">
          <p className="text-sm font-semibold text-navy">
            {SLOT_LABEL[slot]} {index + 1}
          </p>
          <p className="mt-0.5 text-xs text-slate">{SLOT_HINT[slot]}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">
            Enter details exactly as on the passport
          </p>
          <div className="h-px flex-1 bg-border" />
        </div>

        <button
          type="button"
          onClick={openScan}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary-strong/30 bg-primary-tint/40 px-4 py-3 text-sm font-semibold text-primary-strong transition hover:bg-primary-tint"
        >
          <LuCamera className="h-4 w-4" aria-hidden />
          Scan passport to auto-fill
        </button>

        <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-bg px-3.5 py-3 text-[13px] leading-snug text-warning-text">
          <LuInfo className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Provide all the information exactly as they appear in the passport to
            avoid boarding complications. You can scan the passport page or type the
            details by hand.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-semibold text-navy" htmlFor={`given-${index}`}>
              Given Name
            </label>
            <input
              id={`given-${index}`}
              className={`input-field h-12 w-full rounded-xl px-3 text-base ${
                errors.passengers?.[index]?.firstName ? "border-error" : ""
              }`}
              placeholder="As in passport"
              value={pax.firstName}
              onChange={(e) => patchPax(index, { firstName: e.target.value })}
            />
            <FieldError message={errors.passengers?.[index]?.firstName?.message} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-navy" htmlFor={`surname-${index}`}>
              Surname <span className="text-error">*</span>
            </label>
            <input
              id={`surname-${index}`}
              className={`input-field h-12 w-full rounded-xl px-3 text-base ${
                errors.passengers?.[index]?.lastName ? "border-error" : ""
              }`}
              placeholder="As in passport"
              value={pax.lastName}
              onChange={(e) => patchPax(index, { lastName: e.target.value })}
            />
            <FieldError message={errors.passengers?.[index]?.lastName?.message} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-navy" htmlFor={`gender-${index}`}>
              Select Gender <span className="text-error">*</span>
            </label>
            <select
              id={`gender-${index}`}
              className={`input-field h-12 w-full rounded-xl px-3 text-base ${
                errors.passengers?.[index]?.gender ? "border-error text-error" : ""
              }`}
              value={pax.gender}
              onChange={(e) => patchPax(index, { gender: e.target.value })}
            >
              <option value="">Select Gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other / Unspecified</option>
            </select>
            <FieldError message={errors.passengers?.[index]?.gender?.message} />
          </div>

          <div>
            <label
              className="mb-1 block text-sm font-semibold text-navy"
              htmlFor={`nationality-${index}`}
            >
              Select Nationality <span className="text-error">*</span>
            </label>
            <select
              id={`nationality-${index}`}
              className="input-field h-12 w-full rounded-xl px-3 text-base"
              value={pax.nationality || "Bangladesh"}
              onChange={(e) => patchPax(index, { nationality: e.target.value })}
            >
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <FieldError message={errors.passengers?.[index]?.nationality?.message} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-navy" htmlFor={`dob-${index}`}>
              Date of Birth <span className="text-error">*</span>
            </label>
            <input
              id={`dob-${index}`}
              type="date"
              min={dobMin}
              max={dobMax}
              className={`input-field h-12 w-full rounded-xl px-3 text-base ${
                errors.passengers?.[index]?.dob ? "border-error" : ""
              }`}
              value={pax.dob}
              onChange={(e) => patchPax(index, { dob: e.target.value })}
            />
            <p className="mt-1 text-xs text-slate">{SLOT_HINT[slot]}</p>
            <FieldError message={errors.passengers?.[index]?.dob?.message} />
          </div>

          <div>
            <label
              className="mb-1 block text-sm font-semibold text-navy"
              htmlFor={`ffn-${index}`}
            >
              Frequent Flyer Number
            </label>
            <input
              id={`ffn-${index}`}
              className="input-field h-12 w-full rounded-xl px-3 text-base"
              placeholder="Optional"
              value={pax.frequentFlyer}
              onChange={(e) => patchPax(index, { frequentFlyer: e.target.value })}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-navy" htmlFor="phone">
              Phone Number <span className="text-error">*</span>
            </label>
            <div className="flex gap-2">
              <select
                className="input-field h-12 w-[118px] shrink-0 rounded-xl px-2 text-sm"
                {...phoneCountryRegister}
                onChange={(e) => {
                  void phoneCountryRegister.onChange(e);
                  void trigger("phone");
                }}
              >
                <option value="+880">🇧🇩 +880</option>
                <option value="+971">🇦🇪 +971</option>
                <option value="+44">🇬🇧 +44</option>
                <option value="+1">🇺🇸 +1</option>
                <option value="+91">🇮🇳 +91</option>
              </select>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={phoneMax}
                name={phoneRegister.name}
                ref={phoneRegister.ref}
                className={`input-field h-12 min-w-0 flex-1 rounded-xl px-3 text-base ${
                  errors.phone || phoneHintError ? "border-error" : ""
                }`}
                placeholder={phonePlaceholder(phoneCountry)}
                onBlur={(e) => {
                  void phoneRegister.onBlur(e);
                  void trigger("phone");
                }}
                onChange={(e) => {
                  e.target.value = digitsOnly(e.target.value).slice(0, phoneMax);
                  void phoneRegister.onChange(e);
                  if (e.target.value.length >= phoneMax || phoneCountry === "+880") {
                    void trigger("phone");
                  }
                }}
              />
            </div>
            <FieldError message={phoneHintError ?? undefined} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-navy" htmlFor="email">
              Email <span className="text-error">*</span>
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className={`input-field h-12 w-full rounded-xl px-3 text-base ${
                errors.email || emailHintError ? "border-error" : ""
              }`}
              placeholder="name@example.com"
              {...register("email", {
                onBlur: () => {
                  void trigger("email");
                },
              })}
            />
            <FieldError message={emailHintError ?? undefined} />
          </div>

          <div>
            <label
              className="mb-1 block text-sm font-semibold text-navy"
              htmlFor={`passport-${index}`}
            >
              Passport Number <span className="text-error">*</span>
            </label>
            <input
              id={`passport-${index}`}
              autoComplete="off"
              spellCheck={false}
              maxLength={PASSPORT_NUMBER_MAX_LENGTH}
              className={`input-field h-12 w-full rounded-xl px-3 text-base ${
                errors.passengers?.[index]?.passportNumber ? "border-error" : ""
              }`}
              placeholder="e.g. A12345678"
              value={pax.passportNumber}
              onChange={(e) =>
                patchPax(index, {
                  passportNumber: normalizePassportNumber(e.target.value).slice(0, PASSPORT_NUMBER_MAX_LENGTH),
                })
              }
            />
            <FieldError message={errors.passengers?.[index]?.passportNumber?.message} />
          </div>

          <div>
            <label
              className="mb-1 block text-sm font-semibold text-navy"
              htmlFor={`expiry-${index}`}
            >
              Passport Expiry <span className="text-error">*</span>
            </label>
            <input
              id={`expiry-${index}`}
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              className={`input-field h-12 w-full rounded-xl px-3 text-base ${
                errors.passengers?.[index]?.passportExpiry ? "border-error" : ""
              }`}
              value={pax.passportExpiry}
              onChange={(e) => patchPax(index, { passportExpiry: e.target.value })}
            />
            <FieldError message={errors.passengers?.[index]?.passportExpiry?.message} />
          </div>

          <div>
            <label
              className="mb-1 block text-sm font-semibold text-navy"
              htmlFor={`postcode-${index}`}
            >
              Post Code
            </label>
            <input
              id={`postcode-${index}`}
              className="input-field h-12 w-full rounded-xl px-3 text-base"
              placeholder="Optional"
              value={pax.postCode}
              onChange={(e) => patchPax(index, { postCode: e.target.value })}
            />
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onBack}
            className="min-h-12 rounded-xl border border-border bg-bg px-5 text-sm font-semibold text-navy hover:bg-card"
          >
            {backLabel}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            aria-busy={submitting}
            className="btn-primary inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-8 text-sm font-semibold"
          >
            {submitting ? <ButtonSpinner /> : null}
            {submitLabel ?? (submitting ? "Reserving…" : "Reserve seats")}
          </button>
        </div>
      </div>

      {scanOpen ? (
        <PassportScanModal
          onClose={() => setScanOpen(false)}
          onComplete={(result) => {
            applyPassportScan(result);
            setScanOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}
