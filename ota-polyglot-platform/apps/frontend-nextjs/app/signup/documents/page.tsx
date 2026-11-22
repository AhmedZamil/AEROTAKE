import type { Metadata } from "next";
import AuthShell from "@/components/auth-shell";
import SignupDocumentsForm from "@/components/signup-documents-form";

export const metadata: Metadata = {
  title: "Document Upload | AeroTake",
  description: "Upload KYC and signed agreement documents for AeroTake signup.",
};

export default function SignupDocumentsPage() {
  return (
    <AuthShell>
      <SignupDocumentsForm />
    </AuthShell>
  );
}
