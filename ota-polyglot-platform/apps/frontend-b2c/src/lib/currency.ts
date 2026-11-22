/** Prices arrive from core-engine already in the currency the customer pays. Nothing here converts: a rate table in the browser was a
 *  second, unaudited source of prices (P5-9). This only formats. */
const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", BDT: "৳", AED: "AED ", SAR: "SAR " };

export function formatMoney(amount: number, currency: string): string {
  const symbol = SYMBOL[currency] ?? `${currency} `;
  const whole = Number.isInteger(amount) || Math.abs(amount) >= 1000;
  return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })}`;
}
