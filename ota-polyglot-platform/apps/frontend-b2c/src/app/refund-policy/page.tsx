import { LegalPage, legalMetadata } from "@/components/LegalPage";

export const metadata = legalMetadata("Refund Policy", "Aerotake refund policy.");

export default function RefundPolicyPage() {
  return (
    <LegalPage title="Refund Policy" description="Not yet published.">
      <p>This policy has not been published yet. It is being finalised and will be available here before online payment opens.</p>
      <p>Until then, questions about how your booking or personal data is handled can be sent to us through the Contact page.</p>
    </LegalPage>
  );
}
