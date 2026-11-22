export type TicketAlertKind = "today" | "days-3" | "days-7" | "issued";
export type TicketDateField = "booking" | "issue" | "expiry" | "flight";

export type TicketAlert = {
  id: string;
  kind: TicketAlertKind;
  pnr: string;
  airlineCode: string;
  airline: string;
  fromCode: string;
  fromCity: string;
  toCode: string;
  toCity: string;
  flightAt: string;
  flightDate: string;
  ticketNo: string;
  travelers: string;
  issueAt: string;
  issueDate: string;
  expiryAt: string;
  expiryDate: string;
  bookedDate: string;
};

const airlines = {
  BS: {
    airlineCode: "BS",
    airline: "US-Bangla Airlines",
    fromCode: "DAC",
    fromCity: "Dhaka",
    toCode: "CXB",
    toCity: "Cox's Bazar",
  },
  BG: {
    airlineCode: "BG",
    airline: "Biman Bangladesh Airlines",
    fromCode: "DAC",
    fromCity: "Dhaka",
    toCode: "CXB",
    toCity: "Cox's Bazar",
  },
  FZ: {
    airlineCode: "FZ",
    airline: "flydubai",
    fromCode: "DAC",
    fromCity: "Dhaka",
    toCode: "DXB",
    toCity: "Dubai",
  },
  QR: {
    airlineCode: "QR",
    airline: "Qatar Airways",
    fromCode: "DAC",
    fromCity: "Dhaka",
    toCode: "DOH",
    toCity: "Doha",
  },
  EK: {
    airlineCode: "EK",
    airline: "Emirates",
    fromCode: "DAC",
    fromCity: "Dhaka",
    toCode: "DXB",
    toCity: "Dubai",
  },
  UL: {
    airlineCode: "UL",
    airline: "SriLankan Airlines",
    fromCode: "DAC",
    fromCity: "Dhaka",
    toCode: "CMB",
    toCity: "Colombo",
  },
} as const;

function row(
  id: string,
  kind: TicketAlertKind,
  pnr: string,
  airline: keyof typeof airlines,
  ticketNo: string,
  travelers: string,
  flightAt: string,
  flightDate: string,
  issueAt: string,
  issueDate: string,
  expiryAt: string,
  expiryDate: string,
  bookedDate: string,
): TicketAlert {
  return {
    id,
    kind,
    pnr,
    ticketNo,
    travelers,
    flightAt,
    flightDate,
    issueAt,
    issueDate,
    expiryAt,
    expiryDate,
    bookedDate,
    ...airlines[airline],
  };
}

export const dummyTicketAlerts: TicketAlert[] = [
  row("ATKBD26080001", "today", "ABCDEF", "BS", "125-2408220157", "1 Adult", "18:30", "2026-08-22", "20 Aug 2026, 10:30 AM", "2026-08-20", "24 Aug 2026, 11:59 PM", "2026-08-24", "2026-08-20"),
  row("ATKBD26080002", "today", "KLMN88", "BG", "117-2408220433", "1 Adult", "11:00", "2026-08-22", "20 Aug 2026, 01:10 PM", "2026-08-20", "24 Aug 2026, 11:59 PM", "2026-08-24", "2026-08-20"),
  row("ATKBD26080003", "today", "QWER12", "EK", "176-2408220584", "2 Adults", "02:40", "2026-08-23", "21 Aug 2026, 09:20 AM", "2026-08-21", "24 Aug 2026, 11:59 PM", "2026-08-24", "2026-08-21"),
  row("ATKBD26080004", "days-3", "PNR456", "BG", "117-2508220433", "2 Adults", "11:00", "2026-08-25", "21 Aug 2026, 02:15 PM", "2026-08-21", "27 Aug 2026, 11:59 PM", "2026-08-27", "2026-08-21"),
  row("ATKBD26080005", "days-3", "TYUI90", "BS", "125-2508220188", "1 Adult", "07:45", "2026-08-25", "21 Aug 2026, 04:30 PM", "2026-08-21", "27 Aug 2026, 11:59 PM", "2026-08-27", "2026-08-21"),
  row("ATKBD26080006", "days-3", "ASDF34", "FZ", "141-2608220112", "1 Adult", "16:20", "2026-08-26", "22 Aug 2026, 08:05 AM", "2026-08-22", "27 Aug 2026, 11:59 PM", "2026-08-27", "2026-08-22"),
  row("ATKBD26080007", "days-7", "PNR789", "FZ", "141-3008220584", "1 Adult", "02:15", "2026-08-30", "22 Aug 2026, 09:40 AM", "2026-08-22", "31 Aug 2026, 11:59 PM", "2026-08-31", "2026-08-22"),
  row("ATKBD26080008", "days-3", "GHJK56", "QR", "157-2608220201", "3 Adults", "01:55", "2026-08-26", "22 Aug 2026, 11:15 AM", "2026-08-22", "27 Aug 2026, 11:59 PM", "2026-08-27", "2026-08-22"),
  row("ATKBD26080009", "days-3", "ZXCV78", "UL", "603-2708220330", "1 Adult", "09:10", "2026-08-27", "22 Aug 2026, 03:45 PM", "2026-08-22", "27 Aug 2026, 11:59 PM", "2026-08-27", "2026-08-22"),
  row("ATKBD26080010", "issued", "PNR321", "QR", "157-0209220123", "1 Adult", "01:40", "2026-09-02", "23 Aug 2026, 04:05 PM", "2026-08-23", "06 Sep 2026, 11:59 PM", "2026-09-06", "2026-08-23"),
  row("ATKBD26080011", "days-3", "BNMQ12", "EK", "176-2708220444", "2 Adults", "21:30", "2026-08-27", "23 Aug 2026, 10:00 AM", "2026-08-23", "27 Aug 2026, 11:59 PM", "2026-08-27", "2026-08-23"),
  row("ATKBD26080012", "days-3", "POIU45", "BG", "117-2608220555", "1 Adult", "14:20", "2026-08-26", "23 Aug 2026, 12:25 PM", "2026-08-23", "27 Aug 2026, 11:59 PM", "2026-08-27", "2026-08-23"),
  row("ATKBD26080013", "days-7", "LKJH67", "BS", "125-3008220666", "1 Adult", "18:30", "2026-08-30", "23 Aug 2026, 02:40 PM", "2026-08-23", "31 Aug 2026, 11:59 PM", "2026-08-31", "2026-08-23"),
  row("ATKBD26080014", "days-7", "MNBV89", "FZ", "141-3108220777", "2 Adults", "03:05", "2026-08-31", "23 Aug 2026, 05:10 PM", "2026-08-23", "31 Aug 2026, 11:59 PM", "2026-08-31", "2026-08-23"),
  row("ATKBD26080015", "days-7", "REWQ11", "QR", "157-0109220888", "1 Adult", "01:40", "2026-09-01", "24 Aug 2026, 09:00 AM", "2026-08-24", "31 Aug 2026, 11:59 PM", "2026-08-31", "2026-08-24"),
  row("ATKBD26080016", "days-7", "TYHN22", "EK", "176-0109220999", "1 Adult", "02:40", "2026-09-01", "24 Aug 2026, 09:35 AM", "2026-08-24", "31 Aug 2026, 11:59 PM", "2026-08-31", "2026-08-24"),
  row("ATKBD26080017", "days-7", "UJMK33", "UL", "603-3108221001", "4 Adults", "08:50", "2026-08-31", "24 Aug 2026, 10:20 AM", "2026-08-24", "31 Aug 2026, 11:59 PM", "2026-08-31", "2026-08-24"),
  row("ATKBD26080018", "days-7", "IKOL44", "BG", "117-3008221112", "1 Adult", "11:00", "2026-08-30", "24 Aug 2026, 11:05 AM", "2026-08-24", "31 Aug 2026, 11:59 PM", "2026-08-31", "2026-08-24"),
  row("ATKBD26080019", "days-7", "PLMN55", "BS", "125-0109221223", "2 Adults", "07:45", "2026-09-01", "24 Aug 2026, 11:40 AM", "2026-08-24", "31 Aug 2026, 11:59 PM", "2026-08-31", "2026-08-24"),
  row("ATKBD26080020", "days-7", "OKIJ66", "FZ", "141-0209221334", "1 Adult", "16:20", "2026-09-02", "24 Aug 2026, 12:15 PM", "2026-08-24", "31 Aug 2026, 11:59 PM", "2026-08-31", "2026-08-24"),
  row("ATKBD26080021", "days-7", "UHYG77", "QR", "157-0209221445", "1 Adult", "01:40", "2026-09-02", "24 Aug 2026, 01:00 PM", "2026-08-24", "31 Aug 2026, 11:59 PM", "2026-08-31", "2026-08-24"),
  row("ATKBD26080022", "days-7", "TFRE88", "EK", "176-0309221556", "3 Adults", "09:15", "2026-09-03", "24 Aug 2026, 01:45 PM", "2026-08-24", "31 Aug 2026, 11:59 PM", "2026-08-31", "2026-08-24"),
  row("ATKBD26080023", "days-7", "EDCV99", "BG", "117-0209221667", "1 Adult", "15:10", "2026-09-02", "24 Aug 2026, 02:20 PM", "2026-08-24", "31 Aug 2026, 11:59 PM", "2026-08-31", "2026-08-24"),
  row("ATKBD26080024", "issued", "WSXA00", "UL", "603-0609221778", "2 Adults", "23:40", "2026-09-06", "24 Aug 2026, 03:10 PM", "2026-08-24", "06 Sep 2026, 11:59 PM", "2026-09-06", "2026-08-24"),
];

export const alertKindMeta: Record<
  TicketAlertKind,
  {
    title: string;
    status: string;
    text: string;
    badge: string;
    icon: string;
    accent: string;
  }
> = {
  today: {
    title: "Ticket Expiring Today",
    status: "Expiring Today",
    text: "text-[#dc2626]",
    badge: "bg-[#fef2f2] text-[#dc2626]",
    icon: "bg-[#fef2f2] text-[#dc2626]",
    accent: "text-[#dc2626]",
  },
  "days-3": {
    title: "Expiring in 3 Days",
    status: "Expiring in 3 Days",
    text: "text-[#ea580c]",
    badge: "bg-[#fff7ed] text-[#c2410c]",
    icon: "bg-[#fff7ed] text-[#ea580c]",
    accent: "text-[#ea580c]",
  },
  "days-7": {
    title: "Expiring in 7 Days",
    status: "Expiring in 7 Days",
    text: "text-[#2563eb]",
    badge: "bg-[#eff6ff] text-[#2563eb]",
    icon: "bg-[#eff6ff] text-[#2563eb]",
    accent: "text-[#2563eb]",
  },
  issued: {
    title: "Recently Issued",
    status: "Issued",
    text: "text-[#16a34a]",
    badge: "bg-[#ecfdf3] text-[#16a34a]",
    icon: "bg-[#ecfdf3] text-[#16a34a]",
    accent: "text-[#16a34a]",
  },
};

export function formatFlightStamp(alert: TicketAlert) {
  const date = new Date(`${alert.flightDate}T00:00:00`);
  const day = date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return `${day}, ${alert.flightAt}`;
}

export function dateValue(alert: TicketAlert, field: TicketDateField) {
  if (field === "issue") return alert.issueDate;
  if (field === "expiry") return alert.expiryDate;
  if (field === "flight") return alert.flightDate;
  return alert.bookedDate;
}
