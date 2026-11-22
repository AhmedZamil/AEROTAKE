export type VoidRefundItem = {
  id: string;
  date: string;
  bookingId: string;
  passenger: string;
  partner: string;
  type: "Void" | "Refund";
  airline: string;
  pnr: string;
  amount: string;
  status: "Pending" | "Approved" | "Rejected" | "Completed" | "In Progress";
};

export const voidRefundPartners = [
  "Partner",
  "SkyLink Travel",
  "Horizon Holidays",
  "Gulf Connect BD",
  "Dhaka Air Desk",
  "Nomad Tours",
  "AeroNest Tours",
] as const;

export const voidRefundMock: VoidRefundItem[] = [
  {
    id: "1",
    date: "09 Jun 2026",
    bookingId: "ATK-92481",
    passenger: "Mr. Rahman",
    partner: "SkyLink Travel",
    type: "Refund",
    airline: "Biman Bangladesh",
    pnr: "AB3K9M",
    amount: "৳ 18,750",
    status: "Pending",
  },
  {
    id: "2",
    date: "09 Jun 2026",
    bookingId: "ATK-92470",
    passenger: "Mrs. Akter",
    partner: "Horizon Holidays",
    type: "Void",
    airline: "US-Bangla Airlines",
    pnr: "QW8PL2",
    amount: "৳ 36,200",
    status: "In Progress",
  },
  {
    id: "3",
    date: "08 Jun 2026",
    bookingId: "ATK-92455",
    passenger: "Mr. Hasan",
    partner: "Gulf Connect BD",
    type: "Refund",
    airline: "Emirates",
    pnr: "EK9M2A",
    amount: "৳ 22,400",
    status: "Approved",
  },
  {
    id: "4",
    date: "08 Jun 2026",
    bookingId: "ATK-92440",
    passenger: "Ms. Chowdhury",
    partner: "Dhaka Air Desk",
    type: "Void",
    airline: "Qatar Airways",
    pnr: "QR6T11",
    amount: "৳ 41,150",
    status: "Completed",
  },
  {
    id: "5",
    date: "07 Jun 2026",
    bookingId: "ATK-92422",
    passenger: "Mr. Karim",
    partner: "SkyLink Travel",
    type: "Refund",
    airline: "Saudia",
    pnr: "SV2H88",
    amount: "৳ 15,900",
    status: "Rejected",
  },
  {
    id: "6",
    date: "07 Jun 2026",
    bookingId: "ATK-92410",
    passenger: "Mrs. Islam",
    partner: "Nomad Tours",
    type: "Void",
    airline: "Air Arabia",
    pnr: "G9X441",
    amount: "৳ 29,750",
    status: "Pending",
  },
  {
    id: "7",
    date: "06 Jun 2026",
    bookingId: "ATK-92398",
    passenger: "Mr. Faruk",
    partner: "AeroNest Tours",
    type: "Refund",
    airline: "US-Bangla Airlines",
    pnr: "BS1K77",
    amount: "৳ 12,300",
    status: "Approved",
  },
  {
    id: "8",
    date: "06 Jun 2026",
    bookingId: "ATK-92381",
    passenger: "Ms. Sultana",
    partner: "Horizon Holidays",
    type: "Void",
    airline: "Biman Bangladesh",
    pnr: "BG5R03",
    amount: "৳ 22,600",
    status: "Completed",
  },
];
