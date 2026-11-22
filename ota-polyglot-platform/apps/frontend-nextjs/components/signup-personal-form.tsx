"use client";

import AuthBackLink from "@/components/auth-back-link";
import {
  SignupFloatingField,
  SignupSelectField,
  signupFieldClass,
} from "@/components/signup-form-fields";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SignupPersonalForm() {
  const router = useRouter();

  return (
    <form
      className="w-full"
      onSubmit={(event) => {
        event.preventDefault();
        router.push("/signup/agency");
      }}
    >
      <AuthBackLink href="/" label="Back to login" />

      <h1 className="mt-8 text-[32px] font-bold leading-tight tracking-tight text-aerotake-navy">
        Sign up
      </h1>
      <p className="mt-1 text-[15px] leading-6 text-aerotake-muted">Personal Details</p>

      <div className="mt-8 space-y-4">
        <SignupSelectField
          id="title"
          label="Select Title"
          placeholder="Select title"
          defaultValue="Mr."
          options={["Mr.", "Mrs.", "Ms.", "Dr."]}
        />

        <div className="grid grid-cols-2 gap-4">
          <SignupFloatingField id="firstName" label="First Name" required>
            <input
              id="firstName"
              name="firstName"
              type="text"
              autoComplete="given-name"
              required
              placeholder="First name"
              className={signupFieldClass}
            />
          </SignupFloatingField>
          <SignupFloatingField id="lastName" label="Last Name" required>
            <input
              id="lastName"
              name="lastName"
              type="text"
              autoComplete="family-name"
              required
              placeholder="Last name"
              className={signupFieldClass}
            />
          </SignupFloatingField>
        </div>

        <SignupFloatingField id="email" label="Email" required>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue="john.doe@gmail.com"
            className={signupFieldClass}
          />
        </SignupFloatingField>

        <div className="grid grid-cols-2 gap-4">
          <SignupFloatingField id="phone" label="Phone Number" required>
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              required
              placeholder="XXXXXXXXXXX"
              className={signupFieldClass}
            />
          </SignupFloatingField>
          <SignupFloatingField id="whatsapp" label="WhatsApp" required>
            <input
              id="whatsapp"
              name="whatsapp"
              type="tel"
              required
              placeholder="XXXXXXXXXXX"
              className={signupFieldClass}
            />
          </SignupFloatingField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <SignupFloatingField id="nid" label="NID" required>
            <input
              id="nid"
              name="nid"
              type="text"
              required
              placeholder="XXXXXXXXXXXX"
              className={signupFieldClass}
            />
          </SignupFloatingField>
          <SignupFloatingField id="passportNumber" label="Passport Number" required>
            <input
              id="passportNumber"
              name="passportNumber"
              type="text"
              required
              placeholder="XXXXXXXXXXXXXXXXXXXX"
              className={signupFieldClass}
            />
          </SignupFloatingField>
        </div>
      </div>

      <button
        type="submit"
        className="mt-8 h-12 w-full rounded-lg bg-aerotake-coral text-[15px] font-semibold text-white transition-colors hover:bg-aerotake-coral-dark"
      >
        Continue
      </button>

      <p className="mt-5 text-center text-sm text-aerotake-muted">
        Already have an account?{" "}
        <Link href="/" className="font-semibold text-aerotake-coral hover:underline">
          Login
        </Link>
      </p>
    </form>
  );
}
