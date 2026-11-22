/**
 * Offer-id prefixes of suppliers that are REAL (revalidated before booking,
 * reserved through ProcessB2BBooking). Everything else — the dummy dataset
 * behind Intelli-Bestbuy, ids like "bs-141" — keeps the local-only flow.
 * Adding a supplier on the backend means adding its prefix here.
 */
const LIVE_SUPPLIER_LABELS: Record<string, string> = {
  SABRE: "Sabre",
  HAJEE: "Hajee Air",
};

export function isLiveOfferId(id: string): boolean {
  const prefix = id.split("-")[0];
  return Object.prototype.hasOwnProperty.call(LIVE_SUPPLIER_LABELS, prefix);
}

export function supplierLabel(code: string | undefined): string | null {
  return code ? (LIVE_SUPPLIER_LABELS[code] ?? code) : null;
}

/**
 * Agents see which supplier a fare comes from. To make this admin-only later,
 * flip NEXT_PUBLIC_SHOW_SUPPLIER_TAG to "false" (or gate on the user's role
 * here) — one switch, no component changes.
 */
export const SHOW_SUPPLIER_TAG = process.env.NEXT_PUBLIC_SHOW_SUPPLIER_TAG !== "false";
