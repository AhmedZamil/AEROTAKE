/**
 * Contact phone helpers for the B2C travellers form.
 * Dial-specific mobile rules for every country offered in the UI.
 */

export const DIAL_CODES = ["+880", "+971", "+44", "+91", "+1"] as const;

type DialRule = {
  /** Max digits the national input accepts (with optional trunk 0 where we keep it). */
  maxLength: number;
  /** Placeholder shown in the national field. */
  placeholder: string;
  /** Normalize before validate/store. */
  normalize: (digits: string) => string;
  /** Error message, or null if valid. */
  validate: (national: string) => string | null;
};

/** Local BD mobile: 01 + operator 3–9 + 8 subscriber digits. */
export const BD_MOBILE_LOCAL = /^01[3-9]\d{8}$/;

const RULES: Record<(typeof DIAL_CODES)[number], DialRule> = {
  // Bangladesh: 11 digits 01[3-9]XXXXXXXX
  "+880": {
    maxLength: 11,
    placeholder: "01XXXXXXXXX",
    normalize: (digits) => (/^1[3-9]\d{8}$/.test(digits) ? `0${digits}` : digits),
    validate: (national) => {
      if (national.length !== 11) {
        return "Bangladesh mobile numbers are 11 digits (e.g. 017XXXXXXXX)";
      }
      if (!national.startsWith("01")) {
        return "BD mobile must start with 01 (not 19 or other prefixes)";
      }
      if (!BD_MOBILE_LOCAL.test(national)) {
        return "Enter a valid BD mobile (01 then 3–9, then 8 digits, e.g. 017XXXXXXXX)";
      }
      return null;
    },
  },
  // UAE: national significant 9 digits starting with 5 (50/52/54/55/56…); accept 05… and store as 05XXXXXXXXX
  "+971": {
    maxLength: 10,
    placeholder: "05XXXXXXXX",
    normalize: (digits) => (/^5\d{8}$/.test(digits) ? `0${digits}` : digits),
    validate: (national) => {
      if (!/^05\d{8}$/.test(national) && !/^5\d{8}$/.test(national)) {
        if (national.length < 9) return "UAE mobile numbers are 9 digits starting with 5 (e.g. 05XXXXXXXX)";
        return "Enter a valid UAE mobile (starts with 05, e.g. 0501234567)";
      }
      return null;
    },
  },
  // UK mobile: 07XXXXXXXXX (11 with trunk 0) / 7XXXXXXXXX after +44
  "+44": {
    maxLength: 11,
    placeholder: "07XXXXXXXXX",
    normalize: (digits) => (/^7\d{9}$/.test(digits) ? `0${digits}` : digits),
    validate: (national) => {
      if (!/^07\d{9}$/.test(national) && !/^7\d{9}$/.test(national)) {
        if (national.length < 10) return "UK mobile numbers are 11 digits starting with 07";
        return "Enter a valid UK mobile (starts with 07, e.g. 07123456789)";
      }
      return null;
    },
  },
  // India mobile: 10 digits starting 6–9
  "+91": {
    maxLength: 10,
    placeholder: "9XXXXXXXXX",
    normalize: (digits) => digits,
    validate: (national) => {
      if (national.length !== 10) {
        return "India mobile numbers are 10 digits";
      }
      if (!/^[6-9]\d{9}$/.test(national)) {
        return "Enter a valid India mobile (starts with 6–9)";
      }
      return null;
    },
  },
  // US / NANP: 10 digits, area + exchange both start 2–9
  "+1": {
    maxLength: 10,
    placeholder: "2025550123",
    normalize: (digits) => digits,
    validate: (national) => {
      if (national.length !== 10) {
        return "US phone numbers are 10 digits";
      }
      if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(national)) {
        return "Enter a valid US number (area and exchange codes cannot start with 0 or 1)";
      }
      return null;
    },
  },
};

function ruleFor(phoneCountry: string): DialRule | null {
  return (RULES as Record<string, DialRule>)[phoneCountry] ?? null;
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Normalize a national number for the selected dial
 * (e.g. BD/UAE/UK trunk 0 when the user typed without it).
 */
export function normalizeNationalNumber(phoneCountry: string, phone: string): string {
  const digits = digitsOnly(phone);
  const rule = ruleFor(phoneCountry);
  return rule ? rule.normalize(digits) : digits;
}

export function splitContactPhone(stored: string): { phoneCountry: string; phone: string } {
  let rest = stored.trim().replace(/\s+/g, " ");
  let phoneCountry: string = "+880";
  let peeled = true;
  while (peeled && rest) {
    peeled = false;
    for (const dial of DIAL_CODES) {
      if (rest.startsWith(dial)) {
        phoneCountry = dial;
        rest = rest.slice(dial.length).trim();
        peeled = true;
        break;
      }
    }
  }
  return {
    phoneCountry,
    phone: normalizeNationalNumber(phoneCountry, rest),
  };
}

export function joinContactPhone(phoneCountry: string, phone: string): string {
  const national = normalizeNationalNumber(phoneCountry, phone);
  return `${phoneCountry} ${national}`.trim();
}

/** True when the national number satisfies rules for the dial code. */
export function isPhoneValid(phoneCountry: string, phone: string): boolean {
  return phoneValidationError(phoneCountry, phone) === null;
}

/** Human-readable reason, or null if OK. */
export function phoneValidationError(phoneCountry: string, phone: string): string | null {
  const national = normalizeNationalNumber(phoneCountry, phone);
  if (!national) return "Enter a mobile number";

  const rule = ruleFor(phoneCountry);
  if (rule) return rule.validate(national);

  if (national.length < 7) return "Enter a valid mobile number (at least 7 digits)";
  if (national.length > 15) return "Phone number is too long (15 digits max)";
  return null;
}

export function phoneInputMaxLength(phoneCountry: string): number {
  return ruleFor(phoneCountry)?.maxLength ?? 15;
}

export function phonePlaceholder(phoneCountry: string): string {
  return ruleFor(phoneCountry)?.placeholder ?? "Mobile number";
}

/** Show a live format error once the field is long enough to judge. */
export function shouldShowPhoneHint(phoneCountry: string, phone: string): boolean {
  const digits = digitsOnly(phone);
  if (!digits) return false;
  const max = phoneInputMaxLength(phoneCountry);
  // UAE can be 9 (without 0) or 10 (with 0); show once we hit the shorter valid length.
  if (phoneCountry === "+971") return digits.length >= 9;
  if (phoneCountry === "+44") return digits.length >= 10;
  return digits.length >= max;
}
