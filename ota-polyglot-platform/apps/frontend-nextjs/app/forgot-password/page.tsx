import type { Metadata } from "next";
import AuthShell from "@/components/auth-shell";
import ForgotPasswordForm from "@/components/forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot Password | AeroTake",
  description: "Recover your AeroTake partner account password.",
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
