# OTA Polyglot Platform

Production-oriented boilerplate for a multi-tenant Online Travel Agency serving three channels from one deployment: direct consumers (B2C), agencies and sub-agents (B2B), and white-label tenant storefronts. The stack is deliberately polyglot — .NET 10 for the transactional core, Next.js for the tenant-aware edge, Python FastAPI for AI and personalization — connected by gRPC, a Postgres transactional outbox, and Redis.

## Architecture at a glance

```
                        ┌─────────────────────────────────────────┐
   Host / X-Api-Key ───▶│  frontend-nextjs (edge middleware)      │
                        │  resolves TenantContext, stamps headers │
                        │  X-Tenant-ID / X-Channel / X-Agent-Tier │
                        └──────────────┬──────────────────────────┘
                                       │ REST (BFF) + gRPC
                        ┌──────────────▼──────────────────────────┐
                        │  core-engine-dotnet (.NET 10)           │
                        │  bookings · agent credit ledger ·       │
                        │  tier markup rules · idempotent checkout│
                        │  EF Core + Postgres (row-level tenancy) │
                        │  Redis availability cache               │
                        └───────┬───────────────────┬─────────────┘
                                │ Postgres outbox   │
                 booking-created│ agent-credit-     │
                                │ deducted          │
                        ┌───────▼───────────┐       │
                        │ ai-engine-python  │◀──────┘ (REST when needed)
                        │ profile ingestion │
                        │ itinerary + dyn.  │
                        │ pricing heuristics│
                        └───────────────────┘
```

The pricing formula implemented in `PricingCalculator.cs` and used for every quote and booking is: **Final Price = Supplier Net Rate × (1 + Agent Markup) + Sub-Agent Margin**. Markup percent is resolved from tenant-scoped, tier-based `MarkupRules`; the sub-agent margin defaults from the rule and can be overridden per booking.

## Repository layout

```
/ota-polyglot-platform
├── apps/
│   ├── frontend-nextjs/       # Multi-tenant storefront + BFF (Next.js 15, React 19)
│   ├── core-engine-dotnet/    # .NET 10 booking engine, B2B ledger, gRPC + REST
│   └── ai-engine-python/      # FastAPI, Postgres outbox poller, itinerary engine
├── shared/protos/ota.proto    # Single source of truth for gRPC contracts
├── docker-compose.yml         # Postgres, Redis, 3 services
├── Makefile                   # up / down / logs / smoke / seed-check
└── .env.example               # Copy to .env before first run
```

## Quick start

Prerequisites: Docker with Compose v2. Nothing else is required — all builds happen inside containers.

```bash
cp .env.example .env
make up            # or: docker compose up --build -d
make smoke         # health of all three services
make logs          # tail everything
```

Service endpoints once healthy: frontend at http://localhost:3000, core engine REST/Swagger at http://localhost:8080/swagger, core engine gRPC on localhost:8081 (h2c), AI engine OpenAPI at http://localhost:8000/docs.

On first boot the core engine creates the schema and seeds a demo tenant (`demo-tenant`) with a Gold agency, one sub-agent, and markup rules for all four tiers. Run `make seed-check` to print the seeded agents. In Development it also seeds the tenant registry (`localhost`, `127.0.0.1`, and the `skybridge.example.com` white-label host, wired to the seeded agency automatically) — see below.

## Tenant and white-label resolution

`apps/frontend-nextjs/middleware.ts` runs at the edge for every request and resolves the tenant in strict precedence: a valid `X-Api-Key` maps to a B2B agency context; otherwise the `Host` header is looked up in core-engine's **tenant registry** (`GET /api/v1/tenant-registry/resolve`, cached briefly). A host that isn't registered gets 404 — there is no default-tenant fallback — and if core can't be reached and the host isn't cached the answer is 503. An invalid API key is rejected with 401, never downgraded to a host tenant. Demo API keys only work when `ENABLE_DEMO_API_KEYS=true` (default in local compose; **set it to `false` in any real deployment** — the demo key is public in this repo). The resolved context is stamped onto the request as `X-Tenant-ID`, `X-Channel`, `X-Agent-ID`, and `X-Agent-Tier`, which every downstream call (see the BFF handler in `app/api/search/route.ts`) forwards verbatim. B2B and white-label hosts are rewritten from `/` to the `/agent` portal layout, so one codebase renders both consumer and agent experiences with per-tenant branding pulled from the same context.

To simulate a white-label domain locally, add `127.0.0.1 skybridge.example.com` to `/etc/hosts` and open http://skybridge.example.com:3000 — the header, portal layout, and downstream markup tier all switch. To simulate a B2B API consumer, send `X-Api-Key: demo-b2b-key` to any frontend route.

### Adding a tenant or domain

Tenants are data, not code. `scripts/provision-tenant.sh` (or `make tenant-add ARGS='…'`) inserts or updates a tenant and one domain; frontends see it within about a minute. `make tenants` lists what is registered. Run `scripts/provision-tenant.sh --help` for the flags, e.g.:

```bash
scripts/provision-tenant.sh --tenant-id aerotake-b2c --name "AeroTake B2C" --currency BDT \
  --host aerotake.example --channel B2C --brand AeroTake \
  --logo /images/verticle_logo_1.png --primary "#0B3D5C" --accent "#F2A104"
```

The tenant's `--currency` is the currency it sells in. Set `TENANT_REGISTRY_KEY` (same value on core-engine and the frontends) to require a key on the registry endpoint outside local dev.

## Token signing keys

Access and refresh tokens are signed with **ES256** (ECDSA P-256) by core-engine alone. The frontends hold no secret: they fetch the public keys from core's `/.well-known/jwks.json` and can verify a token but never mint one. Keys are grouped by audience (`ota-agents`, `ota-customers`, `ota-internal`); a key only ever validates tokens for its own audience.

- **Local dev:** leave `JWT_SIGNING_KEYS` empty and core generates ephemeral keys — every session ends when core restarts. For stable local sessions run `scripts/generate-jwt-keys.sh --write-env` once.
- **Anywhere else:** `JWT_SIGNING_KEYS` is required (core refuses to start without it). Generate it with `scripts/generate-jwt-keys.sh`, store it like a password, and give it to core-engine only.
- **Rotating a key:** generate a new key for the audience and make it `active`; keep the old entry but replace its value with the **public** key (`openssl pkey -in old.pem -pubout -outform DER | base64 | tr -d '\n'`) so tokens it already signed keep verifying. Remove the old entry after 30 days (the refresh-token lifetime). Frontends pick the new key up on their own.
- **Revoking a compromised key:** remove it from `JWT_SIGNING_KEYS` and restart core — core stops accepting it immediately. Frontends keep trusting a removed key for up to 5 minutes (their JWKS cache), so restart them too if that matters.

## gRPC authentication

Every gRPC call to core-engine is authenticated, and **who the caller is comes from the credential, never from the request message**.

| Caller | Credential | May call |
|---|---|---|
| A logged-in agent | their own access token (audience `ota-agents`) | everything; tenant, agent and channel come from the token |
| A frontend acting for a logged-out visitor | a **service token** (audience `ota-internal`) | search and revalidate only, for the tenants and channels its client is configured for; never booking or ticketing |

The `TenantContext` message is kept for wire compatibility but is not trusted: for a logged-in agent a tenant or agent that disagrees with the token is rejected (`PERMISSION_DENIED`), and the message's channel and tier are ignored (pricing always uses the agent's stored tier). Every RPC declares an explicit policy, and a test fails the build if a new one doesn't.

**Service credentials.** Each frontend has a client id and secret and exchanges them for a 10-minute service token at `POST /api/v1/auth/service/token`. Which clients exist, and their scopes, channels and tenants, is `SERVICE_CLIENTS` on core-engine (it stores only a SHA-256 of each secret). `make up` generates dev values into `.env`; for anything else run `scripts/generate-service-clients.sh`. A leaked frontend secret can read prices for its allowed tenants and nothing else: it can't book, and can't mint tokens. Revoke or rotate it by editing that client's entry.

Port 8081 is published on the loopback interface only. Because a caller can't claim an agent identity without a token, the demo `X-Api-Key` no longer prices gRPC search at the demo agency's tier; real API-key access for B2B consumers is a separate feature.

## Core engine (.NET 10)

### Customer sign-in (B2C)

Consumers sign in with Google — no passwords, no OTP. The storefront gets a Google ID token in the browser and sends it to `POST /api/v1/auth/customer/social` (with `X-Tenant-ID`); core **verifies it itself** (Google's published keys, issuer, that it was issued for *this* platform's client id, expiry, and the nonce if one is sent), then finds or creates the customer and issues its own tokens (audience `ota-customers`, signed with the customers key). `POST …/refresh` rotates the pair (a used refresh token is dead, and two simultaneous refreshes can't both win), `POST …/logout` revokes it, and `GET /api/v1/customers/me` returns the customer's own account. An agent token is refused on customer endpoints and a customer token on agent ones.

Account rules: a customer belongs to one tenant, so the same Google account on two brands is two customers. A new Google account joins an existing customer **only** through an email both sides have verified; an unverified email is never a reason to link. Set `GOOGLE_CLIENT_IDS` to enable it — until then the endpoint answers `503 provider_not_configured`. Register the Google OAuth app under a **company** Google account.

**Email and password accounts** sit beside social sign-in (`/api/v1/auth/customer/{register,login,verify-email,forgot-password,reset-password}`). Registering needs a name, an email and a password and signs the customer in at once, but the email starts **unconfirmed**: only a confirmed address can join earlier guest bookings or a later Google login, so nobody can register with someone else's address and reach their bookings. Confirmation and reset are emailed single-use links (256-bit, stored as a hash; 48 h and 1 h); a reset also confirms the address and ends every session of that customer. Wrong email and wrong password get the same answer and the same time; repeated failures lock an address (8 per 15 min, from anywhere) and a client (10 per 10 min). Passwords are BCrypt, 8 to 72 bytes. Set `STOREFRONT_PUBLIC_URL` (dev: `http://localhost:3001`) so emailed links point at the site; without it they use the tenant's registered host. Email needs `SMTP_HOST` — without it the links are not delivered (dev).

**Keeping it simple for customers.** The password rule is one line: 8 or more characters and not one attackers try first (a built-in list of common passwords plus patterns such as "password123", "12345678", "qwerty…", repeated characters and runs) — no capital/digit/symbol demands, and no OTP. A short sentence is fine. A CAPTCHA (Cloudflare Turnstile, which shows nothing to most people) is required to register and to ask for a reset link, and to sign in only **after 3 failed attempts** for that address or from that client; the sign-in page then finishes the attempt by itself once the check passes. Set `TURNSTILE_SITE_KEY` (storefront) and `TURNSTILE_SECRET` (core); the local `.env` uses Cloudflare's always-pass test keys — replace them with your own site's keys before launch. With no secret the check is off. If the check is on and Cloudflare cannot be reached, requests are refused (it fails closed).

**Facebook** works the same way (`provider: "facebook"`, the OpenID Connect ID token from Facebook Login / Limited Login) and is enabled by `FACEBOOK_APP_IDS`. One difference, on purpose: an email from Facebook is never treated as verified (its token has no `email_verified` claim, and a profile email is not proof of ownership), so a Facebook login never links to an existing customer and starts without an email until one is confirmed. Register the Meta app under a **company** Meta Business account; production use needs Meta app review, which has lead time — start it early.

### Transactional email (B2C bookings)

Core sends plain-text booking mail through the same `SMTP_*` settings as alerts (`IEmailSender` / `SmtpEmailSender`):

| When | Subject cue |
|---|---|
| Seats held after reserve | Booking held |
| IPN marks payment Paid | Payment received |
| Ticket issued / booking Confirmed | Your e-ticket |
| Unpaid hold nearing deadline | Pay soon — hold expiring |
| Payment failed or ticket/refund failure | Update on booking |

Links use `STOREFRONT_PUBLIC_URL` (else `https://{tenant B2C host}`). A send failure is logged and alerted; it does **not** roll back the booking, payment, or ticket. Local `docker compose` includes **Mailpit** (`SMTP_HOST=mailpit`, port `1025`, UI `http://localhost:8025`). Staging/production should override with a real SMTP or ESP (SendGrid/SES/etc), set `SMTP_USE_TLS=true` on port 587, and align `SMTP_FROM` with the brand content in P5-12. Hold reminders: `B2C:HoldReminderMinutesBefore` (default 10), disable with `B2C:HoldReminderEnabled=false`.

### Payments (SSLCommerz)

B2C checkout uses SSLCommerz hosted pages — card data never hits our servers. Signed-in customer calls `POST /api/v1/customers/me/bookings/{id}/pay` with an optional `idempotencyKey`; core creates a Payment + PaymentAttempt, calls `gwprocess/v4/api.php`, and returns `gatewayUrl` for the browser redirect. Success/fail/cancel URLs point at the storefront BFF `POST /api/payments/sslcommerz/browser-return` (SSLCommerz posts `val_id` there; the BFF forwards to core IPN then 303s to the UI). Server IPN remains `POST /api/v1/payments/sslcommerz/ipn` on core (`SSLCOMMERZ_CORE_PUBLIC_URL` — localhost needs a live tunnel). Either path marks the payment **Paid**, then `PaidBookingCompleter` issues the supplier ticket and sets the booking **Confirmed**. If ticketing fails (or the hold already expired), core initiates a gateway refund and marks the booking **Failed** / payment **Refunded**.

Env on core-engine (see `docker-compose.yml`):

| Variable | Purpose |
|---|---|
| `SSLCOMMERZ_STORE_ID` | Merchant store id (sandbox default is set in compose) |
| `SSLCOMMERZ_STORE_PASSWORD` | Store password — set in local `.env` only; never commit |
| `SSLCOMMERZ_IS_SANDBOX` | `true` (default) → `sandbox.sslcommerz.com` |
| `STOREFRONT_PUBLIC_URL` | Browser return base (e.g. `http://localhost:3001`) |
| `SSLCOMMERZ_CORE_PUBLIC_URL` | Public core origin for IPN; localhost needs a tunnel |

Sandbox methods enabled for this merchant should be confirmed in the SSLCommerz panel (cards + local wallets as configured). Refunds use the Refund table later (P4-5 / P5-20).

### Abuse limits on the anonymous consumer endpoints

Guest lookup, "email me a link", customer sign-in/refresh and the service-token endpoint are open to the internet, so each is rate limited (sliding windows in Redis, atomic, keys hashed so no email or reference is stored in clear). Limits are in `RateLimiting/AbuseLimits.cs`; `RateLimiting:Enabled=false` switches them off (tests only).

The limit that protects bookings is **per reference, on failures**: however many addresses guess from, one reference gets 5 wrong surnames per 15 minutes; correct lookups never count. "Email me a link" has a visible per-IP limit (429) and **silent** per-address and per-booking limits (still 202, nothing sent), so a stranger cannot flood someone's inbox and cannot probe which addresses or references exist. If Redis is down the limits **fail closed** (503).

Per-IP limits need the real client address. Core sits behind the storefront's server, so that server must send it as `X-Forwarded-For`; core believes the header only from `TRUSTED_PROXY_NETWORKS` (default: loopback and private ranges).

### Module structure

core-engine is one deployable organised into modules by namespace. The gRPC service is only an adapter; the logic lives in application services that take a `Caller` and speak no transport (business failures are `ServiceException`s, mapped to gRPC status codes in one place, `ServiceExceptionInterceptor`).

| Module | What it owns |
|---|---|
| `SharedKernel` | `Caller`, `ServiceException`, shared error messages |
| `Search` | `ISearchService`: availability search, offer revalidation |
| `Bookings` | `IBookingService`: reserve, then pay-and-ticket |
| `Pricing` | `PricingCalculator`, `MarkupResolver` (which tier and rule price a call) |
| `Ledger` | `AgentCreditService`: the agent credit ledger |
| `Payments` | `IPaymentGateway` / SSLCommerz hosted checkout; Payment / PaymentAttempt / Refund |
| `Suppliers` | `ISupplierProvider` and the Sabre / Hajee / stub adapters; knows nothing about the database |
| `Messaging` | the transactional outbox |
| `Auth`, `Tenancy` | tokens, keys, service clients; tenant resolution |
| `Grpc`, `Controllers` | transport adapters (leaves: nothing depends on them) |

The boundaries are enforced, not conventional: `ArchitectureTests` fail the build if, say, `Suppliers` touches the database, `Search` reaches into `Bookings`, or any service depends on the gRPC/HTTP transport. `Data`/`Domain` (one `OtaDbContext`) are still shared by all modules; splitting them per module, and then into separate projects, is planned (P2-2, P1-6). A second channel (B2C) adds its own flow on top of these services instead of copying a handler.

The service listens on two ports: 8080 for REST (agent credit, ledger, booking lookup, health, Swagger) and 8081 for gRPC implementing `OtaCoreService` from `shared/protos/ota.proto` with `GetSupplierAvailability` and `ProcessB2BBooking`.

Multi-tenancy is enforced structurally, not by convention: every entity carries a `TenantId`, and `OtaDbContext` applies a global query filter bound to the scoped `ITenantAccessor`, so a service simply cannot query across tenants by forgetting a `Where` clause. HTTP requests populate the accessor via `TenantResolutionMiddleware` (which rejects tenant-less requests); gRPC requests populate it from the `TenantContext` message.

### Database schemas

One database, one `OtaDbContext`, but each module's tables live in their own Postgres schema (`Data/Schemas.cs`): `identity_agents` (Agents, Users, UserDevices, VerificationCodes), `identity_customers` (Customers, CustomerIdentities, GuestClaimTokens, RevokedTokens), `pricing` (MarkupRules, AgentTierProfiles, ExchangeRates), `ledger` (LedgerEntries), `booking` (Bookings), `payments` (Payments, PaymentAttempts, Refunds), `messaging` (OutboxEvents), `tenancy` (Tenants, TenantDomains); Airports/Airlines stay in `public`. ExchangeRates are global (no tenant filter) even though they live in `pricing`. Raw SQL must name the schema — that is `AgentCreditService`, `CustomerSessions`, the Makefile helpers, `scripts/provision-tenant.sh`, and the ai-engine outbox poller (`SELECT_PENDING_SQL` / `MARK_PROCESSED_SQL` in `outbox_poller.py`). `OutboxPollerContractTests` reads those two statements from the poller's source and runs them against the migrated database, so a table or column change that would break the ai-engine fails core-engine's build. Deploy order does not matter: whichever service is out of date retries until the other catches up (the poller logs "table not found yet").

The B2B booking pipeline in `OtaCoreGrpcService.ProcessB2BBooking` is: idempotency replay check → agent lookup → markup rule resolution → server-side re-pricing from the supplier net rate (client-sent prices are never trusted) → booking persisted as Pending → credit verification and atomic ledger debit (`AgentCreditService`, serializable transaction with optimistic-concurrency retry to prevent double-spend) → status Confirmed → `booking-created` and `agent-credit-deducted` events written to the `OutboxEvents` table in the same `SaveChangesAsync` call as the status change, so an event can never be lost after that commit. A credit rejection returns `BOOKING_STATUS_REJECTED_CREDIT` with the available balance and leaves an auditable Pending→Rejected record.

Availability searches are cached in Redis for 90 seconds under keys that include tenant, channel, tier and sell currency, because two tenants running the same search must see different sell prices. Supplier amounts are converted into the tenant's `SellCurrency` via `pricing.ExchangeRates` before markup (P4-10); the request's currency label is ignored. **Ops pricing config:** markup rules are per-tenant via PlatformAdmin `GET|POST|PUT /api/v1/markup-rules` (and activate/deactivate); FX rates are global via PlatformAdmin `GET|POST|PUT|DELETE /api/v1/exchange-rates` (P4-11; soft-close on DELETE); tenant sell currency is set at provision time (`scripts/provision-tenant.sh` / `Tenants.SellCurrency`). Supplier fan-out is stubbed deterministically (`SupplierStub`) so the whole pipeline runs without GDS credentials; replace it with real adapters behind the same seam.

Event publishing goes through `IBookingEventProducer` (`apps/core-engine-dotnet/src/Messaging/OutboxBookingEventProducer.cs`), which is the only thing `OtaCoreGrpcService` talks to — swapping the outbox for Kafka, Redis Streams, or a managed queue later means implementing that one interface differently, with zero booking/ledger logic changes.

## Database migrations (core engine)

Schema changes are managed with EF Core migrations, applied automatically on
service startup (`Database:AutoMigrate`, default `true` — a migration failure
now fails startup rather than silently continuing). First-time setup:

    cd apps/core-engine-dotnet
    dotnet tool restore

Common commands, run from `apps/core-engine-dotnet/src/`:

    dotnet ef migrations add <Name>                # scaffold a new migration
    dotnet ef migrations list                      # show applied + pending
    dotnet ef database update                      # apply all pending migrations
    dotnet ef database update <PreviousMigration>   # roll back to a specific point
    dotnet ef migrations remove                     # drop the last *unapplied* migration

These are safe to run on the host while `make up` has core-engine in hot-reload
mode: `Directory.Build.props` keeps the container's `obj`/`bin` under `/tmp`
inside the container (T-3), so host restores no longer rewrite the watch
process's `project.assets.json`.

**Resetting a local dev database:** if you have a database created before this
change (via the old `EnsureCreated`), it has no migration history and `dotnet
ef database update` / app startup will fail trying to recreate existing
tables. This boilerplate has no production data yet, so the fix is a clean
baseline, not a compatibility shim: `make clean && make up`.

## AI engine (Python 3.11 / FastAPI)

A Postgres outbox poller (`app/outbox_poller.py`) runs inside the FastAPI lifespan, reading `booking-created` rows from the core engine's `OutboxEvents` table via a small polling query (`SELECT ... WHERE "ProcessedAt" IS NULL ... FOR UPDATE SKIP LOCKED`) woken early by a `LISTEN/NOTIFY` connection, and survives database unavailability with exponential backoff (important during parallel compose startup, and while a fresh database hasn't been migrated yet). Each event updates a tenant-partitioned subject profile (bookings, spend, preferred suppliers) which drives a budget-band classification (value / comfort / premium).

`POST /api/v1/recommendations/itinerary` accepts a destination, start date, nights, and either a `user_id` (B2C) or `agent_id` (B2B), reads the tenant from `X-Tenant-ID`, and returns a day-by-day itinerary tuned to the subject's budget band plus a dynamic-pricing factor the core engine can apply as a conversion incentive. Generation is deterministic per subject and destination so it is testable; the `ItineraryEngine.generate` method is the seam where an LLM or learned ranker plugs in without changing the API contract.

Example request:

```bash
curl -s http://localhost:8000/api/v1/recommendations/itinerary \
  -H 'Content-Type: application/json' -H 'X-Tenant-ID: demo-tenant' \
  -d '{"destination":"kyoto","start_date":"2026-09-10","nights":3,"user_id":"u-42"}'
```

## Eventing and caching

`booking-created` and `agent-credit-deducted` are rows in core engine's `OutboxEvents` Postgres table (see `AddOutboxEvents` migration), not messages on a broker — no extra infrastructure to run, and the write is atomic with the booking it announces. ai-engine-python drains that table directly via raw SQL; see [`apps/ai-engine-python/app/outbox_poller.py`](apps/ai-engine-python/app/outbox_poller.py) for the poll/LISTEN split. Redis serves the hot availability cache (LRU-capped at 256 MB) and is available to the AI engine on database 1 for future profile persistence.

## Testing the pipeline end to end

With the stack up and `grpcurl` installed, run a B2B booking against the seeded Gold agency (substitute the GUID from `make seed-check`):

```bash
grpcurl -plaintext -proto shared/protos/ota.proto -d '{
  "tenant": {"tenant_id":"demo-tenant","channel":"CHANNEL_TYPE_B2B_AGENT",
             "agent_id":"<AGENT-GUID>","agent_tier":"AGENT_TIER_GOLD","currency":"USD"},
  "offer_id": "AMADEUS-demo",
  "idempotency_key": "test-001",
  "contact_email": "ops@skybridge.example",
  "travelers": [{"first_name":"Aisha","last_name":"Rahman","document_type":"PASSPORT","document_number":"P1234567"}]
}' localhost:8081 ota.v1.OtaCoreService/ProcessB2BBooking
```

You should see a confirmed PNR with the full price breakdown (net 220 × 1.06 + 10 = 243.20 for Gold tier), the ledger debit reflected in `GET /api/v1/agents/<id>/credit` on port 8080, and within a few seconds the AI engine logging the ingested event (woken almost immediately via Postgres `LISTEN/NOTIFY`, with a 5s poll as backstop) — visible in `make logs` and in its `/healthz` counter. Replaying the same idempotency key returns the original confirmation without a second debit; exhausting the credit limit returns `BOOKING_STATUS_REJECTED_CREDIT`.

## Production hardening checklist

The boilerplate makes pragmatic simplifications that are documented at their seams: replace the in-memory tenant registry with a control-plane API cached at the edge; replace the supplier stub with real adapters under per-supplier timeouts and circuit breakers; add authentication (the tenant headers must be stamped by trusted infrastructure only — strip them from external traffic at the load balancer); externalize the AI profile store to Redis or Postgres with pgvector; and, if volume or multi-consumer fan-out ever outgrows the Postgres outbox, swap `IBookingEventProducer`'s implementation for Kafka/Redis Streams/a managed queue — no booking or ledger logic changes required.
