import type { Metadata } from "next";
import AuthShell from "@/components/auth-shell";
import WelcomeForm from "@/components/welcome-form";

export const metadata: Metadata = {
  title: "Welcome | AeroTake",
  description: "Your AeroTake partner account has been created.",
};

export default function WelcomePage() {
  return (
    <AuthShell>
      <WelcomeForm />
    </AuthShell>
  );
}
