export type SupportStatus = "active" | "closed";
export type SupportView = "dashboard" | "active" | "closed";

export type SupportPrefill = {
  bookingId: string;
  pnr?: string;
  create: boolean;
};

export const SUPPORT_PREFILL_STORAGE_KEY = "aerotake-support-prefill";

export function supportHrefForBooking(bookingId: string, pnr?: string) {
  const params = new URLSearchParams({
    bookingId,
    create: "1",
  });
  if (pnr?.trim()) {
    params.set("pnr", pnr.trim());
  }
  return `/dashboard/support?${params.toString()}`;
}

export function primeSupportPrefill(bookingId: string, pnr?: string) {
  if (typeof window === "undefined") return;
  const prefill: SupportPrefill = {
    bookingId: bookingId.trim(),
    create: true,
  };
  if (pnr?.trim()) {
    prefill.pnr = pnr.trim();
  }
  sessionStorage.setItem(SUPPORT_PREFILL_STORAGE_KEY, JSON.stringify(prefill));
}

export function readSupportPrefillFromUrl(): SupportPrefill | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const bookingId = params.get("bookingId")?.trim();
  if (!bookingId) return null;
  const prefill: SupportPrefill = {
    bookingId,
    create: params.get("create") === "1",
  };
  const pnr = params.get("pnr")?.trim();
  if (pnr) prefill.pnr = pnr;
  return prefill;
}

export function consumeSupportPrefill(): SupportPrefill | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(SUPPORT_PREFILL_STORAGE_KEY);
  sessionStorage.removeItem(SUPPORT_PREFILL_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SupportPrefill;
  } catch {
    return null;
  }
}

export function buildSupportPrefillSubject(bookingId: string, pnr?: string) {
  return pnr
    ? `Support for booking ${bookingId} (PNR: ${pnr})`
    : `Support for booking ${bookingId}`;
}

export type SupportTicket = {
  id: string;
  bookingId: string;
  pnr: string;
  subject: string;
  category: string;
  createdAt: string;
  updatedAt: string;
  status: SupportStatus;
};

export const dummySupportTickets: SupportTicket[] = [
  {
    id: "SUP-26082401",
    bookingId: "ATKBD26080001",
    pnr: "ABCDEF",
    subject: "Need a copy of the e-ticket for DAC–CXB",
    category: "Ticket copy",
    createdAt: "24 Aug 2026, 09:18 AM",
    updatedAt: "24 Aug 2026, 10:02 AM",
    status: "active",
  },
  {
    id: "SUP-26082308",
    bookingId: "ATKBD26080004",
    pnr: "PNR456",
    subject: "Passenger name correction before travel",
    category: "Name change",
    createdAt: "23 Aug 2026, 04:40 PM",
    updatedAt: "23 Aug 2026, 06:12 PM",
    status: "active",
  },
  {
    id: "SUP-26082305",
    bookingId: "ATKBD26080007",
    pnr: "PNR789",
    subject: "Baggage allowance confirmation for flydubai",
    category: "Baggage",
    createdAt: "23 Aug 2026, 11:25 AM",
    updatedAt: "24 Aug 2026, 08:50 AM",
    status: "active",
  },
  {
    id: "SUP-26082212",
    bookingId: "ATKBD26080010",
    pnr: "PNR321",
    subject: "Seat request for Qatar DAC–DOH",
    category: "Seat request",
    createdAt: "22 Aug 2026, 02:15 PM",
    updatedAt: "22 Aug 2026, 07:30 PM",
    status: "closed",
  },
  {
    id: "SUP-26082104",
    bookingId: "ATKBD26080002",
    pnr: "KLMN88",
    subject: "Hold booking time extension",
    category: "Hold booking",
    createdAt: "21 Aug 2026, 06:05 PM",
    updatedAt: "22 Aug 2026, 09:40 AM",
    status: "closed",
  },
  {
    id: "SUP-26082009",
    bookingId: "ATKBD26080006",
    pnr: "ASDF34",
    subject: "Invoice for agency accounting",
    category: "Invoice",
    createdAt: "20 Aug 2026, 03:22 PM",
    updatedAt: "21 Aug 2026, 01:10 PM",
    status: "closed",
  },
];
