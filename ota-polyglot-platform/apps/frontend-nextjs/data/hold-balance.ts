export type HoldTxnType = "top-up" | "hold" | "release" | "debit" | "refund";
export type HoldTxnStatus = "success" | "pending" | "failed";

export type HoldTransaction = {
  id: string;
  type: HoldTxnType;
  bookingId: string | null;
  pnr: string | null;
  amount: number;
  balanceAfter: number;
  method: string;
  note: string;
  status: HoldTxnStatus;
  createdAt: string;
  createdDate: string;
};

export const holdWallet = {
  available: 185450,
  onHold: 24600,
  creditLimit: 250000,
  agency: "AeroTake Aviation",
  agencyCode: "ATK-0245",
  lastTopUp: "22 Aug 2026, 11:20 AM",
};

export const holdTxnMeta: Record<
  HoldTxnType,
  { label: string; badge: string; signed: "credit" | "debit" }
> = {
  "top-up": {
    label: "Top-up",
    badge: "bg-[#ecfdf3] text-[#16a34a]",
    signed: "credit",
  },
  hold: {
    label: "Hold",
    badge: "bg-[#fff7ed] text-[#c2410c]",
    signed: "debit",
  },
  release: {
    label: "Release",
    badge: "bg-[#eff6ff] text-[#2563eb]",
    signed: "credit",
  },
  debit: {
    label: "Ticket Debit",
    badge: "bg-[#fef2f2] text-[#dc2626]",
    signed: "debit",
  },
  refund: {
    label: "Refund",
    badge: "bg-[#ecfdf3] text-[#15803d]",
    signed: "credit",
  },
};

export const holdStatusMeta: Record<
  HoldTxnStatus,
  { label: string; badge: string }
> = {
  success: { label: "Success", badge: "bg-[#ecfdf3] text-[#16a34a]" },
  pending: { label: "Pending", badge: "bg-[#fff7ed] text-[#c2410c]" },
  failed: { label: "Failed", badge: "bg-[#fef2f2] text-[#dc2626]" },
};

export const dummyHoldTransactions: HoldTransaction[] = [
  {
    id: "HB-26082401",
    type: "hold",
    bookingId: "ATKBD26080002",
    pnr: "WXYZ12",
    amount: 6500,
    balanceAfter: 185450,
    method: "Wallet",
    note: "Amount held for on-hold booking",
    status: "success",
    createdAt: "24 Aug 2026, 10:15 AM",
    createdDate: "2026-08-24",
  },
  {
    id: "HB-26082308",
    type: "debit",
    bookingId: "ATKBD26080001",
    pnr: "ABCDEF",
    amount: 8000,
    balanceAfter: 191950,
    method: "Wallet",
    note: "Ticket issued — DAC to CXB",
    status: "success",
    createdAt: "23 Aug 2026, 04:42 PM",
    createdDate: "2026-08-23",
  },
  {
    id: "HB-26082212",
    type: "top-up",
    bookingId: null,
    pnr: null,
    amount: 50000,
    balanceAfter: 199950,
    method: "Bank Transfer",
    note: "Manual top-up approved by AeroTake finance",
    status: "success",
    createdAt: "22 Aug 2026, 11:20 AM",
    createdDate: "2026-08-22",
  },
  {
    id: "HB-26082109",
    type: "release",
    bookingId: "ATKBD26080008",
    pnr: "GHJK56",
    amount: 9200,
    balanceAfter: 149950,
    method: "Wallet",
    note: "Hold released after booking cancelled",
    status: "success",
    createdAt: "21 Aug 2026, 06:05 PM",
    createdDate: "2026-08-21",
  },
  {
    id: "HB-26082007",
    type: "hold",
    bookingId: "ATKBD26080008",
    pnr: "GHJK56",
    amount: 9200,
    balanceAfter: 140750,
    method: "Wallet",
    note: "Temporary hold for pending confirmation",
    status: "success",
    createdAt: "20 Aug 2026, 02:18 PM",
    createdDate: "2026-08-20",
  },
  {
    id: "HB-26081905",
    type: "refund",
    bookingId: "ATKBD26080011",
    pnr: "BNMQ12",
    amount: 14500,
    balanceAfter: 149950,
    method: "Wallet",
    note: "Partial refund credited to wallet",
    status: "success",
    createdAt: "19 Aug 2026, 01:30 PM",
    createdDate: "2026-08-19",
  },
  {
    id: "HB-26081804",
    type: "top-up",
    bookingId: null,
    pnr: null,
    amount: 25000,
    balanceAfter: 135450,
    method: "bKash",
    note: "Top-up request pending verification",
    status: "pending",
    createdAt: "18 Aug 2026, 09:55 AM",
    createdDate: "2026-08-18",
  },
  {
    id: "HB-26081703",
    type: "debit",
    bookingId: "ATKBD26080010",
    pnr: "PNR321",
    amount: 42000,
    balanceAfter: 110450,
    method: "Wallet",
    note: "International ticket debit",
    status: "success",
    createdAt: "17 Aug 2026, 05:12 PM",
    createdDate: "2026-08-17",
  },
  {
    id: "HB-26081602",
    type: "top-up",
    bookingId: null,
    pnr: null,
    amount: 10000,
    balanceAfter: 152450,
    method: "Nagad",
    note: "Failed payment — insufficient sender balance",
    status: "failed",
    createdAt: "16 Aug 2026, 03:40 PM",
    createdDate: "2026-08-16",
  },
  {
    id: "HB-26081501",
    type: "hold",
    bookingId: "ATKBD26080005",
    pnr: "TYUI90",
    amount: 8900,
    balanceAfter: 152450,
    method: "Wallet",
    note: "Hold for reissue process",
    status: "success",
    createdAt: "15 Aug 2026, 11:05 AM",
    createdDate: "2026-08-15",
  },
];

export function formatBalance(amount: number) {
  return `BDT ${amount.toLocaleString()}.00`;
}

export function signedAmount(txn: HoldTransaction) {
  const meta = holdTxnMeta[txn.type];
  const prefix = meta.signed === "credit" ? "+" : "-";
  return `${prefix}${formatBalance(txn.amount)}`;
}
