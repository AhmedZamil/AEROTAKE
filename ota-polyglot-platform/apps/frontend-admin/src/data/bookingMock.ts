export type BookingItem = {
  id: string;
  bookingId: string;
  trackingId: string;
  pnr: string;
  airlinesPnr: string;
  passenger: string;
  route: string;
  airline: string;
  partner: string;
  amount: string;
  status: "Confirmed" | "Pending" | "Hold" | "Cancelled" | "Ticketed";
  bookedAt: string;
};

export const bookingTabs = [
  "ALL",
  "Confirmed",
  "Pending",
  "Hold",
  "Ticketed",
  "Cancelled",
] as const;

export const bookingMock: BookingItem[] = [
  {
    id: "1",
    bookingId: "ATK-92481",
    trackingId: "TRK-88102",
    pnr: "AB3K9M",
    airlinesPnr: "BG7X21",
    passenger: "Mr. Rahman",
    route: "DAC → DXB",
    airline: "Biman Bangladesh",
    partner: "SkyLink Travel",
    amount: "৳ 48,500",
    status: "Confirmed",
    bookedAt: "09 Jun 2026, 10:24 AM",
  },
  {
    id: "2",
    bookingId: "ATK-92470",
    trackingId: "TRK-88091",
    pnr: "QW8PL2",
    airlinesPnr: "BS4N18",
    passenger: "Mrs. Akter",
    route: "DAC → KUL",
    airline: "US-Bangla Airlines",
    partner: "Horizon Holidays",
    amount: "৳ 36,200",
    status: "Pending",
    bookedAt: "09 Jun 2026, 09:12 AM",
  },
  {
    id: "3",
    bookingId: "ATK-92455",
    trackingId: "TRK-88074",
    pnr: "EK9M2A",
    airlinesPnr: "EK584A",
    passenger: "Mr. Hasan",
    route: "DAC → DXB",
    airline: "Emirates",
    partner: "Gulf Connect BD",
    amount: "৳ 52,800",
    status: "Ticketed",
    bookedAt: "08 Jun 2026, 06:45 PM",
  },
  {
    id: "4",
    bookingId: "ATK-92440",
    trackingId: "TRK-88051",
    pnr: "QR6T11",
    airlinesPnr: "QR639B",
    passenger: "Ms. Chowdhury",
    route: "DAC → DOH",
    airline: "Qatar Airways",
    partner: "Dhaka Air Desk",
    amount: "৳ 41,150",
    status: "Hold",
    bookedAt: "08 Jun 2026, 03:20 PM",
  },
  {
    id: "5",
    bookingId: "ATK-92422",
    trackingId: "TRK-88033",
    pnr: "SV2H88",
    airlinesPnr: "SV808C",
    passenger: "Mr. Karim",
    route: "DAC → JED",
    airline: "Saudia",
    partner: "SkyLink Travel",
    amount: "৳ 67,400",
    status: "Confirmed",
    bookedAt: "08 Jun 2026, 11:05 AM",
  },
  {
    id: "6",
    bookingId: "ATK-92410",
    trackingId: "TRK-88018",
    pnr: "G9X441",
    airlinesPnr: "G9441D",
    passenger: "Mrs. Islam",
    route: "DAC → SHJ",
    airline: "Air Arabia",
    partner: "Nomad Tours",
    amount: "৳ 29,750",
    status: "Cancelled",
    bookedAt: "07 Jun 2026, 08:40 PM",
  },
  {
    id: "7",
    bookingId: "ATK-92398",
    trackingId: "TRK-87990",
    pnr: "BS1K77",
    airlinesPnr: "BS221E",
    passenger: "Mr. Faruk",
    route: "DAC → SIN",
    airline: "US-Bangla Airlines",
    partner: "AeroNest Tours",
    amount: "৳ 33,900",
    status: "Ticketed",
    bookedAt: "07 Jun 2026, 02:15 PM",
  },
  {
    id: "8",
    bookingId: "ATK-92381",
    trackingId: "TRK-87955",
    pnr: "BG5R03",
    airlinesPnr: "BG147F",
    passenger: "Ms. Sultana",
    route: "DAC → CMB",
    airline: "Biman Bangladesh",
    partner: "Horizon Holidays",
    amount: "৳ 22,600",
    status: "Pending",
    bookedAt: "07 Jun 2026, 10:50 AM",
  },
];
