import { expect, test, type Page } from "@playwright/test";

/**
 * The storefront, end to end in a real browser against the live stack (storefront -> core-engine -> the supplier's test system).
 * Covers search, sign-in required before reserve (P5-17), hold seats, and pay redirect (P5-4). SSLCommerz is stubbed in e2e to a local return URL.
 *
 * Supplier caveat: the Sabre cert system refuses some offers (stale schedules), so reserving tries the cheapest few flights until one is held.
 */

// Core rate-limits registration, sign-in failures and bookings per client address (the storefront passes the visitor's address on when the
// stack runs with TRUST_FORWARDED_FOR=true), so every test pretends to be its own visitor instead of sharing one address per run.
test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250) + 1}` });
});

const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const surname = `Tester${stamp}`;

function noBrowserErrors(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    // "Failed to load resource" lines carry no URL; failed requests are checked below with their URL and status
    // Google's own script complains when the test host (b2c.localhost) is not an authorised origin for the client id: not the site's fault
    if (m.type() === "error" && !/favicon|Failed to load resource|GSI_LOGGER/.test(m.text())) problems.push(`console: ${m.text().slice(0, 160)}`);
  });
  page.on("response", (r) => {
    const url = new URL(r.url());
    if (r.status() < 400 || url.pathname === "/favicon.ico") return;
    if (r.status() === 404 && url.pathname === "/api/guest/lookup") return; // the deliberate "no such booking" answer
    if (r.status() === 401 && url.pathname === "/api/bookings") return; // signed-out reserve refuse (P5-17)
    if (r.status() === 401 && /\/api\/bookings\/[^/]+\/pay$/.test(url.pathname)) return;
    if (url.hostname.endsWith("google.com") || url.hostname.endsWith("gstatic.com")) return; // Google's sign-in button, not this site
    if (url.hostname.includes("sslcommerz.com")) return; // real gateway only when not stubbed
    problems.push(`${r.status()} ${url.pathname}`);
  });
  return problems;
}

test("home page: real search form, no leftovers from the mockup", async ({ page }) => {
  const problems = noBrowserErrors(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /Discover the Extraordinary/ })).toBeVisible();
  const body = await page.locator("body").innerText();
  for (const claim of [/mockup/i, /\bdemo\b/i, /simulated/i, /10,000\+/, /4\.9/, /24\/7/, /FLY10/]) expect(body).not.toMatch(claim);

  // default dates are in the future (they used to be hardcoded to a date that is now past)
  const readDates = () =>
    page.locator('input[type="date"]').evaluateAll((els) =>
      els.map((e) => (e as HTMLInputElement).value).filter(Boolean),
    );
  await expect.poll(async () => (await readDates()).length, { timeout: 10_000 }).toBeGreaterThan(0); // filled in the browser after load
  const today = new Date().toISOString().slice(0, 10);
  for (const d of await readDates()) expect(d >= today).toBe(true);
  // Calendar panel opens from the visible Departure control (not the native picker)
  await page.getByRole("button", { name: /^Departure$/i }).first().click();
  await expect(page.getByRole("dialog", { name: /choose departure/i })).toBeVisible();
  expect(problems).toEqual([]);
});

test("airport picker finds airports in core's directory", async ({ page }) => {
  await page.goto("/");
  await page.locator('button[aria-haspopup="listbox"]:visible').nth(1).click(); // the "To" picker
  await page.getByPlaceholder("Search city or code").fill("kuala");
  await expect(page.getByRole("option").first()).toContainText(/KUL|Kuala Lumpur/, { timeout: 15_000 });
});

test("signed out: selecting a flight asks to sign in; anonymous reserve API is refused", async ({ page, request }) => {
  const problems = noBrowserErrors(page);
  const revalidateCalls: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("revalidate")) revalidateCalls.push(req.url());
  });
  await page.goto("/flights?from=DAC&to=DXB&depart=2026-12-01&trip=oneway&adults=1&children=0&infants=0&cabin=economy");
  const cards = page.locator("article");
  await expect(cards.first()).toBeVisible({ timeout: 90_000 });
  await cards.first().getByRole("button", { name: /Select/ }).click();
  await expect(page).toHaveURL(/\/login\?next=/, { timeout: 15_000 });
  expect(page.url()).toContain(encodeURIComponent("/booking/fare"));
  expect(revalidateCalls).toEqual([]);

  const refused = await request.post("/api/bookings", {
    data: {
      offerId: "SABRE-x",
      idempotencyKey: crypto.randomUUID(),
      contactEmail: "anon@example.test",
      contactPhone: "+8801700000000",
      expectedTotal: 1,
      travelers: [{ firstName: "A", lastName: "B" }],
    },
  });
  expect(refused.status()).toBe(401);
  expect((await refused.json()).error).toBe("login_required");
  expect(problems).toEqual([]);
});

test("search, sign in, reserve, pay return, and find the booking again", async ({ page }) => {
  test.setTimeout(240_000);
  const problems = noBrowserErrors(page);
  const password = "correct horse battery";
  const address = `book-${stamp}@example.test`;

  // Stub SSLCommerz: pay API returns a local success return URL (core pay is not hit).
  await page.route("**/api/bookings/*/pay", async (route) => {
    const m = route.request().url().match(/\/api\/bookings\/([^/?]+)\/pay/);
    const id = m?.[1] ?? "";
    const origin = new URL(page.url()).origin;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        gatewayUrl: `${origin}/booking/payment/return?status=success&bookingId=${id}`,
        paymentId: "00000000-0000-4000-8000-000000000001",
        tranId: "E2E-TRAN",
        replayed: false,
      }),
    });
  });

  // ---- account (required before reserve — P5-17)
  await page.goto("/login");
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.locator("#email").fill(address);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Create account" }).last().click();
  await expect(page).toHaveURL(/\/my-bookings/, { timeout: 30_000 });

  // ---- results
  await page.goto("/flights?from=DAC&to=DXB&depart=2026-12-01&trip=oneway&adults=1&children=0&infants=0&cabin=economy");
  const cards = page.locator("article");
  await expect(cards.first()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/available flights/)).toBeVisible();
  expect(await page.locator("article").first().innerText()).toMatch(/[৳$€£]\s?\d/); // a price, in whatever currency core returned (BDT for Sabre, USD for the stub)
  expect(await page.locator("body").innerText()).not.toMatch(/Time Remaining/);   // no decorative countdown on search results
  expect(await page.locator("body").innerText()).not.toMatch(/line-through|Partially Refundable|Non Refundable/); // nothing invented

  // ---- reserve: try the first few offers until the airline's system holds one
  let reference = "";
  const outcomes: string[] = [];
  for (let attempt = 0; attempt < 4 && !reference; attempt += 1) {
    await page.goto("/flights?from=DAC&to=DXB&depart=2026-12-01&trip=oneway&adults=1&children=0&infants=0&cabin=economy");
    await expect(cards.first()).toBeVisible({ timeout: 90_000 });
    // The Sabre cert (test) system refuses US-Bangla fares ("CHECK FLIGHT NUMBER": its schedule data is stale), so try other airlines first.
    const candidates = cards.filter({ hasNotText: "US-Bangla" });
    await candidates.nth(attempt).getByRole("button", { name: /Select/ }).click();
    await expect(page).toHaveURL(/\/booking\/fare/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /Confirm your fare/i })).toBeVisible();
    await page.getByRole("button", { name: /Confirm fare/i }).click();
    await expect(page).toHaveURL(/\/booking\/passengers/, { timeout: 15_000 });

    await page.getByRole("button", { name: /Confirm|I understand|Continue|Accept|OK|Got it/i }).first().click().catch(() => undefined);
    await page.locator("#given-0").fill("Sam");
    await page.locator("#surname-0").fill(surname);
    await page.locator("#gender-0").selectOption("male");
    await page.locator("#dob-0").fill("1990-01-15");
    await page.locator("#passport-0").fill("P1234567");
    await page.locator("#expiry-0").fill("2032-01-01");
    await page.locator("#phone").fill("1700000000");
    await page.locator("#email").fill(address);
    await page.getByRole("button", { name: /Reserve seats/ }).click();

    const outcome = await Promise.race([
      page.waitForURL(/\/booking\/payment\/return\?status=success/, { timeout: 60_000 }).then(() => "paid-return"),
      page.waitForURL(/\/booking\/confirmation/, { timeout: 60_000 }).then(() => "held-no-pay"),
      page.getByRole("alert").filter({ hasText: /./ }).first().waitFor({ timeout: 60_000 }).then(() => "refused"),
      page.getByText(/price has changed/).waitFor({ timeout: 60_000 }).then(() => "repriced"),
    ]);
    outcomes.push(outcome === "refused" ? `refused: ${(await page.getByRole("alert").allInnerTexts()).join(" ").trim().slice(0, 120)}` : outcome);
    if (outcome === "paid-return" || outcome === "held-no-pay") {
      reference = (await page.locator("p.text-2xl").first().innerText()).trim();
    }
  }
  expect(reference, `no offer could be held in four attempts (is the supplier test system up?): ${outcomes.join(" | ")}`).toMatch(/^[A-Z0-9]{6}$/);

  // ---- payment return (stubbed gateway) is honest: no fake e-ticket claim until Confirmed
  await expect(page.getByText(/Payment received|Thanks|Seats reserved|Booking confirmed/i)).toBeVisible();
  await expect(page.locator("article").getByText(new RegExp(surname))).toBeVisible();

  // ---- manage booking: a wrong surname reads the same as no booking; the right one finds it
  await page.goto("/manage-booking");
  await page.locator("#ref").fill(reference);
  await page.locator("#lastName").fill("Nobody");
  await page.getByRole("button", { name: "Find booking" }).click();
  await expect(page.getByText(/couldn't find a booking/)).toBeVisible();

  await page.locator("#lastName").fill(surname.toUpperCase());
  await page.getByRole("button", { name: "Find booking" }).click();
  await expect(page.getByText(reference)).toBeVisible();
  await expect(page.getByText(/Reserved — awaiting payment|Confirmed/)).toBeVisible();

  expect(problems.filter((p) => !/^(401|409|400) \/api\/auth\/(login|register)$/.test(p))).toEqual([]);
});

test("signed out: my bookings asks to sign in; the login page offers a password account", async ({ page }) => {
  const problems = noBrowserErrors(page);
  await page.goto("/my-bookings");
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(1);
  await expect(page.getByRole("link", { name: /Forgot your password/ })).toBeVisible();
  await page.getByRole("tab", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(page.locator("#phone")).toBeVisible();
  expect(problems).toEqual([]);
});

test("create an account with a password, then sign out and sign in again", async ({ page }) => {
  const problems = noBrowserErrors(page);
  const address = `acct-${stamp}@example.test`;
  const password = "correct horse battery";

  // an email and a password: the mobile number can stay blank
  await page.goto("/login");
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.locator("#email").fill(address);
  await page.locator("#password").fill("short");
  await page.getByRole("button", { name: "Create account" }).last().click();
  await expect(page.getByRole("alert").filter({ hasText: /at least 8/ })).toBeVisible();   // the form says why before asking the server
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Create account" }).last().click();

  // signed in at once, told to confirm the address
  await expect(page).toHaveURL(/\/my-bookings/, { timeout: 30_000 });
  await expect(page.getByText("Confirm your email address")).toBeVisible();
  await expect(page.getByText("You have no bookings yet.")).toBeVisible();

  // the same address cannot be registered twice
  await page.request.post("/api/auth/logout");
  await page.goto("/login");
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.locator("#email").fill(address);
  await page.locator("#password").fill("another passphrase");
  await page.getByRole("button", { name: "Create account" }).last().click();
  await expect(page.getByRole("alert").filter({ hasText: /already exists/ })).toBeVisible();

  // a wrong password is refused with words that do not say which half was wrong; the right one signs in
  await page.getByRole("tab", { name: "Sign in" }).click();
  await page.locator("#email").fill(address);
  await page.locator("#password").fill("not the password");
  await page.getByRole("button", { name: "Sign in" }).last().click();
  await expect(page.getByRole("alert").filter({ hasText: /do not match/ })).toBeVisible();
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).last().click();
  await expect(page).toHaveURL(/\/my-bookings/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "My bookings" })).toBeVisible();

  // forgot password answers the same for anyone
  await page.request.post("/api/auth/logout");
  await page.goto("/forgot-password");
  await page.locator("#email").fill(`nobody-${stamp}@example.test`);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/If there is an account for that email/)).toBeVisible();
  expect(problems.filter((p) => !/^(401|409|400) \/api\/auth\/(login|register)$/.test(p))).toEqual([]);   // the refused attempts above are the point
});

test("search panel: one way by default, and the dates can never end up backwards", async ({ page }) => {
  await page.goto("/");
  // Visually-hidden native inputs still hold ISO values + min for the calendar panel
  const dates = page.locator('input[type="date"]');
  await dates.first().waitFor();
  await expect(page.getByRole("radio", { name: /one way/i }).first()).toBeChecked();   // Hajee sells one-way only, so this is the search that shows every airline

  await page.getByRole("radio", { name: /round trip/i }).first().check();
  const departure = dates.first();
  const back = dates.nth(1);
  await expect(back).toBeEnabled();
  expect(await departure.getAttribute("min")).toBe(new Date().toISOString().slice(0, 10).replace(/-(\d\d)$/, (m) => m)); // nothing before today
  expect(await back.getAttribute("min")).toBe(await departure.inputValue());                                              // and nothing before the departure

  // moving the departure past the return moves the return with it (a week later), instead of leaving a search that cannot run
  await departure.fill("2027-03-10");
  expect(await back.inputValue()).toBe("2027-03-17");
  await departure.fill("2027-03-01");   // moving it earlier leaves a valid return alone
  expect(await back.inputValue()).toBe("2027-03-17");

  // Visible calendar panel still opens for humans
  await page.getByRole("button", { name: /^Departure$/i }).first().click();
  await expect(page.getByRole("dialog", { name: /choose departure/i })).toBeVisible();
});

test("results: sort tabs, filters and Reset respond; the date strip searches another day", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/flights?from=DAC&to=DXB&depart=2026-12-12&trip=oneway&adults=1&children=0&infants=0&cabin=economy");
  const cards = page.locator("article");
  await expect(cards.first()).toBeVisible({ timeout: 120_000 });
  const total = async () => Number((await page.getByText(/available flights/).first().innerText()).match(/\d+/)![0]);
  const all = await total();
  expect(all).toBeGreaterThan(1);

  // On a phone the filters live in a sheet opened by the "Filters" button; on a desktop they are the left column.
  const phone = await page.getByRole("button", { name: "Filters" }).isVisible();
  const panel = phone ? page.getByRole("dialog") : page.locator("aside").first();
  const openFilters = async () => { if (phone && !(await panel.isVisible())) await page.getByRole("button", { name: "Filters" }).click(); };
  const resetFilters = async () => { await openFilters(); await panel.getByRole("button", { name: "Reset" }).first().click(); };

  // connections
  await openFilters();
  await panel.getByLabel("Non-stop").check();
  await expect.poll(total).toBeLessThanOrEqual(all);   // (a search whose flights are all non-stop stays the same size)
  for (const card of await cards.all()) await expect(card).toContainText("Non-Stop");   // every card shown really is non-stop
  await resetFilters();
  await expect.poll(total).toBe(all);

  // an airline
  await openFilters();
  await panel.getByRole("checkbox").nth(3).check();
  await expect.poll(total).toBeLessThan(all);
  await resetFilters();
  await expect.poll(total).toBe(all);

  // checked baggage: ticking two weights keeps fares with either; ticking none shows everything
  await openFilters();
  await panel.getByRole("button", { name: "Bags" }).click();
  const bagOptions = panel.getByRole("checkbox", { name: /kg checked bag/ });
  if (await bagOptions.count()) {
    await bagOptions.first().check();
    await expect.poll(total).toBeLessThanOrEqual(all);
    if ((await bagOptions.count()) > 1) await bagOptions.nth(1).check();
    await expect.poll(total).toBeLessThanOrEqual(all);
    await resetFilters();
    await expect.poll(total).toBe(all);
  }

  // budget: dragging the slider to its lowest setting leaves only what costs less than that (nothing, in practice)
  await openFilters();
  const slider = panel.locator('input[type="range"]');
  await slider.evaluate((el, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(el, String(v));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, await slider.getAttribute("min"));
  await expect(page.getByText(/No flights match your filters/)).toBeVisible();
  await resetFilters();
  await expect.poll(total).toBe(all);
  if (phone) await page.keyboard.press("Escape"); // close the sheet

  // sorting: cheapest puts the lowest price first, and the price shown never goes down the list
  await page.getByRole("tab", { name: /Cheapest/ }).click();
  const prices = async () => (await cards.allInnerTexts()).map((t) => Number(t.match(/[৳$€£]\s?([\d,]+(?:\.\d+)?)/)![1].replace(/,/g, "")));
  const cheapest = await prices();
  expect(cheapest).toEqual([...cheapest].sort((a, b) => a - b));

  // the date strip searches another day
  await page.getByRole("option").nth(6).click();
  await expect(page).toHaveURL(/depart=2026-12-1[13]/);
  await expect(cards.first()).toBeVisible({ timeout: 120_000 });
});

test("simple password rules: no capital/digit/symbol demands, but the easy-to-guess ones are refused", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.locator("#email").fill(`common-${stamp}@example.test`);
  await page.locator("#password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).last().click();
  await expect(page.getByRole("alert").filter({ hasText: /too easy to guess/ })).toBeVisible();
  await page.locator("#password").fill("blue tiger lamps");   // plain lower-case words: fine
  await page.getByRole("button", { name: "Create account" }).last().click();
  await expect(page).toHaveURL(/\/my-bookings/, { timeout: 30_000 });
});

test("a few wrong passwords bring up the quiet check, and the sign-in goes through by itself", async ({ page }) => {
  const address = `check-${stamp}@example.test`;
  const password = "purple river stones";
  await page.goto("/login");
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.locator("#email").fill(address);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Create account" }).last().click();
  await expect(page).toHaveURL(/\/my-bookings/, { timeout: 30_000 });
  await page.request.post("/api/auth/logout");

  await page.goto("/login");
  for (let i = 0; i < 3; i += 1) {
    await page.locator("#email").fill(address);
    await page.locator("#password").fill(`wrong ${i}`);
    await page.getByRole("button", { name: "Sign in" }).last().click();
    await expect(page.getByRole("alert").filter({ hasText: /do not match/ })).toBeVisible();
  }
  // now the right password: the site asks for the check on its own and finishes the sign-in when it passes (nothing for the person to do)
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).last().click();
  await expect(page).toHaveURL(/\/my-bookings/, { timeout: 30_000 });
});

test("pages that used to be mockup content are honest", async ({ page }) => {
  for (const path of ["/faq", "/about", "/services", "/privacy", "/terms", "/refund-policy", "/contact"]) {
    await page.goto(path);
    const text = await page.locator("body").innerText();
    expect(text, path).not.toMatch(/mockup|simulated|demo (site|refund|data)|placeholder/i);
  }
  await page.goto("/booking/payment");
  await expect(page).toHaveURL(/\/$/); // old mock payment URL — real checkout is SSLCommerz after reserve
});
