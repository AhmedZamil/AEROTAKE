import { notFound } from "next/navigation";
import PriceCheckWorkspace from "@/components/dashboard/price-check-workspace";
import { isPriceCheckEnabled } from "@/lib/price-check";

export default function PriceCheckPage() {
  if (!isPriceCheckEnabled()) notFound();
  return <PriceCheckWorkspace />;
}
