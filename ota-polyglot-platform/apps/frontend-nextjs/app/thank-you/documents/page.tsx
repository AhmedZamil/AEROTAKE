import type { Metadata } from "next";
import AuthShell from "@/components/auth-shell";
import ThankYouDocumentsForm from "@/components/thank-you-documents-form";

export const metadata: Metadata = {
  title: "Documents Submitted | AeroTake",
  description: "Your documents have been submitted for verification.",
};

export default function ThankYouDocumentsPage() {
  return (
    <AuthShell>
      <ThankYouDocumentsForm />
    </AuthShell>
  );
}
