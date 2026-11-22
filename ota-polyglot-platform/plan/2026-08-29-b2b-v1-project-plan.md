# B2B OTA Platform — Version 1 Project Plan

**Created:** 2026-08-29 · **Last restructured:** 2026-09-01 (module-based) · **Target launch:** 2026-12-31 (~17 weeks)
**Scope:** Full B2B agency channel, organized as 9 product modules (plus a foundational Auth/Registration module 0) per the 2026-09-01 module breakdown: **0** Auth & Registration, **1** Search Bar, **2** Result, **3** Booking, **4** Passenger/Name Entry, **5** Confirm Booking, **6** Queue Management, **7** Topup/Payment (online + offline), **8** Ledger Management, **9** Super Admin. **AI engine (personalization/recommendation) is explicitly deferred to Version 2** — not started, not scheduled in this plan.

## Module-based execution model (added 2026-09-01)

Per direction on 2026-09-01, this plan now sequences work **module by module** rather than backend-epic-then-frontend-epic. A module is not "done" when its backend endpoints pass tests — it's done when its screen is **wired to the live backend** end-to-end. Each module below ends in an explicit wire-up task; the next module's frontend work doesn't start until the previous module's wire-up task is complete.

One structural exception, called out task-by-task in the CSV: **Module 9 (Super Admin)'s backend** (agency/agent/tier CRUD — C1, C2) is built in Sprint 1, not last, because every other module needs a real agency, agent, and credit limit to test against. Only Module 9's *frontend screens* wire up last, in their numbered position. This is a deliberate infrastructure-vs-feature-order split, not a deviation from the module approach.

The full task-by-task module assignment, sprint, and dependency detail lives in the companion CSV (`2026-08-29-b2b-v1-task-list.csv`) — its `Module` column is the source of truth; the epic letters (A–K) below are kept only as a cross-reference to the original functional breakdown.

| Module | What it covers | Wire-up-complete target |
|---|---|---|
| 0 — Auth & Registration | Login, signup, device verification, forgot/reset password, session/auth bridge, gRPC bridge, UI shell | End Sprint 2 (Sep 25) |
| 1 — Search Bar | Flight search UI wired to Sabre availability via the gRPC bridge | Sprint 3 (Oct 9) |
| 2 — Result | Search-results list wired to the search response + offer revalidation | Sprint 3 (Oct 9) |
| 3 — Booking | "Start booking" UI wired to `ProcessB2BBooking` (reserve, no charge) | Sprint 4 (Oct 23) |
| 4 — Passenger / Name Entry | Passenger details form wired to the booking payload, with field validation | Sprint 4 (Oct 23) |
| 5 — Confirm Booking | Confirm/review + ticket-issuance UI wired to `IssueTicket` (pay + ticket) | Sprint 5 (Nov 6) — full search-to-ticket flow live |
| 6 — Queue Management | Internal ops worklist (pending payment/ticketing/expiring holds) + booking list/cancel/void, wired | Sprint 6 (Nov 20) |
| 7 — Topup / Payment | Online self-serve payment gateway + offline top-up request, wired | Sprint 6 (Nov 20) — **new scope, see risk flags** |
| 8 — Ledger Management | Ledger listing/export + statements, wired | Sprint 7 (Dec 4) |
| 9 — Super Admin | Agency/agent CRUD, credit approval, tier/markup, sub-agent hierarchy, settings, wired | Sprint 8 (Dec 18) — **tight, see risk flags** |

**Scope change from the 2026-08-29 version of this plan:** online self-serve credit top-up (a payment gateway) was previously out of v1 scope entirely (see the old "Assumptions" section below). Module 7 now explicitly includes it, which is new, unestimated-until-now work with its own external dependency (choosing and integrating a payment gateway vendor) — flagged in the CSV as task T1 and in Risk flags below.

## Where the project stands today (baseline)

Verified against the running stack on 2026-08-29:

**Done / proven live:**
- JWT auth: register, login, device verification (email code), refresh, forgot/reset password (`AuthController`).
- Real Sabre GDS integration: search, revalidate, PNR creation, ticket issuance (`SabreProvider`), with automatic fallback to a deterministic stub when credentials aren't configured.
- Booking pipeline split: `ProcessB2BBooking` (reserve, no charge) → `IssueTicket` (pay via `AgentCreditService` + ledger + supplier ticketing).
- Agent credit ledger with debit/refund (`AgentCreditService`, `LedgerEntry`) — concurrency safety is *mostly* proven, not fully: see A7, found 2026-08-30, where the retry-exhaustion path on the final attempt throws instead of gracefully declining (fails safe, no overspend, but a real 500 under real contention).
- Tenant isolation via EF global query filters (`TenantScopedEntity`, `TenantResolutionMiddleware`).
- Structured alerting to Slack/email on unhandled exceptions (`AlertNotifier`, `AlertingInterceptor`).
- Postman collection covering the full auth + gRPC booking flow.
- Production Dockerfile (multi-stage build) for core-engine.

**Not started (the gap this plan closes):**
- Any admin/tenant-management backend — no CRUD for agencies, users, markup rules, credit limits. `AgentsController` is read-only (credit + ledger lookup).
- Frontend has real screens now (login, partner dashboard, booking/search/reports/etc. — see "Frontend reality check" below, task E0a) but none of it is wired to a backend: no auth, no live data, all mock. The "3 pages / ~200 lines" placeholder frontend this line originally described is gone as of 2026-08-30.
- No booking cancellation/void, no booking list/search endpoint (only get-by-PNR).
- No CI/CD pipeline (no `.github/workflows`).
- No real EF Core migrations (schema created via `EnsureCreatedAsync` — fine for dev, not for a live production database).
- No rate limiting, no production secrets management, no security review.

This plan's job is to take the platform from "core engine proven end-to-end via API calls" to "an agency can log into a dashboard, search, book, pay, and get ticketed, and AeroTake staff can administer tenants" — by December.

## Frontend reality check (updated 2026-08-30, later same day)

The dashboard was **not** built from scratch in this repo — and it no longer needs to be, as of today. The coded mockup this section originally flagged as "expected within 2–4 weeks" instead landed and was integrated the same day this section was first written: real screens (login, partner dashboard, booking search, bookings, fare quotation, hold balance, reports, passengers, support, ticket alerts, signup/forgot-password/verify flows), not just a design file, now live in `apps/frontend-nextjs` — task **E0a**, marked Done in the CSV.

What E0a actually did:
- **Merged, not replaced.** The mockup's Tailwind v4/Poppins-styled pages, components, and mock data were copied into `apps/frontend-nextjs` (flattened out of its source `src/` layout). The pre-existing functional scaffold — `middleware.ts` tenant resolution, `lib/tenants.ts`, `lib/alerts.ts`, the `/api/search` and `/api/log-client-error` BFF routes, `global-error.tsx` — was left untouched.
- **Routing decision made.** `/` is now the mockup's login screen (was a placeholder B2C landing). The old bare `/agent` stub is gone; `middleware.ts`'s B2B/white-label rewrite now targets `/dashboard` (the real portal) instead.
- **One version-skew fix.** The mockup pins Next 16; this app pins Next 15.1.6. `next/image`'s `preload` prop (Next 16-only) had to become `priority` in `components/auth-shell.tsx` to build. Worth watching for more of this as the mockup evolves.
- **Re-sync path.** `apps/frontend-nextjs/scripts/sync-theme.sh` re-pulls theme-owned paths (components/data/public/styles/pure-theme routes) from the mockup's repo on demand, explicitly never touching middleware/lib/api — `app/layout.tsx` and `app/page.tsx` are hand-merged, not synced, since they also carry tenant/BFF concerns the mockup doesn't have.
- **Still on mock data.** Every screen (bookings, fare quotation, search, etc.) runs on the mockup's local mock/JSON data. Nothing talks to core-engine yet.

This still changes Epic E from "build a frontend" to "wire one up" — and the same two architectural decisions flagged before remain, now more concretely blocking (the mockup's login form, for instance, is live but posts nowhere):

- **Auth bridge (E0b).** `middleware.ts` and the BFF routes still carry no concept of a signed-in user. Something has to own session/token storage (a server-side httpOnly cookie set by a BFF login route is the recommended pattern, consistent with the existing "browser never talks to microservices directly" comment already in that middleware) and attach `Authorization: Bearer` to every upstream call.
- **gRPC bridge (E0c).** Four of the core booking RPCs (`GetSupplierAvailability`, `RevalidateOffer`, `ProcessB2BBooking`, `IssueTicket`) are gRPC-only on port 8081 (h2c, HTTP/2 cleartext) — a browser cannot call them directly. Either core-engine grows REST-wrapper equivalents, or the Next.js layer proxies them server-side via `@grpc/grpc-js` (the path the existing route comment already assumes). This blocks all booking-flow integration (E4) and is no longer waiting on the mockup's stack being confirmed — it's confirmed, this is now just an open decision.

**The practical consequence for every backend epic (A, C, D, G):** define "done" at the API contract level — integration tests plus the Postman collection — not at "a screen exists for it." Backend tasks are fully completable and verifiable with zero frontend, and should ship on their original schedule regardless of how long E0b/E0c integration takes. See `2026-08-30-task-B4-trusted-device-management.md` for a worked example of this split (Milestone 1: backend-complete and Postman-verified; Milestone 2: a separate, later frontend-wiring follow-up).

## Assumptions

- **Team**: ~2 backend (.NET) engineers, 2 frontend (Next.js) engineers, 1 QA/DevOps, part-time PM. Adjust sprint mapping if actual team differs — the task list and priorities hold regardless of pace.
- **Sprints**: 2 weeks each, starting Monday 2026-08-31.
- **Priority key**: **P0** = required for the December launch to be a real, usable B2B product. **P1** = important, ships if capacity allows, otherwise first week after launch. **P2** = explicitly nice-to-have; cut first if the timeline slips.
- **Reversed 2026-09-01:** payment gateway integration (agencies topping up their own credit online) was previously assumed out of v1 — that no longer holds. Module 7 ("Topup or online payment or offline payment") is now an explicit v1 module: both a self-serve online payment gateway (new, task T1) and an admin-approved offline top-up request flow (task T2/C3) ship in v1. This is real added scope on top of the 2026-08-29 estimate — see Risk flags.

## Phased roadmap (8 sprints + launch week) — module-based, updated 2026-09-01

| Sprint | Dates | Focus |
|---|---|---|
| 1 | Aug 31 – Sep 11 | **Module 0 backend + infra:** CI pipeline, EF migrations, Agency/Agent CRUD backend (C1/C2 — built early as shared infra, UI deferred to Module 9) |
| 2 | Sep 14 – Sep 25 | **Module 0 wire-up:** auth bridge, gRPC bridge, UI shell, login/verify/reset screens wired to real backend, account lockout, staging env — Module 0 complete |
| 3 | Sep 28 – Oct 9 | **Module 1 (Search) + Module 2 (Result) wire-up:** search bar and results UI wired to live Sabre search/revalidate; Sabre prod cutover checklist, retry/timeout hardening |
| 4 | Oct 12 – Oct 23 | **Module 3 (Booking) + Module 4 (Passenger Entry) wire-up:** reserve flow and passenger form wired to `ProcessB2BBooking` |
| 5 | Oct 26 – Nov 6 | **Module 5 (Confirm Booking) wire-up:** ticket-issuance UI wired to `IssueTicket`; concurrent-credit fix (A7) — full search-to-ticket flow live end-to-end |
| 6 | Nov 9 – Nov 20 | **Module 6 (Queue Management) + Module 7 (Topup/Payment) wire-up:** worklist, booking list/cancel/void, online + offline top-up flows |
| 7 | Nov 23 – Dec 4 | **Module 8 (Ledger) wire-up** + cross-cutting: observability, load testing, security hardening, E2E test of the full critical path |
| 8 | Dec 7 – Dec 18 | **Module 9 (Super Admin) wire-up** (compressed — see Risk flags), bug fixing, UAT with pilot agency, docs, staging soak |
| Launch | Dec 21 – Dec 31 | Production cutover, go-live checklist, hypercare |

A companion CSV (`2026-08-29-b2b-v1-task-list.csv`, same folder) lists every task individually with epic, priority, estimate, and sprint — import that into Jira/Trello/Sheets for tracking. This document is the narrative context behind it.

## Epics

### A — Booking Engine Completion (backend, mostly hardening)
Finish the last ~20% of the reservation pipeline.
- A1 (P0) Booking list/search endpoint — paginated, filter by status/date/agent.
- A2 (P0) Booking cancellation workflow (pre-ticketing).
- A3 (P0) Ticket void + refund-to-ledger flow (post-ticketing cancellation).
- A4 (P1) Retry/alternate-offer handling when Sabre returns transient availability failures.
- A5 (P2) PNR status sync/polling job to catch supplier-side changes out-of-band.
- A6 (P2) Partial ticketing (subset of passengers per booking) — defer to v1.1 unless a pilot agency needs it day one.
- A7 (P1, **Done** 2026-09-24) Fix `AgentCreditService`'s retry-exhaustion handling under concurrent bookings — found 2026-08-30 while verifying B1 (unrelated file). Fails safe (no overspend), but a real booking under real contention gets an unhandled 500 instead of the graceful decline the code already intends. See the CSV row for the exact line.

### B — Auth & Identity Hardening

**Role model, decided 2026-08-30:** the existing 3-value `UserRole` enum (`Admin` platform staff / `AgencyAdmin` agency owner / `AgencyUser` agency booker) is sufficient for v1 — no new roles needed before B1 starts. Sub-agents (C4) are **not** a 4th role: `Agent.ParentAgentId` already models the hierarchy, so a sub-agent's users just get the existing `AgencyAdmin`/`AgencyUser` roles scoped to their (child) agency. Platform-side granularity beyond one flat `Admin` (support/ops vs. true super-admin) stays deferred to C6 (P2), as already planned.

- B1 (P0, **Done** 2026-08-30) Enforce role-based authorization (`Admin`/`AgencyAdmin`/`AgencyUser`) on every new endpoint, plus same-tenant ownership scoping (Admin sees any agent; AgencyAdmin/AgencyUser only their own — denied as 404, not 403, so an agentId can't be probed). New `Auth/ClaimsPrincipalExtensions.cs` for C1–C7 to reuse. This row previously predicted a `RoleClaimType` blocker that turned out to be **wrong** on verification: the JWT pipeline's inbound claim mapping already rewrites `JwtTokenService`'s plain `"role"` claim to `ClaimTypes.Role` automatically, so `RoleClaimType` needed to stay at its default — setting it to `"role"` (the pre-mapping name) is what actually breaks every role check. Implementing this also surfaced a real, separate pre-existing bug: `Program.cs` resolved `JWT_SIGNING_KEY` into a closure before `WebApplicationFactory`'s test config override was merged into the builder, so every test-issued token failed signature validation (401, not a role issue) — fixed by resolving the key lazily via `AddOptions<JwtBearerOptions>().Configure<IConfiguration>()`, matching how `JwtTokenService` already reads it. 10 new tests in `RoleAuthorizationTests.cs`; full suite 31/32 green (the 1 failure is A7, unrelated).
- B2 (P0) Account lockout after repeated failed logins; basic password policy.
- B3 (P1) Auth audit log (login, password reset, device verification events).
- B4 (P2) Trusted-device management — API + Postman-verified in Sprint 8; dashboard wiring is a separate follow-up once the mockup's Settings section exists (see `2026-08-30-task-B4-trusted-device-management.md`).
- B5 (P1) API-key authentication scheme for direct B2B API consumers. **Gap found 2026-08-30:** `core-engine`'s `Program.cs` registers only `JwtBearer` — there's no API-key auth path in the backend at all. But `frontend-nextjs/middleware.ts` already resolves a `B2B_AGENT` channel from an `X-Api-Key` header (`lib/tenants.ts`'s `API_KEYS` map), i.e. the plan already assumes agencies can integrate without a browser/login, and the backend has no principal type for that caller yet. Priority/timing needs a PM confirmation: P1 here assumes direct-API integration isn't required for the December dashboard launch.

### C — Tenant / Agency Admin Backend (the biggest missing piece) → mostly Module 9, with C1/C2 pulled into Module 0 as shared infra
- C1 (P0) Agency CRUD (create, list, update, deactivate) — `AgenciesController`. **Built in Sprint 1 (Module 0), not Module 9** — every later module needs a real agency/agent to test against; its UI (E6a) still wires up last, in Module 9.
- C2 (P0) Agent tier & markup rule CRUD (currently seed-only data). Same early-backend/late-UI split as C1.
- C3 (P0) Credit limit management + admin approval/manual top-up endpoint (admin-initiated) — now also the approval half of Module 7's offline top-up flow (see task T2).
- C4 (P1) Sub-agent hierarchy management (parent/sub-agent linkage via `Agent.ParentAgentId`, `SubAgentDefaultMargin`) — data-level hierarchy, not a new role; see Epic B's role-model note.
- C5 (P1) Agency onboarding workflow (registration → pending → approved).
- C6 (P2) Platform super-admin role with cross-tenant visibility (AeroTake staff view).
- C7 (P2) Tenant-level settings (branding, default currency, contact info).

### D — Finance / Credit Ledger & Reporting → Module 8 (Ledger Management), plus D2 in Module 7 (Topup/Payment)
- D1 (P0) Ledger listing with filters (date range, entry type), paginated API + CSV export.
- D2 (P1) Low-credit-balance alert (reuses existing `AlertNotifier`) — feeds Module 7's top-up prompt.
- D3 (P1) Per-agency statement/invoice generation (simple HTML/PDF, period-based).
- D4 (P2) Reconciliation report (bookings vs. ledger debits vs. supplier confirmations).

### E — Tenant Dashboard (Frontend Integration) — split across Modules 0–2, 5–6, 8–9 per the 2026-09-01 restructure
See "Frontend reality check" above. E4–E7 below were each **split into module-scoped subtasks** (`E4a`–`E4e`, `E5a`–`E5b`, `E6a`–`E6b`, `E7a`–`E7b` in the CSV) so each module finishes and gets wired on its own before the next starts, instead of shipping as one large cross-module task.
- E0a (P0, **Done**) Onboard the incoming mockup — Module 0.
- E0b (P0) Build the auth bridge — Module 0.
- E0c (P0) Decide and build the browser-to-booking bridge for the 4 gRPC RPCs — Module 0 (moved up from Sprint 3 to Sprint 2 so it's ready before Module 1 needs it).
- E1 (P0) Wire the mockup's layout/nav to the real auth guard — Module 0.
- E2 (P0) Wire login, device verification, forgot/reset password screens to the auth bridge — Module 0.
- E3 (P0) Wire dashboard-home widgets (credit balance, recent bookings, alerts) to real GET endpoints — Module 0.
- E4a–E4e (P0) The former single "wire the booking flow" task, now one subtask per module it spans: E4a search bar (Module 1), E4b results (Module 2), E4c start-booking (Module 3), E4d passenger entry (Module 4), E4e confirm/ticket (Module 5).
- E5a–E5b (P0) Booking management, split: E5a list/filter/detail, E5b cancel/void — both Module 6, alongside the new worklist (Q1/Q2).
- E6a–E6b (P0) Agent/agency admin screens, split: E6a agency/agent CRUD UI, E6b credit-approval + tier/markup UI — both Module 9 (now the last module wired, see Risk flags).
- E7a–E7b (P1) Ledger & statement screens, split: E7a ledger list/export, E7b statement/invoice view — both Module 8.
- E8 (P2) Settings screens: agency profile, branding, notification preferences — regrouped into Module 9 (agency/tenant settings), wires to C7.
- E9 (P1) Responsive QA pass on the integrated layout — cross-cutting, deliberately last (all 9 modules must be wired first).
- E10 (P0) Client-side validation, loading states, and error toasts wherever placeholder states need real logic — cross-cutting polish; each module's own wire-up task ships baseline validation, E10 unifies it.

### New (2026-09-01): Queue Management backend/frontend — Module 6
- Q1 (P0) Booking worklist/queue endpoint: bookings needing action (pending payment, pending ticketing, expiring hold, failed supplier step), paginated + filterable — distinct from A1's general booking list.
- Q2 (P0) Wire the queue/worklist screen to Q1.

### New (2026-09-01): Topup / Payment gateway backend/frontend — Module 7
- T1 (P0) Online payment gateway integration for agency self-serve top-up. **New v1 scope, reversing the prior deferral** — no vendor chosen yet; see Risk flags.
- T2 (P0) Agency-initiated offline top-up request endpoint (bank-transfer reference/proof, status=pending admin approval) — feeds C3.
- T3 (P0) Wire the top-up screen: online payment form (T1) + offline request form (T2) + status/history.

### F — Notifications
- F1 (P0) Transactional email templates: booking confirmed, ticket issued, low credit (device-verification email already exists — extend the same `SmtpEmailSender`).
- F2 (P2) In-app notification center — defer to v2.

### G — Supplier Integration Hardening
- G1 (P0) Sabre void/cancel ticket API integration (backs A3).
- G2 (P1) User-facing error taxonomy for supplier failures (map Sabre error codes to clear agent-facing messages).
- G3 (P1) Timeout/retry policy around all Sabre HTTP calls.
- G4 (P0) Sandbox → production Sabre credential cutover checklist and verification.

### H — Observability, Testing & QA
- H1 (P0) Integration test coverage for all new controllers (tenant admin, ledger, booking list/cancel).
- H2 (P1) Frontend E2E test for the critical path (login → search → book → ticket).
- H3 (P1) Load test the search endpoint under concurrent agents (Redis cache behavior under load).
- H4 (P2) Metrics/dashboards (Grafana or hosted APM) beyond current console logging.
- H5 (P0) Alerting runbook: what fires Slack vs. email, who's on call, escalation path.

### I — DevOps / Infrastructure / Deployment
- I1 (P0) CI pipeline: build + test + lint on every PR (none exists today).
- I2 (P0) Real EF Core migrations, replacing `EnsureCreatedAsync` before any production data exists.
- I3 (P0) Staging environment stood up, mirroring production topology.
- I4 (P0) Production environment: hosting decision, domain, TLS, DNS.
- I5 (P0) Secrets management for production (replace `.env` file with a vault/secrets manager).
- I6 (P1) Automated Postgres backups + a tested restore procedure.
- I7 (P2) CD pipeline (auto-deploy to staging on merge; manual gate to production).

### J — Security & Compliance
- J1 (P0) Rotate JWT signing key via secret store; remove dev default from any reachable prod path.
- J2 (P0) Rate limiting on auth endpoints (login, register, forgot-password) to blunt brute-force/abuse.
- J3 (P1) OWASP-style review pass on all new endpoints (the codebase's own top-line rule).
- J4 (P1) Dependency vulnerability scan (dotnet, npm) wired into CI.
- J5 (P2) External penetration test before broad go-live — schedule for early v1.1 if December is fixed and this can't fit.

### K — Documentation & Launch Readiness
- K1 (P0) Postman collection extended to cover every new admin/dashboard endpoint.
- K2 (P0) Admin/agency user guide (how to onboard an agency, manage credit, handle a booking).
- K3 (P0) Go-live checklist and rollback plan.
- K4 (P0) UAT with at least one real pilot agency before public launch.
- K5 (P1) Internal on-call runbook (incident response, common failure modes).

## Explicit v1 → v2 boundary

**Deferred to Version 2, not scheduled here:**
- AI engine (`ai-engine-python`) — personalization, recommendations, anything consuming `booking-created` for ML purposes. The Kafka scaffolding exists but no model/logic has been built, per your instruction to hold this until after v1 ships.
- In-app notification center.
- Multi-supplier abstraction beyond Sabre (interface is ready; only Sabre is wired).
- Partial ticketing, full reconciliation automation, external penetration test (all P2 above — carry forward if not completed).

## Risk flags worth stating plainly

- **The frontend risk shifted, it didn't disappear.** The mockup arriving pre-built (and arriving immediately, not in 2–4 weeks as first estimated) removed the "build a whole app from scratch" risk, but replaced it with an integration risk concentrated in two specific tasks: E0b (auth bridge) and E0c (gRPC bridge), now scheduled in Sprint 2 (moved up from Sprint 3 so they're off the critical path before Module 1 needs them). Landing early doesn't reduce the effort either task takes — it just means there's no reason left to wait to start them.
- **Module 7 (Topup/Payment) carries new, unestimated external risk.** The online payment gateway (T1) is new v1 scope as of 2026-09-01 and has no vendor chosen yet — vendor selection, KYC/merchant onboarding, and sandbox credentials are typically the slowest part of a gateway integration and sit outside engineering's control. Recommend picking a vendor by end of Sprint 4 (Oct 23) at the latest so T1 isn't still blocked when Sprint 6 (Nov 9) starts. If it slips, the offline top-up flow (T2/C3) can ship alone and the online option follow as a fast-follow.
- **Module 9 (Super Admin) now lands last, and the window is tight.** Sequencing UI wiring in your numbered module order pushes E6a/E6b/C4–C7/E8 into Sprints 7–8, immediately before UAT and launch prep — the CSV flags these rows "At Risk" for that reason. The backend (C1/C2, agency/agent CRUD) is safely done early as shared infra, so this risk is confined to the admin *screens*, not the platform's ability to onboard agencies during earlier testing. If Sprint 7–8 is over capacity, C6 (super-admin cross-tenant role) and C7 (tenant settings) are the first candidates to cut — both are already P2.
- **December is aggressive for the full scope above, more so now with Module 7's new scope.** The P0/P1/P2 split exists so that if the timeline compresses, cutting P2 (and then P1) items preserves a genuinely usable, secure product rather than an incomplete one. Recommend a scope checkpoint at the end of Sprint 4 (Oct 23) — the same point the payment-gateway vendor decision is due — to confirm P0 is still on track across all 9 modules.
- **Sabre cert-environment availability variance** (already observed this session — identical requests succeeding/failing non-deterministically) is a GDS characteristic, not a defect; it will resurface during UAT and shouldn't be mistaken for a regression.
