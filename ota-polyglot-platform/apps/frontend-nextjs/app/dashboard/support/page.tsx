import type { Metadata } from "next";
import { Suspense } from "react";
import SupportDesk from "@/components/dashboard/support-desk";

export const metadata: Metadata = {
  title: "Support | AeroTake",
  description: "Create and manage support tickets for your AeroTake bookings.",
};

export default function SupportPage() {
  return (
    <Suspense fallback={null}>
      <SupportDesk />
    </Suspense>
  );
}
