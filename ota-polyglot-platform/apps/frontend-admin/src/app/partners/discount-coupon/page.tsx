"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import PartnerDiscountCouponContent from "@/components/partners/PartnerDiscountCouponContent";

export default function PartnerDiscountCouponPage() {
  return (
    <DashboardShell breadcrumb="Partners > Discount Coupon">
      <PartnerDiscountCouponContent />
    </DashboardShell>
  );
}
