# B2C Channel — Architecture & Data Separation Plan

**Created:** 2026-09-24 · **Status:** Proposed (needs sign-off on the decisions in §2 before Phase 1 starts)
**Reference:** [2026-08-29-b2b-v1-project-plan.md](2026-08-29-b2b-v1-project-plan.md) — B2B v1 is the baseline this builds on; nothing here changes its scope or dates.

## 1. Goal and non-goals

**Goal:** add a consumer (B2C) storefront to this platform as a second channel over the *same* core engine, suppliers and database, with identity, data ownership and payments separated cleanly enough that B2B and B2C never share code paths by accident.

**Non-goals (deliberately deferred):**
- Splitting core-engine into multiple deployables. Modules stay in one process (see §2, D1).
- Extracting a supplier/search service. Trigger criteria in §8.
- Hotels/cars/packages for B2C. Flights only, same as B2B v1.
- Loyalty and multi-brand shared customer identity. (Social login is **in** scope — it is the customer login method, see Q4.)

## 2. Decisions (please confirm or change — everything below assumes these)

| # | Decision | Why |
|---|---|---|
| D1 | **One repo, one core-engine, one Postgres.** B2C is a new Next.js app + new core modules, not a second backend. | Suppliers, pricing and booking rules must not be duplicated. Booking → debit/payment → outbox stays transactional. |
| D2 | **One tenant per business/brand, not per user.** B2C gets its own tenant (proposed `aerotake-b2c`); B2B keeps `demo-tenant`. | Tenant = the hard isolation boundary. Separate tenants mean B2B and B2C share *no rows* except global reference data (airports, airlines). |
| D3 | **Two identity types, one token contract.** `Users` (agents/staff) unchanged; new `Customers` aggregate. Both login flows issue a JWT with `tenant_id`, `channel`, `actor_type`. | Different onboarding, login, risk and ownership. A `UserType` column on `Users` is the classic patch-up trap. |
| D4 | **Token is the only source of tenant/channel.** Header-supplied `X-Channel` / `X-Tenant-ID` are ignored on authenticated routes. | See §3 finding F1 — today this is not true. |
| D5 | **Separate money paths.** B2B keeps `AgentCreditService`/`LedgerEntry`. B2C gets a `Payments` module (gateway, attempts, refunds). Neither touches the other's tables. | A consumer has no credit line; a ledger is not a payment record. |
| D6 | **B2C never receives net rate / markup / margin.** Enforced by a server-side response mapper in core. | The B2C app must not be the thing that hides fields. |
| D7 | **Postgres schema per module** inside the one database; modules never join across each other's tables. | Makes a later database split a connection-string change. |

## 3. Current state — findings from the code (2026-09-24)

| # | Finding | Where | Consequence |
|---|---|---|---|
| F1 | On **authenticated** requests, `tenant_id` comes from the JWT but `Channel` and `AgentTier` still come from request headers, defaulting to `"B2C"`. | `Tenancy/TenantContext.cs` (authed branch) | Any caller with a valid token can claim any channel/tier. Must be fixed before a consumer token exists. |
| F2 | JWT carries `sub`, `tenant_id`, `role`, `agent_id` — no `channel`/`actor_type`. Single signing key + audience. | `Auth/JwtTokenService.cs` | Consumer and agent tokens would be interchangeable. |
| F3 | gRPC service has no auth of its own; tenant comes from the `TenantContext` message. Frontend gates the two money routes. **Resolved by P0-11/12/13 (2026-09-24): every RPC authenticated; identity from the token; service tokens for anonymous search.** | `Grpc/OtaCoreGrpcService.cs`, README | A second frontend means a second caller that can claim any tenant over gRPC. |
| F4 | `Booking` already has nullable `AgentId`, `CustomerEmail`, `SubAgentId`. No `Channel`, no `CustomerId`, no ownership constraint. | `Domain/Entities.cs` | Cheap to extend now; expensive once B2C rows exist. |
| F5 | `MarkupRule` is keyed by `AgentTier` only. | `Domain/Entities.cs` | B2C has no tier; needs a channel-keyed rule. |
| F6 | Payment path is `AgentCreditService` only. No payment/customer code exists. | grep of `src/` | Payments is net-new. |
| F7 | One `OtaDbContext` for everything; all tables in the default schema. ai-engine reads `OutboxEvents` via raw SQL. | `Data/OtaDbContext.cs`, `outbox_poller.py` | Moving tables to per-module schemas must update the poller in the same change. |
| F8 | `OtaCoreGrpcService` takes 8 dependencies and builds the availability cache key itself. | `Grpc/OtaCoreGrpcService.cs` | B2C would otherwise copy `ProcessB2BBooking` into a second handler. |
| F9 | Supplier cache keys `sabre:offer:{offerId}` / `sabre:pnr-groups:{pnrId}` carry no tenant, and B2B + B2C will share one Sabre account. **Not yet verified** whether booking checks offer ownership. | `Suppliers/SabreProvider.cs` | Possible cross-tenant booking of another tenant's offer. Tasks P0-7/P0-8. |
| F10 | `JWT_SIGNING_KEY` (symmetric HMAC) is shared with the frontend. **Resolved by P0-10 (2026-09-24): ES256, private keys in core only, frontends verify via JWKS.** | `docker-compose.yml`, `JwtTokenService` | Any holder can mint tokens for any tenant/role; a second frontend adds another holder. Task P0-10. |

## 4. Target data-separation architecture

Three layers, each answering a different question:

| Layer | Question | Mechanism |
|---|---|---|
| **Tenant** | Which business's data? | `TenantId` on every row + EF global query filter (exists). `tenant_id` claim. |
| **Channel** | Which pricing/permission rules? | `channel` claim; `Channel` column on bookings and pricing rules. |
| **Ownership** | Which record inside the tenant? | Agent → their agency's bookings; customer → their own; guest → via claim token. Authorization policy + query filter, not UI hiding. |

### 4.1 Module and schema layout (D7)

```
schema            module            owns
identity_agents   Identity.Agents   Users, UserDevices, VerificationCodes, Agents, agency data
identity_customers Identity.Customers Customers, CustomerIdentities, GuestClaimTokens
pricing           Pricing           MarkupRules (B2B tier + B2C channel), AgentTierProfiles
ledger            Ledger            LedgerEntries (agent credit only)
payments          Payments          Payments, PaymentAttempts, Refunds            [new]
booking           Booking           Bookings, Travelers, booking status history
messaging         Messaging         OutboxEvents
public            Catalog           Airports, Airlines (global, no TenantId)
```

Rules, enforced by an architecture test that fails the build:
- `Identity.*`, `Pricing`, `Ledger`, `Payments`, `Catalog` depend on `SharedKernel` only.
- `Booking` depends on `Pricing`, `Ledger`, `Payments`, `Suppliers` (contract), `Messaging` — never on `Identity.*` internals; it holds an owner *id*, not an entity reference.
- `Suppliers` depends on `SharedKernel` only and never sees a DbContext.
- Cross-module reads go through interfaces, never a join.

### 4.2 Data model changes

**Booking** (single migration, done *before* any B2C row exists):
```
+ Channel      text not null      -- 'B2B_AGENT' | 'B2B_SUB_AGENT' | 'B2C'
+ CustomerId   uuid null          -- FK identity_customers.Customers (no cross-schema EF navigation)
+ GuestEmail   text null          -- guest checkout; CustomerEmail stays for contact
+ CHECK (
    (Channel <> 'B2C' AND AgentId IS NOT NULL AND CustomerId IS NULL) OR
    (Channel =  'B2C' AND AgentId IS NULL     AND SubAgentId IS NULL)
  )
```
Backfill: existing rows → `B2B_AGENT`. **Verify first** that no existing row has `AgentId IS NULL`; if any do, decide their channel before the constraint goes on.
Add `Status` values for B2C: `PendingPayment`, `Paid` (keeps `Pending` = reserved, `Confirmed` = ticketed).

**Customers** (new, `TenantScopedEntity`):
```
Id, TenantId, Email (unique per tenant), Phone?, FirstName, LastName,
EmailVerified, IsActive, CreatedAt, DeletedAt?   -- soft delete supports erasure
```
Unique index on `(TenantId, lower(Email))`. No `AgentId`, no `Role`, no password and no OTP: customers sign in with Google or Facebook.

**CustomerIdentities** (new): `CustomerId, Provider ('google'|'facebook'), ProviderSubject, Email, EmailVerified`, unique on `(Provider, ProviderSubject)`. One customer can have several identities; a provider account can belong to only one customer.

**MarkupRule:** add `Channel` (default `B2B_AGENT`); make `Tier` nullable; check constraint so B2C rows have `Tier IS NULL` and B2B rows have it set. Resolution order becomes channel → tier → product.

**Payments** (new): `Payment(BookingId, Amount, Currency, Status, Gateway, GatewayRef)`, `PaymentAttempt`, `Refund`. Idempotency key per attempt. Webhook events stored before processing.

**OutboxEvent payloads:** add `channel` and `owner_type`; **IDs only, no customer PII** in payloads (ai-engine reads them directly).

### 4.3 What B2C is allowed to see

`ISearchResponseMapper` per channel in core:
- B2B: net rate, markup, commission, agent margin (as today).
- B2C: sell price and taxes only. Net rate, markup %, margin and supplier code are dropped server-side.
- Offer cache: split into shared raw-offer cache + per-channel pricing step (keeps cache keys tenant+channel scoped; later cuts supplier calls). Not required for launch; tracked as P4-3.

## 5. Auth design

**Endpoints (core):** `/auth/agent/*` (existing behaviour, moved), `/auth/customer/*` (new): `social` (exchange a Google/Facebook token for our JWT), `refresh`, `logout`, `guest-access` (emailed magic link, or booking ref + email).

**Social login flow:** the B2C app does the provider redirect and gets the provider's ID/access token. It sends that token to core, and core **verifies it server-side** (Google: signature via JWKS, `aud`, `exp`; Facebook: token inspection through the Graph API), then creates or finds the `Customer` and issues our own JWT. Core never trusts a customer id or email sent by the browser, and no customer password exists to leak.

**Account linking rule:** link a social login to an existing customer by email only when the provider reports the email as verified. Facebook accounts can lack an email or carry an unverified one, so in that case ask for an email and verify it (magic link) before linking. Otherwise someone could take over an account by registering another provider with a victim's email.

**Claims (both types):** `sub`, `jti`, `tenant_id`, `channel`, `actor_type` (`agent` | `customer` | `guest`), `token_type`; agents also `role`, `agent_id`.

**Separation of tokens:** distinct `aud` per actor type (`ota-agents`, `ota-customers`) and a distinct signing key per audience. A consumer token cannot validate on an agent-only route.

**Authorization policies** (declared on every endpoint, default deny): `AgentOnly`, `AgentAdmin`, `CustomerSelf` (route/resource owner == `sub`), `GuestBooking` (claim-token scoped to one booking), `PlatformAdmin`.

**Tenant resolution:** browser/edge picks the tenant from the host *only* to decide which tenant's login to show and to stamp at signup. After login, core trusts the token alone (D4). Unknown host → reject in production; the `default` → `demo-tenant` entry in `tenants.ts` stays for local dev only, behind a config flag.

**gRPC:** add an interceptor requiring a service credential (short-lived JWT signed for audience `ota-internal`) *plus* the end-user token where the call is user-scoped. Frontends get distinct service credentials so one can be revoked alone. Keep 8081 off the public network.

**Refresh/revocation:** existing stateless design is acceptable for agents (documented). For customers add a revocation check (Redis `jti` set) from the start — consumer devices are lost and shared more often, and retrofitting this touches every refresh call (see B4 plan, Option B).

## 6. Monorepo and frontend

```
apps/
  frontend-nextjs/     B2B (existing)
  frontend-b2c/        NEW — consumer storefront
  core-engine-dotnet/  + modules from §4.1
  ai-engine-python/
packages/              NEW — npm/pnpm workspaces
  core-client/         typed client generated from ota.proto + OpenAPI
  ui/                  shared components/design tokens
shared/protos/         ota.proto + new customer/payment protos (additive only)
```
- Browsers never call core. `frontend-b2c` server side (route handlers / server actions) is the BFF; it holds a service credential.
- Contract changes are additive and versioned so the two apps aren't forced to deploy together.
- Compose gets a `frontend-b2c` service (port 3001) and its own service credential env vars.

## 7. Phases

Estimates are rough working days for one engineer, before review/QA; treat as ±50% until Phase 0 shows how tangled the gRPC handler really is. **The authoritative, trackable breakdown is [2026-09-24-b2c-task-list.csv](2026-09-24-b2c-task-list.csv) (57 tasks, 119 engineer-days, of which P5-2 (3 days) is deferred).** The per-phase figures in the table below were the first-pass estimate; the task list is larger because it adds the tenant registry (P0-5/6), offer-cache tenant binding (P0-7/8), asymmetric JWT (P0-10), service tokens (P0-12) and per-task test/ops work that the first pass did not itemise.

| Phase | Work | Est. | Exit criteria |
|---|---|---|---|
| **0 — Trust fixes** | P0-1 Channel/tier from token, not headers (F1). P0-2 Add `channel`/`actor_type`/`aud` claims + separate keys (F2). P0-3 gRPC auth interceptor + service credentials (F3). P0-4 Reject unknown host in prod. | 4–6 | An agent token with a forged `X-Channel` header is rejected in a test. gRPC call without credential fails. |
| **1 — Module split** | P1-1 Extract booking orchestration from `OtaCoreGrpcService` into `IBookingService`/`ISearchService`; handler becomes an adapter (F8). P1-2 Split projects per §4.1. P1-3 Architecture tests (NetArchTest or reflection). P1-4 Existing test suite stays green throughout. | 8–12 | B2B flow unchanged end-to-end (Postman collection passes). Arch test fails on a deliberate bad reference. |
| **2 — Data separation** | P2-1 Per-module schemas + `ALTER TABLE … SET SCHEMA` migration **and** ai-engine poller updated in the same release (F7). P2-2 `Booking` Channel/CustomerId/constraint + backfill (F4). P2-3 `MarkupRule` channel key (F5). P2-4 `Customers` tables. P2-5 Ownership query filters/policies. | 6–8 | Migration applies on a copy of prod-shaped data. Constraint rejects an agent-owned B2C row. Poller still delivers `booking-created`. |
| **3 — Customer auth** | P3-1 Social login core (Google) + refresh/logout. P3-6 Facebook. P3-2 Guest magic link / ref+email access. P3-3 Rate limiting on social exchange and guest lookup. P3-4 Revocation set. | 6–8 | Customer token rejected on `AgentOnly` routes and vice-versa. Cross-customer booking read returns 404 in a test. |
| **4 — B2C booking & payments** | P4-1 Channel-aware `CreateBooking` (reserve → `PendingPayment`). P4-2 `Payments` module + gateway adapter (**gateway vendor is an open question, Q2**). P4-3 Pay → issue ticket → `Confirmed`; expiry job releases holds at `TicketingDeadline`. P4-4 Reconciliation job: supplier-ticketed-but-not-`Confirmed`, and paid-but-not-ticketed. P4-5 B2C response mapper (D6). | 12–18 | Full search→pay→ticket flow on the stub supplier. Abandoned cart releases the hold. Response contract test proves no net rate/markup field reaches B2C. |
| **5 — Frontend** | P5-1 Workspaces + `packages/core-client`. P5-2 `packages/ui` extraction from `frontend-nextjs`. P5-3 `apps/frontend-b2c`: search, results, passenger, pay, confirmation, my-bookings, guest lookup. P5-4 Compose + CI. | 15–20 | B2C site books a ticket on a preview tenant. B2B app builds against the same `core-client`. |
| **6 — Hardening** | P6-1 PII inventory, encryption at rest for passport/phone, retention + erasure job. P6-2 Bot protection / WAF rules on search, social exchange and guest lookup. P6-3 Load test anonymous search. P6-4 Alerts/runbooks for payment failures and reconciliation. | 6–8 | Erasure request removes a customer and leaves bookings anonymised. Load test result recorded against the §8 thresholds. |

Phases 0–2 are prerequisites and can run while `apps/frontend-b2c` builds search/browse pages against the existing (channel-agnostic) `GetSupplierAvailability` — search is the only part that works for B2C today.

## 8. Scale-out triggers (revisit, don't pre-build)

| Extract when… | Then |
|---|---|
| Search/supplier traffic forces scaling core just for search, or Sabre latency degrades bookings | Move `Suppliers` + search into `supplier-gateway` (offer-token design, idempotent `CreateBooking`/`IssueTicket`, reconciliation) |
| B2C customer data needs different compliance/residency | Move `identity_customers` (+ `payments` if PCI scope) to its own database — schema-per-module makes this a connection-string change |
| A team needs to ship a module independently | Extract that module behind its existing interface |
| Customer login load or SSO needs grow | Swap customer auth for an external IdP; `actor_type=customer` contract stays |

Do not extract Booking, Ledger and Payments from each other while a single DB transaction covers debit/payment, status change and outbox.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Booking-constraint migration fails on existing rows with `AgentId IS NULL` | Query first (P2-2); decide channel per row before adding the check |
| Schema move breaks ai-engine's raw SQL on `OutboxEvents` | Same-release change + integration test that runs the poller against the new schema (F7) |
| Payment succeeds but ticketing fails (or the reverse) | `PendingPayment`/`Paid` states, idempotency keys, reconciliation job (P4-4), alerting (P6-4) |
| Supplier hold expires while the customer is paying | Hold-aware payment window shorter than `TicketingDeadline`; expiry job; refund path |
| Header-trust regressions reappear | Contract test in CI: forged `X-Channel`/`X-Tenant-ID` on authenticated routes must not change behaviour |
| Two frontends drift on shared UI/contract | `packages/` from day one; additive-only proto changes |
| Scope: 119 engineer-days in the task list (about 30 days per engineer with 4 engineers, before dependencies and idle time) | Phases 0–2 are independently valuable (they fix F1–F3, F9, F10 for B2B too); ship them first; cut P4-9 and P5-2 first if scope must shrink |

## 10. Answers received (2026-09-24) and what they change

| Q | Answer | Effect on the plan |
|---|---|---|
| Q1 Tenants | Own B2C tenant, if easy to manage | Confirmed (D2). Adds **P0-5: tenant registry in core** — tenants become rows (branding, domains, channel, payment/supplier config) instead of the hardcoded map in `frontend-nextjs/lib/tenants.ts`, plus a provisioning script, so a new tenant is data, not a deploy. |
| Q2 Payment gateway | **SSLCommerz** confirmed; **bKash later** | Build `IPaymentGateway` with one adapter first (SSLCommerz), so bKash or another gateway can be added behind the same interface. Merchant onboarding lead time is a schedule risk, so start it in week 1 (P4-2). Check the provider's current docs for supported methods, IPN/validation and refund behaviour before P4-3 design. |
| Q3 Guest checkout | Yes, at launch | P3-2 (guest claim token) is in launch scope. |
| Q4 Customer identity | **No OTP.** Sign up and log in with Google or Facebook | Social login replaces OTP: adds `CustomerIdentities`, a server-side provider-token exchange (P3-1), Facebook handling (P3-6) and login UI (P5-7). Guest access uses an emailed magic link or booking ref + email, not OTP. **Facebook production login needs Meta app review — external lead time; start it early.** |
| Q5 Suppliers | Same Sabre account as B2B; Hajee too | Supplier credentials are platform-level, not per tenant. Adds **P0-6: tenant-bind supplier offer cache** — `sabre:offer:{offerId}` and `sabre:pnr-groups:{pnrId}` keys carry no tenant today, so a booking must verify the offer was issued to the caller's tenant (verify the current behavior first; see §11). Hajee shapes still unverified (project memory), so it stays behind `ISupplierProvider` and out of the payment-window design until verified. |
| Q6 Team | 4 engineers | See §11 for parallel tracks. |

## 11. Team of 4 — parallel tracks

| Track | Engineer focus | Phases |
|---|---|---|
| A — Platform/security | Trust fixes, gRPC auth, asymmetric JWT, tenant registry, offer-cache tenant binding | P0 first (blocks everything), then P2 schema/migrations |
| B — Core modules | Booking/search extraction, module projects, arch tests, response mapper | P1 → P4-1, P4-5 |
| C — Payments | Gateway onboarding + adapter, payment state machine, expiry/reconciliation | Starts in week 1 (onboarding); P4-2..P4-4 |
| D — Frontend | `packages/`, `apps/frontend-b2c` search/browse against existing search, then checkout | P5, and P3 customer auth UI |

Customer auth (P3) is split between A (endpoints, revocation) and D (UI). Phase 0 is the only hard serial gate; P1 and the B2C search pages can start alongside it. Rough calendar with 4 engineers and review/QA overhead: 8–10 weeks to a launchable B2C flow on the stub supplier, before gateway onboarding delays and Hajee verification — treat as an estimate to be re-planned after Phase 0.

## 12. Frontend mockup review — `aerotake-site` (2026-09-24)

`aerotake-site` (separate git repo, `/Users/sabber/Documents/GitHub/aerotake-site`) is not raw HTML: it is a working **Next.js 16.3.5 / React 19.2 / Tailwind 4** app with routes for home, flights, booking (passengers → extras → payment → confirmation), login, register, my-bookings and manage-booking, all running on mock data (`src/lib/mock/*`). It has no backend calls. The UI stays as designed; the work is wiring it to core and removing what core can't back.

| # | Mockup behaviour | Conflict with the plan / backend | Resolution (task) |
|---|---|---|---|
| M1 | Separate repo; Next 16.3.5. `frontend-nextjs` is Next 15.1.6 / React 19.0.0. | Decision D1 said monorepo. Two Next majors make a shared UI package costly. | Import as `apps/frontend-b2c` keeping history (P5-0, decision Q8). Share `core-client` and types only; defer shared UI (P5-2 → P2). |
| M2 | Login/register pages are **email + password** forms. | Contradicts Q4 (Google/Facebook, no password). | Rework pages, remove password fields (P5-7). |
| M3 | Prices are USD with a **hardcoded client-side FX table** (BDT 110/USD etc.). | Core prices in the tenant currency (`Booking.Currency` defaults to USD); the gateway charges one currency; a client-side rate would make the displayed price differ from the amount charged. | Server-priced amounts in the tenant sell currency only (P5-9, decision Q9). |
| M4 | `Flight` shows `refundable`, `seatsLeft`, `cabin`, cabin vs checked baggage. | `ota.proto` offers carry checked-baggage flag/weight and segments; I found no refundable/seats-left/cabin fields (only a `cabin` search filter). | Additive contract change where Sabre can supply the data; otherwise hide the element (P5-8). |
| M5 | Booking has an **Extras** step (extra baggage, meal, seat map). | Core has no ancillary or seat support. | Decide: hide at launch or build supplier ancillaries first (P5-10, Q10). Do not ship choices nothing fulfils. |
| M6 | Payment page offers cards, internet banking, bKash, gift-card and promo code inside the page. | Launch is SSLCommerz only (bKash later); gift cards/promos have no backend. | Single hand-off to the gateway; method choice happens there; remove unsupported widgets (P5-4). |
| M7 | `manage-booking` looks up by **PNR + last name**. | Plan said ref + email. | Adopt the mockup's PNR + last name, plus magic link; throttling is mandatory because the lookup is easy to probe (P3-2, P3-3). |
| M8 | Flight ids are derived from search params; mock bookings are hardcoded. | Real offer ids are opaque supplier ids and bookings come from core. | Replace mocks with `core-client` (P5-3, P5-5). |
| M9 | `SITE` shows a UK address/phone. | If the operating entity is UK-based, customer data handling and consent fall under UK data-protection rules, which affects P6-1. | Confirm operating entity and data-residency needs (Q11). |

Decisions received: **Q8 — import `aerotake-site` into the monorepo** (P5-0). **Q9 — BDT now, extensible:** sell currency is a per-tenant setting (P0-5) and prices come from the server, so adding a currency later is configuration (P5-9). Still open: **Q10** Extras page: hide at launch or build ancillaries? · **Q11** operating entity and where customer data may live? · Confirm who owns the Google and Meta developer accounts (you said "ok"; I need a named company owner before P3-1/P3-6).

## 13. Privacy and jurisdiction (2026-09-24)

**Answers:** legal operator is a **Bangladesh** company; customers are mainly in **Bangladesh, the Middle East and Europe**, with more markets to follow; **no legal adviser has yet stated where data may be hosted.**

**Position taken (engineering, not legal advice):** we can't yet say which rules bind us, and customers in several regions may bring several regimes at once (European residents' data is generally covered by EU rules even when the operator is elsewhere; several Middle East countries have their own data-protection laws; Bangladesh has been developing its own — the current state of each needs checking by a lawyer). So the plan builds the capabilities that all such regimes broadly ask for, and does not hard-code a region.

- **P6-1 (6 days, was 4):** consent records, data export, deletion with booking anonymisation, retention periods, encryption at rest for passport/DOB/phone, PII access audit log.
- **P6-5 launch gate:** written legal sign-off on hosting region, cross-border transfers, provider agreements and the privacy policy. **No B2C launch without it.** Owner is business/compliance, not engineering.
- **P5-11:** cookie/consent banner and consent capture at signup and checkout.
- **Hosting region** is a deployment decision recorded under P6-5. Nothing in the code depends on it; if regions ever need to be separated by customer location, the tenant model (one tenant per brand/market) is the seam.
- **Card data:** using the gateway's hosted checkout keeps card numbers off our servers; confirm this with SSLCommerz's documentation before P4-3.

**Consequence to raise (Q12):** Q9 chose BDT as the sell currency. Customers in the Middle East and Europe will see BDT prices and must pay in BDT through SSLCommerz unless a second tenant/currency and a gateway that supports it are added. The design allows this later (per-tenant currency), but confirm whether launch is effectively Bangladesh-only for payment, with other regions browsing and paying later.

## 14. Findings from the gRPC authentication work (2026-09-24)

- **F11 — Currency is caller-supplied and nothing converts it.** Revalidate and booking take the currency label from the request message (the frontends hardcode `"USD"`), and no service does FX: prices are in whatever currency the supplier quoted. Q9 chose BDT as the B2C sell currency, so a supplier-currency → tenant sell-currency conversion, done server-side from `Tenant.SellCurrency`, has to exist before B2C prices are correct. Blocks P5-9's acceptance ("displayed price equals the amount charged"). Not changed here.
- **Fixed on the way:** another agent in the *same tenant* could ticket someone else's booking if it knew the id (IssueTicket now scopes to the calling agent); a request could name any sub-agent for margin/attribution (now must sit under the caller); the frontend sent `"B2C"` instead of the proto enum name `CHANNEL_TYPE_B2C`, which grpc silently read as "unspecified"; two suppliers dereferenced `request.Tenant` and crashed when the message had none.
- **Demo API key** no longer carries agent pricing on gRPC (a caller can't claim an agent without a token). Real API-key access for B2B consumers is its own feature: exchange a key for an agent-scoped token inside core.
- **`.env` is appended by `make up`** (`ensure-dev-secrets`) with dev JWT keys and frontend service credentials; append-only, never overwrites.

## 15. Status snapshot — 2026-09-24 (end of Phase 0 and Phase 1)

Source of truth for task state is [2026-09-24-b2c-task-list.csv](2026-09-24-b2c-task-list.csv) (63 tasks, 138 estimated days). Estimates are the planning figures; they are not a record of effort spent.

| Phase | Done | Notes |
|---|---|---|
| 0 Trust fixes | **13 / 13** | Complete. Channel/tenant/agent/tier from tokens not headers; offer ownership; tenant registry; `actor_type` + audiences; ES256 + JWKS, frontends hold no secret; every gRPC call authenticated; service tokens for anonymous search |
| 1 Module split | **5 / 6** | P1-1..P1-5 done. **P1-3 changed form:** modules are namespaces with build-enforced rules, not separate projects (see task note); the physical split is the new P1-6, after P2-2 |
| 2 Data separation | 0 / 7 | Next |
| 3 Customer auth | 0 / 6 | |
| 4 B2C booking & payments | 0 / 10 | P4-10 (currency conversion) is new and blocks P5-9 |
| 5 Frontend | 1 / 12 | P5-0 import done; P5-6 (Dockerfile + compose) in progress |
| 6 Hardening | 0 / 5 | P6-5 legal gate has no dependencies — start it now |
| Backlog | 0 / 4 | Found along the way: test isolation, frontend unit tests, real API keys for B2B, secret store |

**Verified state:** core-engine test suite **233 / 233 green** (it was 2 red at the start of Phase 0's last stretch: A7 and an outbox race, both fixed). The whole stack runs under compose; the B2B flow (login → search → revalidate → reserve → ticket) and the anonymous B2C/white-label searches were exercised live through the frontend, plus direct gRPC probes of every refusal.

**Decisions still open**
- **Q10** Extras page: hide at launch (recommended) or build supplier ancillaries first. Nothing is built either way.
- **Q11** Bangladesh operator confirmed; hosting region and cross-border rules await legal advice (P6-5).
- **Q12** Launch is effectively Bangladesh-first for payment? BDT is the sell currency, and **F11**: no currency conversion exists anywhere.

**Blockers and risks worth acting on**
1. **F11 — no FX** (P4-10). B2C prices in BDT cannot be correct until a server-side conversion exists.
2. **Nothing has started on the long-lead items:** SSLCommerz merchant onboarding (P4-2), legal sign-off (P6-5), Facebook app review (P3-6). All three are external and slow; none needs engineering to begin.
3. **Hajee Air** is configured in this stack but reports "temporarily unavailable" (the IP whitelist noted in project memory), so live search returns no Hajee fares here.
4. **Tests write into the shared dev database** and need the stack running (T-1).

**Recommended next:** Phase 2, starting with P2-1 (read-only check for `Booking.AgentId IS NULL`) and P2-3 (booking ownership migration) while the external items above are kicked off in parallel by the business side.

## 16. Status snapshot — Phase 2 progress (2026-09-25)

| Phase | Tasks done | Est. days done |
|---|---|---|
| 0 Trust fixes | 13 / 13 | 21.5 / 21.5 |
| 1 Module split | 5 / 6 | 11.5 / 15.5 |
| 2 Data separation | 5 / 7 | 8.0 / 12.0 |
| 3 Customer auth | 0 / 6 | 0.0 / 12.0 |
| 4 B2C booking & payments | 0 / 10 | 0.0 / 25.5 |
| 5 Frontend | 1 / 12 | 1.5 / 27.0 |
| 6 Hardening | 0 / 5 | 0.0 / 13.5 |
| Backlog | 0 / 5 | 0.0 / 12.0 |
| **Total** | **24 / 64** | **42.5 / 139.0** |

**Done in Phase 2:** P2-1 (bookings check), P2-3 (booking channel + ownership constraints), P2-4 (channel-aware markup rules), P2-5 (customer tables), P2-7 (ownership rules, agent + customer). **Verified state:** core-engine suite **297 / 297 green**; 4 new migrations applied to the dev database; every migration hand-checked on a scratch database (up from empty, down, up again, and each guard firing).

**What changed for B2C in the data model:** a booking now records its channel and owner and the database refuses impossible combinations; consumer pricing is a separate scheme (logged-out prices unchanged, since it starts as a copy of Standard); customers, provider identities and guest claim tokens exist with per-tenant uniqueness; and one rule set decides who can see or act on a booking.

**Bugs found and fixed on the way (all pre-existing or introduced-and-caught):** another agency could replay someone else's idempotency key and receive their booking; EF silently orphaned a booking when its customer was removed (fixed with `ClientNoAction`); my own P2-3 test left orphan rows that blocked the next migration (the migration guard caught it).

**Not started, and why — P2-2 (per-module schemas) and P2-6 (ai-engine poller):** these move every table in the shared database and must change the ai-engine's raw SQL in the same step, and the module map has a real coupling to settle first: `Agent` carries the credit balance (`CreditUsed`) that `AgentCreditService` mutates, and `LedgerEntry` navigates to `Agent`, so "Identity owns Agent" and "Ledger owns credit" cannot both be true with separate contexts. Options:
1. **Schemas only, one DbContext** (recommended first step): move tables into per-module schemas with `SET SCHEMA` (indexes and constraints move with them) and update the poller in the same release. Low risk, reversible, no model redesign; gives the database-level boundary but not compile-time separation.
2. **Per-module DbContexts** (P1-6 territory): needs Agent split into identity data and credit account before contexts can separate. Real design work; do it when a service split is actually planned.
3. **Do nothing yet:** B2C does not need either; the cost is that a later database split is a bigger job.

**Recommended next:** Phase 3 (customer auth) is unblocked by everything Phase 2 delivered and is what B2C needs next; take option 1 for P2-2/P2-6 only when convenient, in a release that also updates the ai-engine.


### Status snapshot after Phase 3 (2026-09-25)

| Phase | Done | Days done / planned |
|---|---|---|
| 0 Trust fixes | 13 / 13 | 21.5 / 21.5 |
| 1 Module split | 5 / 6 | 11.5 / 15.5 |
| 2 Data separation | 5 / 7 | 8.0 / 12.0 |
| **3 Customer auth** | **6 / 6** | **12.0 / 12.0** |
| 4 B2C booking & payments | 0 / 10 | 0.0 / 25.5 |
| 5 Frontend | 1 / 12 | 1.5 / 27.0 |
| 6 Hardening | 0 / 5 | 0.0 / 13.5 |
| Backlog | 0 / 6 | 0.0 / 14.0 |
| **Total** | **30 / 65** | **54.5 / 141.0** |

**Delivered in Phase 3:** customers sign in with Google or Facebook and get their own kind of token (never accepted by agent routes, and vice versa); guests reach exactly one booking by claim link or reference + surname; the anonymous consumer endpoints are rate-limited (fail closed); sign-out and suspension take effect at once (durable in Postgres, not Redis); every REST endpoint must declare who may call it, undeclared ones are refused by default, and a test pins the exact list of anonymous endpoints and probes every protected one with the wrong kinds of caller. Core-engine suite **463 / 463 green**.

**Not proven, and needs someone outside the code:** neither provider has been exercised against the real Google/Facebook (no client id / Meta app yet; the tests use a stand-in provider with real signatures); Meta app review has lead time; the storefront must handle a Facebook customer who has no verified email.

**Recommended next:** Phase 4 (B2C booking and SSLCommerz payments). It needs the SSLCommerz merchant onboarding (P4-2) started now, since that has external lead time, and a decision on Q10/Q12 before the checkout flow is designed.


### Update 2026-09-25 (later): booking and schemas

**P4-1 and P4-8 done** — a consumer can now reserve a booking, as a guest (`POST /api/v1/guest/bookings`) or signed in (`POST /api/v1/customers/me/bookings`). It is held with the supplier and recorded as Pending (nothing charged, no agent ledger), the price is recomputed on the server (a changed price returns the new total instead of booking), the itinerary the customer saw is kept on the booking, and consumers are never shown net rate, margin or supplier. **Payments (SSLCommerz, P4-2..P4-5), hold expiry with supplier release (P4-6), reconciliation (P4-7) and currency conversion (P4-10) are not done.**

**P2-2 and P2-6 done, schemas only** — tables are in module schemas and the ai-engine poller follows, with a contract test. Per-module DbContexts stay deferred (Agent still mixes identity and credit).

| Phase | Done |
|---|---|
| 2 Data separation | 7 / 7 |
| 4 B2C booking & payments | 2 / 10 |
| **Total** | **34 / 65** |


### Update 2026-09-25 (storefront wired)

Search, results, airport typeahead, passengers -> reserve, confirmation, manage-booking, my-bookings and Google sign-in now run on core-engine (verified through the API against the Sabre cert system; **no browser check yet - P5-13**). All mock data is gone from the storefront (`src/lib/mock` deleted). Home-page sections whose claims had no source (offers, packages, reviews, ratings, visa services, travel tips, "10,000+ travellers", "24/7 support") were **removed**, the contact form (which only pretended to send) was removed, and the legal pages now say "not yet published". **P5-12 (business content, real contact details, legal texts) blocks launch and needs the operator.**

| Phase | Done |
|---|---|
| 5 Frontend | 3 / 14 (P5-3, P5-5 done; P5-4, P5-6, P5-7, P5-8, P5-9, P5-10 in progress) |
| **Total** | **36 / 67 tasks, 70.0 / 145.0 days** |

Still open on the storefront: payment (SSLCommerz), Facebook sign-in, consent banner (P5-11), fields the contract lacks (refundable, seats left, cabin baggage), infants, multi-city, a shared core client package (P5-1).
