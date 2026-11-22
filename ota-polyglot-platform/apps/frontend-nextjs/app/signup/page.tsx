import type { Metadata } from "next";
import AuthShell from "@/components/auth-shell";
import SignupPersonalForm from "@/components/signup-personal-form";

export const metadata: Metadata = {
  title: "Sign Up | AeroTake",
  description: "Create your AeroTake partner account — personal details.",
};

export default function SignupPage() {
  return (
    <AuthShell>
      <SignupPersonalForm />
    </AuthShell>
  );
}
