export type SupplierBookingItem = {
  id: string;
  bookingId: string;
  supplier: string;
  pnr: string;
  route: string;
  airline: string;
  passenger: string;
  amount: string;
  status: "Confirmed" | "Pending" | "Ticketed" | "Failed" | "Hold";
  bookedAt: string;
};

export const suppliers = [
  "All Suppliers",
  "Amadeus GDS",
  "Sabre",
  "Galileo",
  "Direct Airline API",
  "Hotelbeds",
] as const;

export const supplierBookingMock: SupplierBookingItem[] = [
  {
    id: "1",
    bookingId: "SUP-78421",
    supplier: "Amadeus GDS",
    pnr: "AM3K91",
    route: "DAC → DXB",
    airline: "Emirates",
    passenger: "Mr. Rahman",
    amount: "৳ 52,800",
    status: "Ticketed",
    bookedAt: "09 Jun 2026",
  },
  {
    id: "2",
    bookingId: "SUP-78410",
    supplier: "Sabre",
    pnr: "SB8PL2",
    route: "DAC → KUL",
    airline: "US-Bangla Airlines",
    passenger: "Mrs. Akter",
    amount: "৳ 36,200",
    status: "Confirmed",
    bookedAt: "09 Jun 2026",
  },
  {
    id: "3",
    bookingId: "SUP-78395",
    supplier: "Galileo",
    pnr: "GL9M2A",
    route: "DAC → DOH",
    airline: "Qatar Airways",
    passenger: "Ms. Chowdhury",
    amount: "৳ 41,150",
    status: "Hold",
    bookedAt: "08 Jun 2026",
  },
  {
    id: "4",
    bookingId: "SUP-78380",
    supplier: "Direct Airline API",
    pnr: "BG7X21",
    route: "DAC → DXB",
    airline: "Biman Bangladesh",
    passenger: "Mr. Hasan",
    amount: "৳ 48,500",
    status: "Pending",
    bookedAt: "08 Jun 2026",
  },
  {
    id: "5",
    bookingId: "SUP-78366",
    supplier: "Amadeus GDS",
    pnr: "SV2H88",
    route: "DAC → JED",
    airline: "Saudia",
    passenger: "Mr. Karim",
    amount: "৳ 67,400",
    status: "Ticketed",
    bookedAt: "08 Jun 2026",
  },
  {
    id: "6",
    bookingId: "SUP-78350",
    supplier: "Hotelbeds",
    pnr: "HB441D",
    route: "Dubai · 3N",
    airline: "City Stay DXB",
    passenger: "Mrs. Islam",
    amount: "৳ 28,900",
    status: "Confirmed",
    bookedAt: "07 Jun 2026",
  },
  {
    id: "7",
    bookingId: "SUP-78341",
    supplier: "Sabre",
    pnr: "G9X441",
    route: "DAC → SHJ",
    airline: "Air Arabia",
    passenger: "Ms. Sultana",
    amount: "৳ 29,750",
    status: "Failed",
    bookedAt: "07 Jun 2026",
  },
  {
    id: "8",
    bookingId: "SUP-78328",
    supplier: "Galileo",
    pnr: "BS1K77",
    route: "DAC → SIN",
    airline: "US-Bangla Airlines",
    passenger: "Mr. Faruk",
    amount: "৳ 33,900",
    status: "Confirmed",
    bookedAt: "07 Jun 2026",
  },
];
