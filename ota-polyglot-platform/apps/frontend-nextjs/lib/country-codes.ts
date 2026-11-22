/**
 * ICAO/MRZ alpha-3 -> ISO 3166-1 alpha-2 country code lookup.
 *
 * NOT a complete ISO 3166-1 table — deliberately limited to countries
 * actually relevant to this agency's traveler base (Bangladesh, South Asia,
 * the Gulf, and major global hubs). Passport MRZ lines encode nationality
 * as alpha-3 (e.g. "BGD"), but Sabre's PNR-create request wants alpha-2
 * (see SabreProvider.cs's NationalityCountry/IssueCountry fields). A wrong
 * guess for an uncovered country would silently mis-tag a passenger's
 * nationality, so an unmapped code is left for the agent to enter manually
 * rather than truncated or guessed — see applyPassportScan in
 * flight-booking-checkout.tsx.
 */
export const ALPHA3_TO_ALPHA2: Record<string, string> = {
  BGD: "BD",
  IND: "IN",
  PAK: "PK",
  NPL: "NP",
  LKA: "LK",
  BTN: "BT",
  MDV: "MV",
  MMR: "MM",
  MYS: "MY",
  SGP: "SG",
  THA: "TH",
  IDN: "ID",
  PHL: "PH",
  VNM: "VN",
  CHN: "CN",
  HKG: "HK",
  JPN: "JP",
  KOR: "KR",
  ARE: "AE",
  SAU: "SA",
  QAT: "QA",
  KWT: "KW",
  BHR: "BH",
  OMN: "OM",
  JOR: "JO",
  LBN: "LB",
  TUR: "TR",
  EGY: "EG",
  GBR: "GB",
  IRL: "IE",
  FRA: "FR",
  DEU: "DE",
  ITA: "IT",
  ESP: "ES",
  NLD: "NL",
  USA: "US",
  CAN: "CA",
  AUS: "AU",
  NZL: "NZ",
  ZAF: "ZA",
};

/** Best-effort alpha-3 -> alpha-2 conversion; returns null when the code
 * isn't in the table rather than guessing (e.g. truncating to 2 chars). */
export function alpha3ToAlpha2(code: string | undefined | null): string | null {
  if (!code) return null;
  return ALPHA3_TO_ALPHA2[code.trim().toUpperCase()] ?? null;
}
