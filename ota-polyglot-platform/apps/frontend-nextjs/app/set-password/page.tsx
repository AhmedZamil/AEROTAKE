import type { Metadata } from "next";
import { Suspense } from "react";
import AuthShell from "@/components/auth-shell";
import SetPasswordForm from "@/components/set-password-form";

export const metadata: Metadata = {
  title: "Set Password | AeroTake",
  description: "Set a new password for your AeroTake partner account.",
};

export default function SetPasswordPage() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <SetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
