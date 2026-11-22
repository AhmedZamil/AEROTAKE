import type { Metadata } from "next";
import AuthShell from "@/components/auth-shell";
import ForgotPasswordPhoneForm from "@/components/forgot-password-phone-form";

export const metadata: Metadata = {
  title: "Forgot Password | AeroTake",
  description: "Recover your AeroTake partner account password with your phone number.",
};

export default function ForgotPasswordPhonePage() {
  return (
    <AuthShell>
      <ForgotPasswordPhoneForm />
    </AuthShell>
  );
}
