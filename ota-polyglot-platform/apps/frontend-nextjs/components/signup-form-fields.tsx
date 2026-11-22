import type { ReactNode } from "react";

export const signupFieldClass =
  "h-14 w-full appearance-none rounded-lg border border-aerotake-border bg-aerotake-white px-4 text-sm text-aerotake-navy outline-none focus:border-aerotake-coral focus:ring-2 focus:ring-aerotake-coral/20";

export function SignupFloatingField({
  id,
  label,
  required = false,
  children,
  className = "",
}: {
  id: string;
  label: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <label
        htmlFor={id}
        className="absolute -top-2.5 left-3 z-10 bg-aerotake-white px-1.5 text-sm text-aerotake-muted"
      >
        {label}
        {required ? <span className="text-aerotake-coral"> *</span> : null}
      </label>
      {children}
    </div>
  );
}

export function SignupSelectField({
  id,
  label,
  placeholder,
  options,
  required = true,
  defaultValue = "",
}: {
  id: string;
  label: string;
  placeholder: string;
  options: string[];
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <SignupFloatingField id={id} label={label} required={required}>
      <div className="relative">
        <select
          id={id}
          name={id}
          required={required}
          defaultValue={defaultValue}
          className={`${signupFieldClass} pr-10 text-aerotake-muted`}
        >
          {defaultValue ? null : (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option} value={option} className="text-aerotake-navy">
              {option}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-aerotake-muted/70">
          <ChevronDownIcon />
        </span>
      </div>
    </SignupFloatingField>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
      <path
        d="M5 7.5 10 12.5 15 7.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
