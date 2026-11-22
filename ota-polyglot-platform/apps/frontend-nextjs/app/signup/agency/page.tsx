import type { Metadata } from "next";
import AuthShell from "@/components/auth-shell";
import SignupAgencyForm from "@/components/signup-agency-form";

export const metadata: Metadata = {
  title: "Agency Details | AeroTake",
  description: "Complete your AeroTake partner sign up with agency details.",
};

export default function SignupAgencyPage() {
  return (
    <AuthShell>
      <SignupAgencyForm />
    </AuthShell>
  );
}
