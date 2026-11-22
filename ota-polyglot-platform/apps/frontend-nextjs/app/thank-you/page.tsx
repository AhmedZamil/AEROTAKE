import type { Metadata } from "next";
import AuthShell from "@/components/auth-shell";
import ThankYouForm from "@/components/thank-you-form";

export const metadata: Metadata = {
  title: "Thank You | AeroTake",
  description: "Your AeroTake partner registration has been submitted.",
};

export default function ThankYouPage() {
  return (
    <AuthShell>
      <ThankYouForm />
    </AuthShell>
  );
}
