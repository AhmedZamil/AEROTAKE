# Task B4 — Trusted-Device Management

**Epic:** B · Auth & Identity Hardening · **Priority:** P2 · **Sprint:** 8 (Dec 7 – Dec 18) · **Estimate:** 3 days
**Reference:** [2026-08-29-b2b-v1-task-list.csv](2026-08-29-b2b-v1-task-list.csv), [2026-08-29-b2b-v1-project-plan.md](2026-08-29-b2b-v1-project-plan.md)

One-line scope from the task list: *"Trusted-device management (list/revoke from dashboard)."*

## Why this exists — the use case

The platform already has a device-verification login flow (`AuthController` + `DeviceVerificationService`): the **first** time a user logs in from a browser/device, they must confirm an emailed code before getting tokens. On success, the server hands back a `deviceToken` (`RegisterDeviceAsync`), the client stores it, and every **subsequent** login from that same device skips the code step (`IsKnownDeviceAsync`).

That flow has no visibility or control once it's set up. Concretely, today an agency user cannot:
- See which devices are currently trusted on their account.
- Revoke a device — e.g. after losing a laptop, leaving a shared/agency-office computer logged in, or an employee leaving the agency.
- Notice if an unfamiliar device got trusted (an early sign of a compromised password).

For a B2B agency channel where **one login can move real money** (ticket issuance debits the agency's credit ledger), "an ex-employee's browser can still skip verification forever" is a real exposure, not a cosmetic gap. B4 gives agency users and admins a **Security** view in the dashboard to see and prune that list — the standard "manage your devices" screen every serious SaaS product has (GitHub, Google, Slack all ship this).

**User stories this covers:**
1. *As an agency user*, I want to see every device currently trusted on my account, so I can spot one I don't recognize.
2. *As an agency user*, I want to revoke a device, so that a lost/stolen/shared machine can't skip email verification on my account anymore.
3. *As an agency admin*, I want the same visibility for my agency's other users (ties to B1's role model), so I can respond when an employee leaves.

## Current state (what already exists — don't rebuild this part)

| Piece | File | Status |
|---|---|---|
| `UserDevice` entity | `Domain/Entities.cs:127` | Exists — but bare: only `UserId` + `DeviceToken`. No label, no last-used timestamp, no user-agent/IP. |
| Device registration on verified login | `DeviceVerificationService.RegisterDeviceAsync` | Exists — inserts a new row, returns the token to the client. |
| Skip-verification check | `DeviceVerificationService.IsKnownDeviceAsync` | Exists — a plain existence check against `UserDevices`. |
| List/revoke API | — | **Does not exist.** No endpoint reads or deletes `UserDevice` rows today. |
| Dashboard Security UI | — | **Does not exist.** Frontend has no settings screens at all yet (Epic E). |

## The one design decision this task hinges on

**JWTs in this system are fully stateless — there is no session store and no revocation list** (`JwtTokenService`'s own doc comment says so explicitly). A refresh token, once issued, is valid for 30 days no matter what happens server-side afterward. Device tokens and JWTs are **not linked** — `RegisterDeviceAsync` and `IssueTokens` are separate, uncorrelated calls.

That means "revoke a device" can mean one of two different things, and the task list's 3-day estimate only fits the first:

- **Option A — "forget this device" (matches the 3-day estimate).** Deleting a `UserDevice` row only affects **future logins**: the next login attempt from that browser will no longer skip email verification, because `IsKnownDeviceAsync` will return `false` again. Any access/refresh token issued *before* the revoke keeps working until it naturally expires (≤15 min for access, ≤30 days for refresh). This is honest, useful, and matches what the estimate can buy.
- **Option B — "kill this device's active session right now."** Requires adding actual refresh-token revocation (e.g., a revoked-`jti` table or Redis set checked in `ValidateRefreshToken`), which touches `JwtTokenService`, `AuthController`, and every refresh call. That's materially more than 3 days and isn't scoped in this task.

**Recommendation:** build Option A for v1, and say so explicitly in the UI copy (e.g., "Removing a device requires it to verify by email again next time — active sessions may continue for up to 30 days"). Track real session revocation as a separate, explicitly-scoped task if the business decides the risk window is unacceptable — don't silently under-deliver against a "revoke" label that implies Option B.

## Scope of work

### 1. Data model (small migration — depends on task **I2**, real EF migrations)
Extend `UserDevice`:
```csharp
public class UserDevice : TenantScopedEntity
{
    public Guid UserId { get; set; }
    public User User { get; set; } = default!;
    public string DeviceToken { get; set; } = default!;
    public string? Label { get; set; }        // e.g. "Chrome on Windows" — parsed from User-Agent at registration
    public DateTimeOffset LastSeenAt { get; set; }
}
```
`CreatedAt` already exists on `TenantScopedEntity` and doubles as "first seen." `Label` is derived automatically from the request's `User-Agent` header at registration time — no user input required, so there's no new form to build. `LastSeenAt` updates on every successful `IsKnownDeviceAsync` hit (cheap — one `SaveChangesAsync` on an already-loaded row).

### 2. Backend API — new endpoints on `AuthController` (or a new `DevicesController`)
- `GET /api/v1/auth/devices` — list the caller's own devices (`Label`, `CreatedAt`, `LastSeenAt`, `Id`). Scoped to `sub` from the JWT — never accepts a target user id from the client.
- `DELETE /api/v1/auth/devices/{id}` — revoke one device (delete the row). Returns `404` if the id doesn't belong to the caller (don't leak existence of other users' device ids).
- Both routes require a valid access token (ties to **B1** — role enforcement must already be wired for this to be meaningfully protected).
- Emit an audit entry on revoke (ties to **B3** — auth audit log) if B3 has landed by this sprint; if not, a plain structured log line is an acceptable placeholder.

### 3. Frontend — Security section (part of Epic **E8**, Settings UI)
- A "Devices" panel: table of `Label · Last seen · First seen · [Revoke]`.
- Confirm dialog before revoke ("You'll need to verify by email next time you sign in from this device.").
- Empty state for a brand-new account with only the current device.
- No new design system needed — reuses the same table/list pattern as the ledger and agent-list screens elsewhere in Epic E, so once those land this is mostly composition, not new UI primitives.

### 4. Testing
- Integration test: revoke a device → next `POST /login` with that device's old token no longer skips verification (`deviceVerificationRequired: true` again).
- Integration test: a user cannot list or revoke another user's device (403/404, not data leakage).
- Integration test: `LastSeenAt` updates on a known-device login without creating a duplicate row.

## Finishing this without the frontend

The dashboard frontend isn't being built from scratch here — a coded mockup from a separate project is expected to land in this repo within 2–4 weeks (roughly mid-to-late September). It exists as UI/screens but isn't wired to any real API yet. That changes what "done" means for this task: split it into two milestones instead of one.

**Milestone 1 — Backend-complete (this is what actually gets built in Sprint 8, no frontend required).**
Steps 1–3 and 5 below (data model, service layer, controller endpoints, tests) are fully self-contained and verifiable without a single line of UI. "Done" for this milestone means:
- `GET /api/v1/auth/devices` and `DELETE /api/v1/auth/devices/{id}` exist, are authorized, and pass the integration tests in Step 5.
- The two requests are added to the Postman collection (folded into task K1) and manually verified there — this is the actual acceptance mechanism in the absence of a UI, exactly like `IssueTicket`/`ProcessB2BBooking` were verified live via Postman before any dashboard existed.
- The feature is real and usable by anyone with API access (support staff, another internal tool) even with zero frontend integration.

**Milestone 2 — Frontend-integrated (a follow-on task, not part of B4's own estimate).**
Once the mockup lands and its own onboarding work (**E0a**, **E0b** — see the master task list) is done, wiring this into its Settings section is a small, separate follow-up: point its existing device-list UI (if the mockup has one) or a new panel at the two endpoints above. Because the API contract is already frozen and tested by Milestone 1, this integration step is low-risk and shouldn't need backend changes — the mockup team/track can pick it up independently, on its own schedule, without reopening this task.

**The practical answer:** B4 ships as a backend-only, Postman-verified feature in Sprint 8. Add its dashboard entry point later as a small Epic E follow-up once the real frontend exists — don't hold Sprint 8 open waiting for UI that isn't on this task's critical path.

## Implementation plan

Six steps, in order — each one buildable and independently testable before moving to the next. Steps 1, 2, 3, and 5 are Milestone 1 (backend-complete, this task's actual Sprint 8 scope) and can start as soon as **I2** (real EF migrations) has landed a working migration workflow. Step 4 is Milestone 2 (frontend integration) and is explicitly out of this task's estimate — it's scheduled independently once the incoming mockup and its auth bridge exist.

### Step 1 — Extend `UserDevice` + migration
- `Domain/Entities.cs` — add `Label` (`string?`) and `LastSeenAt` (`DateTimeOffset`) to `UserDevice` (see schema in "Data model" above).
- `Data/OtaDbContext.cs` — no new `DbSet` needed (already registered); confirm the entity config doesn't need an explicit `HasIndex` beyond the existing `(UserId, DeviceToken)` lookup `IsKnownDeviceAsync` already relies on.
- Generate the migration: `dotnet ef migrations add AddUserDeviceLabelAndLastSeen --project apps/core-engine-dotnet/src` (exact command depends on how I2 wires up the EF CLI — adjust to match whatever migration workflow that task establishes).
- Backfill: existing rows get `LastSeenAt = CreatedAt` and `Label = null` (the UI falls back to "Unknown device" for a null label — see step 4).

### Step 2 — Service-layer changes in `DeviceVerificationService`
- `RegisterDeviceAsync(Guid userId, CancellationToken ct)` → add an `HttpContext`-sourced `userAgent` parameter (or read it in the controller and pass it in), and set `Label` by parsing the `User-Agent` string into something human-readable (e.g. "Chrome on Windows", "Safari on iPhone"). A small static helper (`UserAgentLabeler.cs`) is enough — no need for a full parsing library for a best-effort label.
- `IsKnownDeviceAsync(Guid userId, string? deviceToken, CancellationToken ct)` → on a match, also update that row's `LastSeenAt = DateTimeOffset.UtcNow` and `SaveChangesAsync` before returning `true`. This is the only place "last seen" gets refreshed, so a device that's never used again naturally shows a stale, honest timestamp.
- Add two new interface methods to `IDeviceVerificationService`:
  ```csharp
  Task<IReadOnlyList<UserDevice>> ListDevicesAsync(Guid userId, CancellationToken ct);
  Task<bool> RevokeDeviceAsync(Guid userId, Guid deviceId, CancellationToken ct); // false = not found / not owned
  ```
  `RevokeDeviceAsync` must filter by both `userId` and `deviceId` in the same query (not fetch-then-check) so there's no window where a stale in-memory check could delete the wrong row.

### Step 3 — Controller endpoints
- Add to `AuthController.cs` (co-located with the rest of the auth surface, rather than a new controller — this is a small, tightly-related feature):
  - `GET /api/v1/auth/devices` → `[Authorize]`, reads `sub` claim from `User.Claims` (same pattern already used elsewhere for the authenticated user id), calls `ListDevicesAsync`, maps to a `DeviceResponse(Guid Id, string Label, DateTimeOffset FirstSeenAt, DateTimeOffset LastSeenAt)` DTO — **never** return the raw `DeviceToken` in the response body, it's a bearer credential.
  - `DELETE /api/v1/auth/devices/{id}` → `[Authorize]`, calls `RevokeDeviceAsync`; return `204` on success, `404` on not-found-or-not-owned (identical response for both cases — don't let the status code confirm whether an id exists for another user).
- No changes needed to `Program.cs` — `[Authorize]` on the new actions reuses the JWT bearer scheme already registered there.

### Step 4 — Frontend (Milestone 2, out of this task's estimate — see "Finishing this without the frontend")
Not built as part of B4. Once the incoming mockup is onboarded (**E0a**) and its auth bridge exists (**E0b**), a follow-up task wires a `DeviceList` view into its Settings section: fetch `GET /api/v1/auth/devices`, render `Label (or "Unknown device") · Last seen <relative time> · First seen <date>` per row, a "Revoke" button with a confirm modal using the exact copy from the design-decision section above, `DELETE /api/v1/auth/devices/{id}` on confirm, optimistic row removal. That follow-up is scheduled and estimated separately, whenever the mockup's Settings section is ready to receive it.

### Step 5 — Tests
Add to `apps/core-engine-dotnet/tests/Ota.CoreEngine.Tests/Integration/` (new `DeviceManagementTests.cs`, following the existing fixture pattern in `AgentsControllerTests.cs`):
1. Register → verify device → `GET /devices` returns exactly one row with a non-null `LastSeenAt`.
2. `DELETE /devices/{id}` on your own device → `204` → next `POST /login` with the old device token → `deviceVerificationRequired: true`.
3. `DELETE /devices/{id}` on a different user's device id → `404`, and confirm the target row still exists (no accidental cross-tenant delete).
4. Two logins in a row from the same known device → still exactly one `UserDevice` row, `LastSeenAt` advanced, no duplicate insert.

### Step 6 — Rollout / verification (closes out Milestone 1 — this is B4's actual "done")
- Run the migration against the dev database (`docker compose exec postgres` already has a working psql path from earlier sessions — use it to spot-check the new columns post-migration).
- Manually verify via the Postman collection: extend it with the two new requests (`List Devices`, `Revoke Device`) in the Auth folder, chained after the existing "Verify Device" request — this becomes part of task **K1** (Postman collection extended for every new endpoint), not a separate effort. This Postman verification, not a UI, is what closes out B4.
- When Milestone 2 (frontend wiring) eventually happens, its reviewer should confirm the confirm-modal copy matches the "design decision" section above — flagged here so it isn't lost between now and whenever that follow-up is picked up.

## Acceptance criteria

**Milestone 1 (Sprint 8, this task):**
- [ ] A caller with a valid access token can list every device trusted on their account via `GET /api/v1/auth/devices`, with a human-readable label and last-seen time.
- [ ] `DELETE /api/v1/auth/devices/{id}` revokes a device; the very next `POST /login` from that device's old token returns `deviceVerificationRequired: true` again.
- [ ] Revoking a device never affects other users' devices, even within the same agency/tenant (test 3 in Step 5).
- [ ] New endpoints are covered by the same role/tenant enforcement as the rest of the auth surface (B1).
- [ ] Both endpoints are in the Postman collection and manually verified there.

**Milestone 2 (later, separate estimate):**
- [ ] A dashboard Settings panel lists devices and can revoke one, wired into the mockup's Settings section.
- [ ] Its confirm-modal copy is honest about what revoke does and doesn't do (no implied instant session kill — see the design decision above).

## Dependencies
- **I2** (real EF Core migrations) — this task adds columns to `UserDevice`; doing that against `EnsureCreatedAsync` instead of a migration would work in dev but is exactly the kind of change I2 exists to make safe.
- **B1** (role-based authorization) — the list/revoke endpoints are only meaningfully secure once auth is enforced platform-wide.
- **B3** (auth audit log) — soft dependency; Milestone 1 still functions without it, just with a plain log line instead of a full audit trail.
- **E0a** (mockup onboarded), **E0b** (auth bridge built) — hard dependencies for Milestone 2 only, not for Milestone 1.

## Why it's P2, not P0
Nothing about search, booking, ticketing, or the tenant admin backend depends on this. Its absence at launch is a real but bounded risk (a stale trusted device stays trusted until it naturally... doesn't expire, per the design decision above — which is itself an argument for pulling this forward if agency security concerns come up during UAT). It's correctly placed at the end of Sprint 8 as the first thing to cut if P0 work runs long, and the first thing to reinstate in a v1.1 patch if it does get cut.
