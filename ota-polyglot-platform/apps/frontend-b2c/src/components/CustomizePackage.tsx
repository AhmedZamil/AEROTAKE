import Image from "next/image";
import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";

const steps = [
  { num: "01", label: "Choose a Destination." },
  { num: "02", label: "Select Your Traveling Date." },
  { num: "03", label: "Traveler Information & Submit info." },
];

const mobileSteps = [
  { num: "01", label: "Choose a destination" },
  { num: "02", label: "Select your travel dates" },
  { num: "03", label: "Add traveller details and submit" },
];

const avatars = [
  "/images/avatars/avatar-1.jpg",
  "/images/avatars/avatar-2.jpg",
  "/images/avatars/avatar-3.jpg",
  "/images/avatars/avatar-4.jpg",
];

function PinIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5C3.5 9.5 8 14.5 8 14.5s4.5-5 4.5-8.5A4.5 4.5 0 0 0 8 1.5Zm0 6.2A1.7 1.7 0 1 1 8 4.3a1.7 1.7 0 0 1 0 3.4Z" />
    </svg>
  );
}

export default function CustomizePackage() {
  return (
    <section className="bg-card px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-4 md:hidden">
        <div className="rounded-[20px] border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-[22px] font-bold tracking-tight text-navy">
            Need a custom package?
          </h2>

          <button
            type="button"
            className="mb-5 flex w-full items-center gap-3 rounded-full border border-border bg-card px-4 py-3 text-left text-[15px] font-medium text-slate"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-primary-strong">
              <PinIcon />
            </span>
            Select destination
          </button>

          <ol className="flex flex-col gap-3.5">
            {mobileSteps.map((step) => (
              <li key={step.num} className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy text-[12px] font-semibold text-white">
                  {step.num}
                </span>
                <p className="text-[15px] font-medium leading-snug text-navy">{step.label}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-[20px] border border-border bg-card px-5 py-8 text-center shadow-sm">
          <div className="mb-4 flex items-center justify-center">
            {avatars.map((src, index) => (
              <span
                key={src}
                className="relative h-11 w-11 overflow-hidden rounded-full border-[2.5px] border-white bg-border"
                style={{ marginLeft: index === 0 ? 0 : -10, zIndex: 4 - index }}
              >
                <Image src={src} alt="" fill sizes="44px" className="object-cover" />
              </span>
            ))}
          </div>

          <h3 className="mb-2 text-xl font-bold text-navy">Facing any trouble?</h3>
          <p className="mb-6 text-sm leading-relaxed text-slate">
            Our team of 20+ experienced travel experts is available 24/7 to assist you.
          </p>
          <Link
            href="/contact"
            className="btn-primary inline-flex min-h-11 items-center rounded-full px-7 py-3 text-sm"
          >
            Contact us
          </Link>
        </div>
      </div>

      <Reveal
        className="mx-auto hidden max-w-[1320px] overflow-hidden rounded-[20px] bg-card ring-1 ring-border md:block"
        style={{ boxShadow: "var(--shadow-soft)" }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr]">
          <div className="px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
            <h2 className="mb-5 text-2xl font-bold tracking-tight text-navy sm:text-3xl lg:text-[34px]">
              Need a Customize Package?
            </h2>

            <button
              type="button"
              className="mb-4 flex w-full max-w-xl items-center gap-3 rounded-xl bg-bg px-4 py-3.5 text-left text-[15px] font-medium text-slate transition hover:bg-border/80"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path
                    d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              Select Destination
            </button>

            <p className="mb-6 text-[15px] font-medium text-slate">
              Create your custom travel journey in just 03 steps.
            </p>

            <ol className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
              {steps.map((step, index) => (
                <li key={step.num} className="relative flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
                    {step.num}
                  </span>
                  <p className="pt-2 text-sm font-medium leading-snug text-navy sm:text-[15px]">
                    {step.label}
                  </p>
                  {index < steps.length - 1 ? (
                    <span
                      className="pointer-events-none absolute -right-3 top-3 hidden text-border sm:block"
                      aria-hidden="true"
                    >
                      »
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>

          <div
            className="flex flex-col items-center justify-center px-6 py-10 text-center sm:px-8 lg:py-12"
            style={{
              backgroundColor: "var(--color-bg)",
              backgroundImage:
                "repeating-linear-gradient(-45deg, transparent, transparent 8px, var(--pattern-stripe) 8px, var(--pattern-stripe) 9px)",
            }}
          >
            <div className="mb-4 flex items-center">
              {avatars.map((src, index) => (
                <span
                  key={src}
                  className="relative h-11 w-11 overflow-hidden rounded-full border-[2.5px] border-white bg-border"
                  style={{ marginLeft: index === 0 ? 0 : -10, zIndex: 4 - index }}
                >
                  <Image src={src} alt="" fill sizes="44px" className="object-cover" />
                </span>
              ))}
            </div>

            <h3 className="mb-2 text-xl font-bold text-navy sm:text-2xl">
              Face any trouble?
            </h3>
            <p className="mb-6 max-w-[260px] text-sm leading-relaxed text-slate">
              Our team of 20+ experienced travel experts is available 24/7 to
              assist you.
            </p>
            <Link
              href="/contact"
              className="btn-primary inline-flex min-h-11 items-center rounded-full px-7 py-3 text-sm"
            >
              Contact Us
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
