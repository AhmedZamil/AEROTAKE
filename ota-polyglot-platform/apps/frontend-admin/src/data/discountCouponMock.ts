export type DiscountCouponItem = {
  id: string;
  code: string;
  name: string;
  partner: string;
  type: "Percentage" | "Fixed";
  value: string;
  usageLimit: number;
  used: number;
  validFrom: string;
  validTo: string;
  status: "Active" | "Expired" | "Inactive";
};

export const discountCouponMock: DiscountCouponItem[] = [
  {
    id: "1",
    code: "SKY10",
    name: "SkyLink Launch Offer",
    partner: "SkyLink Travel",
    type: "Percentage",
    value: "10%",
    usageLimit: 100,
    used: 42,
    validFrom: "01 Jan 2026",
    validTo: "31 Dec 2026",
    status: "Active",
  },
  {
    id: "2",
    code: "HORIZON500",
    name: "Horizon Flat Discount",
    partner: "Horizon Holidays",
    type: "Fixed",
    value: "৳ 500",
    usageLimit: 50,
    used: 18,
    validFrom: "15 Feb 2026",
    validTo: "15 Aug 2026",
    status: "Active",
  },
  {
    id: "3",
    code: "GULF15",
    name: "Gulf Connect Promo",
    partner: "Gulf Connect BD",
    type: "Percentage",
    value: "15%",
    usageLimit: 200,
    used: 0,
    validFrom: "01 Mar 2026",
    validTo: "30 Jun 2026",
    status: "Inactive",
  },
  {
    id: "4",
    code: "DHAKA200",
    name: "Dhaka Air Desk Deal",
    partner: "Dhaka Air Desk",
    type: "Fixed",
    value: "৳ 200",
    usageLimit: 80,
    used: 80,
    validFrom: "01 Jul 2025",
    validTo: "31 Dec 2025",
    status: "Expired",
  },
  {
    id: "5",
    code: "BLUEWING20",
    name: "BlueWing Peak Season",
    partner: "BlueWing Agency",
    type: "Percentage",
    value: "20%",
    usageLimit: 120,
    used: 35,
    validFrom: "10 Apr 2026",
    validTo: "10 Oct 2026",
    status: "Active",
  },
  {
    id: "6",
    code: "TRAVELPOINT8",
    name: "TravelPoint Partner Coupon",
    partner: "TravelPoint BD",
    type: "Percentage",
    value: "8%",
    usageLimit: 60,
    used: 12,
    validFrom: "20 May 2026",
    validTo: "20 Nov 2026",
    status: "Active",
  },
];
