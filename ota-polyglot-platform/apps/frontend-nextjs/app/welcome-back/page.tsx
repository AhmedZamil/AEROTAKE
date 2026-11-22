import type { Metadata } from "next";
import AuthShell from "@/components/auth-shell";
import WelcomeBackForm from "@/components/welcome-back-form";

export const metadata: Metadata = {
  title: "Welcome Back | AeroTake",
  description: "Continue your AeroTake partner sign up.",
};

export default function WelcomeBackPage() {
  return (
    <AuthShell>
      <WelcomeBackForm />
    </AuthShell>
  );
}
