import type { Metadata } from "next";
import { Suspense } from "react";
import AuthShell from "@/components/auth-shell";
import VerifyForm from "@/components/verify-form";

export const metadata: Metadata = {
  title: "Verify Code | AeroTake",
  description: "Enter the authentication code sent to your email.",
};

export default function VerifyPage() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <VerifyForm />
      </Suspense>
    </AuthShell>
  );
}
