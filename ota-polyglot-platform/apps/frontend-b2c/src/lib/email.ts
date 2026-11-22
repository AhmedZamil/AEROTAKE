/**
 * Basic contact-email check for the traveller form.
 * Empty, malformed, and oversized addresses get different messages.
 */

const LOCAL = /^[A-Za-z0-9._%+-]+$/;
const LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const TLD = /^[A-Za-z]{2,24}$/;

const TOO_LONG = "Email address is too long";
const INVALID = "Enter a valid email address (e.g. name@example.com)";

/** Human-readable reason, or null if the address is a normal email. */
export function emailValidationError(value: string): string | null {
  const email = value.trim();
  if (!email) return "Email is required";
  if (email.length > 254) return TOO_LONG;

  const at = email.lastIndexOf("@");
  if (at <= 0 || at !== email.indexOf("@")) return INVALID;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || !LOCAL.test(local)) return INVALID;
  if (!domain || domain.includes("..") || domain.startsWith(".") || domain.endsWith(".")) return INVALID;

  const labels = domain.split(".");
  if (labels.length < 2) return INVALID;

  const tld = labels[labels.length - 1] ?? "";
  if (!TLD.test(tld)) return tld.length > 24 ? TOO_LONG : INVALID;

  for (const label of labels.slice(0, -1)) {
    if (label.length > 63) return TOO_LONG;
    if (!LABEL.test(label)) return INVALID;
  }

  return null;
}

export function isEmailValid(value: string): boolean {
  return emailValidationError(value) === null;
}

/** Show a live format error once the visitor has typed enough to judge. */
export function shouldShowEmailHint(value: string): boolean {
  const email = value.trim();
  if (!email) return false;
  return email.includes("@") || email.length >= 5;
}
