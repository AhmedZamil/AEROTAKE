/** Dev/QA Price Check is off unless the host process sets this to "1". */
export function isPriceCheckEnabled(): boolean {
  return process.env.PRICE_CHECK_ENABLED === "1";
}
