export type QuotationStatus = "pending" | "quoted" | "approved" | "rejected";

export type FareQuotation = {
  id: string;
  bookingId: string;
  pnr: string;
  airlineCode: string;
  airline: string;
  flightCode: string;
  fromCode: string;
  fromCity: string;
  toCode: string;
  toCity: string;
  currentDate: string;
  requestedDate: string;
  travelers: string;
  originalFare: number;
  quotedFare: number | null;
  changeFee: number | null;
  status: QuotationStatus;
  requestedAt: string;
  requestedDateIso: string;
  note: string;
};

export const quotationStatusMeta: Record<
  QuotationStatus,
  { label: string; badge: string; text: string }
> = {
  pending: {
    label: "Pending",
    badge: "bg-[#fff7ed] text-[#c2410c]",
    text: "text-[#c2410c]",
  },
  quoted: {
    label: "Quoted",
    badge: "bg-[#eff6ff] text-[#2563eb]",
    text: "text-[#2563eb]",
  },
  approved: {
    label: "Approved",
    badge: "bg-[#ecfdf3] text-[#16a34a]",
    text: "text-[#16a34a]",
  },
  rejected: {
    label: "Rejected",
    badge: "bg-[#fef2f2] text-[#dc2626]",
    text: "text-[#dc2626]",
  },
};

export const dummyFareQuotations: FareQuotation[] = [
  {
    id: "FCQ-26082401",
    bookingId: "ATKBD26080001",
    pnr: "ABCDEF",
    airlineCode: "BS",
    airline: "US-Bangla Airlines",
    flightCode: "BS 157",
    fromCode: "DAC",
    fromCity: "Dhaka",
    toCode: "CXB",
    toCity: "Cox's Bazar",
    currentDate: "22 Aug 2026",
    requestedDate: "25 Aug 2026",
    travelers: "1 Adult",
    originalFare: 8000,
    quotedFare: 9200,
    changeFee: 1200,
    status: "quoted",
    requestedAt: "24 Aug 2026, 09:20 AM",
    requestedDateIso: "2026-08-24",
    note: "Passenger wants to travel three days later.",
  },
  {
    id: "FCQ-26082308",
    bookingId: "ATKBD26080004",
    pnr: "PNR456",
    airlineCode: "BG",
    airline: "Biman Bangladesh Airlines",
    flightCode: "BG 433",
    fromCode: "DAC",
    fromCity: "Dhaka",
    toCode: "CXB",
    toCity: "Cox's Bazar",
    currentDate: "25 Aug 2026",
    requestedDate: "28 Aug 2026",
    travelers: "2 Adults",
    originalFare: 13000,
    quotedFare: null,
    changeFee: null,
    status: "pending",
    requestedAt: "23 Aug 2026, 04:15 PM",
    requestedDateIso: "2026-08-23",
    note: "Date change request for family trip.",
  },
  {
    id: "FCQ-26082212",
    bookingId: "ATKBD26080007",
    pnr: "PNR789",
    airlineCode: "FZ",
    airline: "flydubai",
    flightCode: "FZ 584",
    fromCode: "DAC",
    fromCity: "Dhaka",
    toCode: "DXB",
    toCity: "Dubai",
    currentDate: "30 Aug 2026",
    requestedDate: "02 Sep 2026",
    travelers: "1 Adult",
    originalFare: 28500,
    quotedFare: 31200,
    changeFee: 2700,
    status: "approved",
    requestedAt: "22 Aug 2026, 11:40 AM",
    requestedDateIso: "2026-08-22",
    note: "Confirmed new departure after client approval.",
  },
  {
    id: "FCQ-26082104",
    bookingId: "ATKBD26080010",
    pnr: "PNR321",
    airlineCode: "QR",
    airline: "Qatar Airways",
    flightCode: "QR 639",
    fromCode: "DAC",
    fromCity: "Dhaka",
    toCode: "DOH",
    toCity: "Doha",
    currentDate: "02 Sep 2026",
    requestedDate: "05 Sep 2026",
    travelers: "1 Adult",
    originalFare: 42000,
    quotedFare: 46800,
    changeFee: 4800,
    status: "rejected",
    requestedAt: "21 Aug 2026, 06:05 PM",
    requestedDateIso: "2026-08-21",
    note: "Client declined due to higher fare difference.",
  },
  {
    id: "FCQ-26082009",
    bookingId: "ATKBD26080006",
    pnr: "ASDF34",
    airlineCode: "EK",
    airline: "Emirates",
    flightCode: "EK 585",
    fromCode: "DAC",
    fromCity: "Dhaka",
    toCode: "DXB",
    toCity: "Dubai",
    currentDate: "26 Aug 2026",
    requestedDate: "29 Aug 2026",
    travelers: "2 Adults",
    originalFare: 56000,
    quotedFare: null,
    changeFee: null,
    status: "pending",
    requestedAt: "20 Aug 2026, 03:22 PM",
    requestedDateIso: "2026-08-20",
    note: "Awaiting airline inventory confirmation.",
  },
  {
    id: "FCQ-26081907",
    bookingId: "ATKBD26080003",
    pnr: "QWER12",
    airlineCode: "BS",
    airline: "US-Bangla Airlines",
    flightCode: "BS 341",
    fromCode: "DAC",
    fromCity: "Dhaka",
    toCode: "CXB",
    toCity: "Cox's Bazar",
    currentDate: "23 Aug 2026",
    requestedDate: "24 Aug 2026",
    travelers: "1 Adult",
    originalFare: 7200,
    quotedFare: 7800,
    changeFee: 600,
    status: "quoted",
    requestedAt: "19 Aug 2026, 01:10 PM",
    requestedDateIso: "2026-08-19",
    note: "Same-day advance request.",
  },
  {
    id: "FCQ-26081803",
    bookingId: "ATKBD26080002",
    pnr: "KLMN88",
    airlineCode: "BG",
    airline: "Biman Bangladesh Airlines",
    flightCode: "BG 611",
    fromCode: "DAC",
    fromCity: "Dhaka",
    toCode: "CGP",
    toCity: "Chattogram",
    currentDate: "22 Aug 2026",
    requestedDate: "27 Aug 2026",
    travelers: "1 Adult",
    originalFare: 6500,
    quotedFare: 7100,
    changeFee: 600,
    status: "approved",
    requestedAt: "18 Aug 2026, 10:45 AM",
    requestedDateIso: "2026-08-18",
    note: "Approved and ready for reissue.",
  },
  {
    id: "FCQ-26081711",
    bookingId: "ATKBD26080005",
    pnr: "TYUI90",
    airlineCode: "VQ",
    airline: "Novoair",
    flightCode: "VQ 961",
    fromCode: "DAC",
    fromCity: "Dhaka",
    toCode: "CXB",
    toCity: "Cox's Bazar",
    currentDate: "25 Aug 2026",
    requestedDate: "30 Aug 2026",
    travelers: "1 Adult",
    originalFare: 6900,
    quotedFare: 7600,
    changeFee: 700,
    status: "rejected",
    requestedAt: "17 Aug 2026, 05:30 PM",
    requestedDateIso: "2026-08-17",
    note: "Rejected — preferred flight sold out.",
  },
];

export function fareDifference(quotation: FareQuotation) {
  if (quotation.quotedFare == null) {
    return null;
  }
  return quotation.quotedFare - quotation.originalFare;
}

export function formatFare(amount: number) {
  return `BDT ${amount.toLocaleString()}.00`;
}
