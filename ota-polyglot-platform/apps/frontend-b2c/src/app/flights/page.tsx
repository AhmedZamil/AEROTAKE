import type { Metadata } from "next";
import { Suspense } from "react";
import FlightsResultsClient from "@/components/flights/FlightsResultsClient";

export const metadata: Metadata = {
  title: "Flight results",
  description: "Compare flight options and fares.",
};

export default function FlightsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[1320px] px-4 py-10 text-sm text-slate">Loading flights…</div>
      }
    >
      <FlightsResultsClient />
    </Suspense>
  );
}
