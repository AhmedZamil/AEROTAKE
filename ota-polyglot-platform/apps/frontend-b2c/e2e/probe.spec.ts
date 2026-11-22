import { test } from "@playwright/test";
test.use({ baseURL: "http://localhost:3001" });
const cases = [
  ["home default (one way DAC-DXB)", "/flights?from=DAC&to=DXB&depart=2026-10-25&adults=1&children=0&infants=0&cabin=economy&trip=oneway&fare=regular"],
  ["round trip DAC-DXB", "/flights?from=DAC&to=DXB&depart=2026-10-25&return=2026-11-01&adults=1&children=0&infants=0&cabin=economy&trip=round&fare=regular"],
  ["domestic DAC-CXB", "/flights?from=DAC&to=CXB&depart=2026-10-25&adults=1&children=0&infants=0&cabin=economy&trip=oneway&fare=regular"],
  ["DAC-LHR", "/flights?from=DAC&to=LHR&depart=2026-10-25&adults=1&children=0&infants=0&cabin=economy&trip=oneway&fare=regular"],
  ["2 adults 1 child", "/flights?from=DAC&to=DXB&depart=2026-10-25&adults=2&children=1&infants=0&cabin=economy&trip=oneway&fare=regular"],
  ["business class", "/flights?from=DAC&to=DXB&depart=2026-10-25&adults=1&children=0&infants=0&cabin=business&trip=oneway&fare=regular"],
  ["with an infant", "/flights?from=DAC&to=DXB&depart=2026-10-25&adults=1&children=0&infants=1&cabin=economy&trip=oneway&fare=regular"],
  ["date in the past", "/flights?from=DAC&to=DXB&depart=2026-08-01&adults=1&children=0&infants=0&cabin=economy&trip=oneway&fare=regular"],
] as const;
for (const [name, url] of cases) {
  test(name, async ({ page }, info) => {
    test.setTimeout(120000);
    const t0 = Date.now(); const sec = () => ((Date.now() - t0) / 1000).toFixed(1) + "s";
    const seen: string[] = [];
    page.on("response", async (r) => { if (r.url().includes("/api/search")) { const req = r.request().postDataJSON(); const j = await r.json().catch(() => ({})); seen.push(`${sec()} speed=${req.speed} HTTP ${r.status()} flights=${(j.flights ?? []).length} ${j.error ? "error=" + j.error + ": " + j.message : ""}`); } });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(20000);
    const heading = await page.getByText(/available flights|Searching/).first().innerText().catch(() => "(none)");
    const alerts = await page.locator('[role="alert"], .form-error').allInnerTexts();
    const cards = await page.locator("article").count();
    console.log(`\n### ${name}\n  ${seen.join("\n  ")}\n  page: "${heading.trim()}" cards=${cards} alerts=${JSON.stringify(alerts.filter(Boolean))}`);
    await page.screenshot({ path: `/tmp/shots/p-${info.title.replace(/\W+/g, "_")}.png` });
  });
}
