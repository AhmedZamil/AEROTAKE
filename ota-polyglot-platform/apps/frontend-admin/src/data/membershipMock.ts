export type MembershipItem = {
  id: string;
  code: string;
  name: string;
  partner: string;
  plan: "Basic" | "Standard" | "Premium" | "Enterprise";
  fee: string;
  duration: string;
  startDate: string;
  endDate: string;
  status: "Active" | "Expired" | "Pending";
};

export const membershipMock: MembershipItem[] = [
  {
    id: "1",
    code: "MEM-1001",
    name: "SkyLink Gold",
    partner: "SkyLink Travel",
    plan: "Premium",
    fee: "৳ 25,000",
    duration: "12 months",
    startDate: "01 Jan 2026",
    endDate: "31 Dec 2026",
    status: "Active",
  },
  {
    id: "2",
    code: "MEM-1008",
    name: "Horizon Standard",
    partner: "Horizon Holidays",
    plan: "Standard",
    fee: "৳ 12,000",
    duration: "12 months",
    startDate: "15 Feb 2026",
    endDate: "14 Feb 2027",
    status: "Active",
  },
  {
    id: "3",
    code: "MEM-1015",
    name: "Gulf Connect Pro",
    partner: "Gulf Connect BD",
    plan: "Enterprise",
    fee: "৳ 48,000",
    duration: "24 months",
    startDate: "10 Mar 2026",
    endDate: "09 Mar 2028",
    status: "Pending",
  },
  {
    id: "4",
    code: "MEM-1022",
    name: "Dhaka Air Basic",
    partner: "Dhaka Air Desk",
    plan: "Basic",
    fee: "৳ 6,500",
    duration: "6 months",
    startDate: "01 Aug 2025",
    endDate: "31 Jan 2026",
    status: "Expired",
  },
  {
    id: "5",
    code: "MEM-1030",
    name: "BlueWing Plus",
    partner: "BlueWing Agency",
    plan: "Premium",
    fee: "৳ 22,500",
    duration: "12 months",
    startDate: "20 Apr 2026",
    endDate: "19 Apr 2027",
    status: "Active",
  },
  {
    id: "6",
    code: "MEM-1038",
    name: "TravelPoint Silver",
    partner: "TravelPoint BD",
    plan: "Standard",
    fee: "৳ 10,000",
    duration: "12 months",
    startDate: "05 May 2026",
    endDate: "04 May 2027",
    status: "Active",
  },
];
