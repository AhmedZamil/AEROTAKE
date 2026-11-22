export type ReportKind =
  | "sales"
  | "booking"
  | "ticket"
  | "refund"
  | "airline"
  | "agent";

export type ReportRow = {
  id: string;
  kind: ReportKind;
  title: string;
  period: string;
  periodStart: string;
  bookings: number;
  tickets: number;
  sales: number;
  refunds: number;
  growth: number;
  topAirline: string;
};

export const reportKindMeta: Record<ReportKind, { label: string; badge: string }> = {
  sales: { label: "Sales", badge: "bg-[#fff1f0] text-aerotake-coral" },
  booking: { label: "Booking", badge: "bg-[#eff6ff] text-[#2563eb]" },
  ticket: { label: "Ticket", badge: "bg-[#f3e8ff] text-[#7c3aed]" },
  refund: { label: "Refund", badge: "bg-[#fef2f2] text-[#dc2626]" },
  airline: { label: "Airline", badge: "bg-[#ecfdf3] text-[#16a34a]" },
  agent: { label: "Agent", badge: "bg-[#fff7ed] text-[#c2410c]" },
};

export const reportSummary = {
  bookings: 1284,
  tickets: 1096,
  sales: 4852750,
  refunds: 186400,
  bookingChange: 12.4,
  ticketChange: 9.8,
  salesChange: 18.6,
  refundChange: -4.2,
};

export const salesTrend = [
  { label: "01 Aug", value: 142000 },
  { label: "04 Aug", value: 168000 },
  { label: "07 Aug", value: 155000 },
  { label: "10 Aug", value: 198000 },
  { label: "13 Aug", value: 176000 },
  { label: "16 Aug", value: 214000 },
  { label: "19 Aug", value: 236000 },
  { label: "22 Aug", value: 248000 },
  { label: "24 Aug", value: 221000 },
];

export const airlinePerformance = [
  { code: "BG", name: "Biman Bangladesh", tickets: 286, sales: 1245000, share: 92 },
  { code: "BS", name: "US-Bangla Airlines", tickets: 241, sales: 986000, share: 78 },
  { code: "EK", name: "Emirates", tickets: 94, sales: 1180000, share: 61 },
  { code: "QR", name: "Qatar Airways", tickets: 78, sales: 842000, share: 48 },
  { code: "FZ", name: "flydubai", tickets: 66, sales: 392000, share: 36 },
  { code: "VQ", name: "Novoair", tickets: 58, sales: 207750, share: 28 },
];

export const dummyReports: ReportRow[] = [
  {
    id: "RPT-26082401",
    kind: "sales",
    title: "Daily Sales Summary",
    period: "24 Aug 2026",
    periodStart: "2026-08-24",
    bookings: 48,
    tickets: 41,
    sales: 221000,
    refunds: 8200,
    growth: 6.4,
    topAirline: "Biman Bangladesh",
  },
  {
    id: "RPT-26082308",
    kind: "booking",
    title: "Booking Status Report",
    period: "23 Aug 2026",
    periodStart: "2026-08-23",
    bookings: 56,
    tickets: 39,
    sales: 198400,
    refunds: 5400,
    growth: 3.1,
    topAirline: "US-Bangla Airlines",
  },
  {
    id: "RPT-26082212",
    kind: "ticket",
    title: "Ticket Issuance Report",
    period: "22 Aug 2026",
    periodStart: "2026-08-22",
    bookings: 62,
    tickets: 58,
    sales: 248000,
    refunds: 0,
    growth: 11.2,
    topAirline: "Emirates",
  },
  {
    id: "RPT-26082109",
    kind: "airline",
    title: "Airline Performance",
    period: "15–21 Aug 2026",
    periodStart: "2026-08-15",
    bookings: 318,
    tickets: 274,
    sales: 1124000,
    refunds: 42600,
    growth: 8.7,
    topAirline: "Qatar Airways",
  },
  {
    id: "RPT-26082007",
    kind: "refund",
    title: "Refund & Void Report",
    period: "20 Aug 2026",
    periodStart: "2026-08-20",
    bookings: 12,
    tickets: 9,
    sales: 0,
    refunds: 38400,
    growth: -2.4,
    topAirline: "flydubai",
  },
  {
    id: "RPT-26081905",
    kind: "agent",
    title: "Agency Productivity",
    period: "01–19 Aug 2026",
    periodStart: "2026-08-01",
    bookings: 940,
    tickets: 812,
    sales: 3648000,
    refunds: 126000,
    growth: 14.5,
    topAirline: "Biman Bangladesh",
  },
  {
    id: "RPT-26081804",
    kind: "sales",
    title: "Weekly Sales Snapshot",
    period: "11–18 Aug 2026",
    periodStart: "2026-08-11",
    bookings: 286,
    tickets: 241,
    sales: 986500,
    refunds: 27800,
    growth: 5.9,
    topAirline: "US-Bangla Airlines",
  },
  {
    id: "RPT-26081703",
    kind: "booking",
    title: "Hold vs Confirmed Bookings",
    period: "17 Aug 2026",
    periodStart: "2026-08-17",
    bookings: 44,
    tickets: 28,
    sales: 154200,
    refunds: 0,
    growth: 1.8,
    topAirline: "Novoair",
  },
];

export function formatMoney(amount: number) {
  return `BDT ${amount.toLocaleString()}.00`;
}

export function formatCount(value: number) {
  return value.toLocaleString();
}
