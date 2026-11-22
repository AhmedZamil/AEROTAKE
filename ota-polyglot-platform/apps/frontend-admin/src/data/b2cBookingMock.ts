export type B2CBookingItem = {
  id: string;
  bookingId: string;
  trackingId: string;
  pnr: string;
  airlinesPnr: string;
  customer: string;
  route: string;
  airline: string;
  amount: string;
  status: "Queued" | "Processing" | "Ticketed" | "Failed" | "Hold";
  bookingDate: string;
};

export const b2cBookingMock: B2CBookingItem[] = [
  {
    id: "1",
    bookingId: "B2C-11024",
    trackingId: "Q-55021",
    pnr: "H7K2NM",
    airlinesPnr: "BG221A",
    customer: "Rafi Ahmed",
    route: "DAC → DXB",
    airline: "Biman Bangladesh",
    amount: "৳ 45,200",
    status: "Queued",
    bookingDate: "09 Jun 2026",
  },
  {
    id: "2",
    bookingId: "B2C-11018",
    trackingId: "Q-55014",
    pnr: "PL9X21",
    airlinesPnr: "BS447B",
    customer: "Nusrat Jahan",
    route: "DAC → KUL",
    airline: "US-Bangla Airlines",
    amount: "৳ 31,800",
    status: "Processing",
    bookingDate: "09 Jun 2026",
  },
  {
    id: "3",
    bookingId: "B2C-11005",
    trackingId: "Q-54988",
    pnr: "EK4M77",
    airlinesPnr: "EK584C",
    customer: "Tanvir Hasan",
    route: "DAC → DXB",
    airline: "Emirates",
    amount: "৳ 58,900",
    status: "Ticketed",
    bookingDate: "08 Jun 2026",
  },
  {
    id: "4",
    bookingId: "B2C-10992",
    trackingId: "Q-54960",
    pnr: "QR8T33",
    airlinesPnr: "QR639D",
    customer: "Sadia Islam",
    route: "DAC → DOH",
    airline: "Qatar Airways",
    amount: "৳ 42,150",
    status: "Hold",
    bookingDate: "08 Jun 2026",
  },
  {
    id: "5",
    bookingId: "B2C-10981",
    trackingId: "Q-54941",
    pnr: "SV1H55",
    airlinesPnr: "SV808E",
    customer: "Imran Kabir",
    route: "DAC → JED",
    airline: "Saudia",
    amount: "৳ 64,300",
    status: "Failed",
    bookingDate: "08 Jun 2026",
  },
  {
    id: "6",
    bookingId: "B2C-10970",
    trackingId: "Q-54922",
    pnr: "G9A118",
    airlinesPnr: "G9118F",
    customer: "Farzana Akter",
    route: "DAC → SHJ",
    airline: "Air Arabia",
    amount: "৳ 27,450",
    status: "Queued",
    bookingDate: "07 Jun 2026",
  },
  {
    id: "7",
    bookingId: "B2C-10955",
    trackingId: "Q-54890",
    pnr: "BS3K64",
    airlinesPnr: "BS221G",
    customer: "Mehedi Hasan",
    route: "DAC → SIN",
    airline: "US-Bangla Airlines",
    amount: "৳ 34,700",
    status: "Ticketed",
    bookingDate: "07 Jun 2026",
  },
  {
    id: "8",
    bookingId: "B2C-10940",
    trackingId: "Q-54861",
    pnr: "BG6R09",
    airlinesPnr: "BG147H",
    customer: "Lamia Chowdhury",
    route: "DAC → CMB",
    airline: "Biman Bangladesh",
    amount: "৳ 23,900",
    status: "Processing",
    bookingDate: "07 Jun 2026",
  },
];
