/**
 * Passport number helpers for the B2C travellers form.
 * Aligned with OCR plausibility: A–Z / 0–9, length 6–12, must include a digit.
 */

const PASSPORT_NUMBER_BLOCKLIST = new Set([
  "PERSONAL",
  "PASSPORT",
  "NATIONAL",
  "REPUBLIC",
  "BANGLADESH",
  "DOCUMENT",
  "IDENTITY",
  "EMERGENCY",
  "PERMANENT",
  "TELEPHONE",
]);

export function normalizePassportNumber(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** True ICAO-ish passport number: letters/digits, not dictionary words. */
export function isPlausiblePassportNumber(value: string): boolean {
  const cleaned = normalizePassportNumber(value);
  if (cleaned.length < 6 || cleaned.length > 12) return false;
  if (PASSPORT_NUMBER_BLOCKLIST.has(cleaned)) return false;
  if (!/[0-9]/.test(cleaned)) return false;
  if (!/^[A-Z0-9]+$/.test(cleaned)) return false;
  return true;
}

/** Human-readable reason, or null if OK. */
export function passportNumberError(value: string): string | null {
  const cleaned = normalizePassportNumber(value);
  if (!cleaned) return "Passport number is required";
  if (cleaned.length < 6) return "Passport number must be at least 6 characters";
  if (cleaned.length > 12) return "Passport number must be at most 12 characters";
  if (PASSPORT_NUMBER_BLOCKLIST.has(cleaned)) return "Enter the passport number from the document";
  if (!/[0-9]/.test(cleaned)) return "Passport number must include at least one digit";
  if (!/^[A-Z0-9]+$/.test(cleaned)) return "Passport number may only use letters and digits";
  return null;
}

/** Expiry must be a real yyyy-MM-dd date and not already past. */
export function passportExpiryError(value: string): string | null {
  const raw = value.trim();
  if (!raw) return "Passport expiry is required";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "Enter a valid passport expiry date";
  const [y, m, d] = raw.split("-").map(Number);
  const expiry = new Date(Date.UTC(y!, m! - 1, d!));
  if (
    Number.isNaN(expiry.getTime()) ||
    expiry.getUTCFullYear() !== y ||
    expiry.getUTCMonth() !== m! - 1 ||
    expiry.getUTCDate() !== d
  ) {
    return "Enter a valid passport expiry date";
  }
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (expiry.getTime() < todayUtc) return "Passport expiry must be a future date";
  return null;
}

export const PASSPORT_NUMBER_MAX_LENGTH = 12;
