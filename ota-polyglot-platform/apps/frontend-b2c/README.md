This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Browser tests (Playwright)

`npm run e2e` drives the storefront in a real browser (desktop Chrome and a Pixel 7) against a running stack: home page, airport typeahead,
search -> results -> traveller details -> reserve -> confirmation -> manage booking, and the signed-out pages.

- Default target is `http://localhost:3001` (the compose stack; the local `.env` sets `STOREFRONT_HOST_OVERRIDE=b2c.localhost` so that host is looked up as the consumer tenant). Do not browse via `b2c.localhost` itself: inside the container it does not resolve, so Next's image optimiser hangs and pages never finish loading. Override with `B2C_BASE_URL`.
- First time: `npx playwright install chromium`.
- **Run it against core's built-in stub supplier for a reliable result** (no `SABRE_*` / `HAJEE_*` credentials): the suppliers' own test
  systems refuse many offers (the Sabre cert schedule is stale, Hajee's hold endpoint errors), which fails the reserve step for reasons that
  are not the storefront's. Locally: `docker compose --env-file .env --env-file stub.env up -d core-engine` with a `stub.env` that blanks those variables.
- Core limits bookings per client address and per email. The tests send a different `X-Forwarded-For` each run, so the stack needs
  `TRUST_FORWARDED_FOR=true` (local `.env` only; in production set it only behind a proxy that overwrites the header).
- Payment is not built, so nothing here pays.

## Search: quick airlines first, slow ones added when ready

The results page runs two searches at once (`/api/search` with `speed: "fast"` and `speed: "slow"`). Core decides which suppliers are which
(`ISupplierProvider.IsSlowSearch`; Hajee Air is slow). The quick airlines' fares are shown as soon as they arrive (a few seconds); the slow ones
have their own, longer limit (45 s in core, 55 s here) and are added to the list when they arrive, with a "Checking a few more airlines…" note
meanwhile. If a slow airline fails or runs out of time the list says so and offers "Search again". Supplier names never reach the browser.
