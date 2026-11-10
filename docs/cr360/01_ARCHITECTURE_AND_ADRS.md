# ClickRobot 360 — architecture & decision records

## Shape of the system

```
Browser (Lao/English, mobile-first)
  └─ Next.js 16 App Router (this repo)
       ├─ Legacy Records app  /, /attendance, /invoices, …   (client-side, unchanged)
       └─ ClickRobot 360      /360/{ceo,manager,staff,parent,finance,schools}
            ├─ Server Components: loadViewer() → auth.getUser() + cr360 membership rows
            ├─ Route handlers  /api/cr360/*  (Zod, same-origin check, no client-supplied ownership)
            └─ lib/cr360/*     pure domain rules (access, ledger, booking, geo, payroll, money)
  └─ Supabase (single project) — Auth, Postgres + RLS, RPCs
       ├─ public.*            legacy tables (preserved)
       ├─ public.cr360_hr_*   StaffOS v0.4 (deployed; used by /360/staff and /360/manager)
       ├─ cr360_vault.*       contracts / payroll (no API access; server RPC only)
       └─ supabase/proposed/* new migrations — NOT applied, approval-gated
```

## Code map

| Path | Purpose |
|---|---|
| `lib/cr360/types.ts` | Roles, Viewer, grants |
| `lib/cr360/access.ts` | Default-deny policy functions mirroring RLS |
| `lib/cr360/redact.ts` | Field-level money/ID redaction + safe directory allow-list |
| `lib/cr360/ledger.ts` | Append-only session ledger, idempotent debit, compensating reversal |
| `lib/cr360/booking.ts` | Capacity, duplicate seat, cross-branch teacher overlap |
| `lib/cr360/geo.ts` | Haversine, ≤10 m pre-check, DB error → reason codes |
| `lib/cr360/payroll.ts` | draft→review→approved→paid with separation of duties |
| `lib/cr360/money.ts` | bigint minor units, exact parsing, rate snapshots |
| `lib/cr360/schemas.ts` | Zod API contracts (`.strict()`, rejects ownership fields) |
| `lib/cr360/i18n.ts` | `en` / `lo` dictionaries, Asia/Vientiane business dates |
| `lib/cr360/viewer.ts`, `supabase-server.ts`, `api.ts` | Server-only auth context and helpers |
| `app/360/**` | Role workspaces |
| `app/api/cr360/**` | `me`, `locale`, `staff/{clock,leave,ot,correction}` |
| `components/cr360/**` | Shell (rail + mobile bottom nav), TimeClock, RequestForms, BranchChart |
| `supabase/proposed/**` | Migrations + rollbacks awaiting approval |
| `supabase/tests/rls_negative_tests.sql` | Staging-only RLS negative tests (self-rolling-back) |
| `tests/unit/**` | Vitest (41 tests) · `tests/e2e/boundary-smoke.mjs` auth-boundary smoke |

## ADRs

**ADR-001: Extend this repo; don't start a new one.** The owner asked to continue from existing code and preserve records. The 360 app lives under `/360` beside the legacy app, which keeps working throughout. Route groups requested (`/ceo`, `/staff`…) are mounted at `/360/ceo`, `/360/staff`… because `/staff` is already a legacy route.

**ADR-002: No service-role key in the app.** All server code acts as the signed-in user (publishable key + session cookie), so RLS always applies. Privileged operations are narrow `SECURITY DEFINER` RPCs that check `auth.uid()` and memberships (e.g. deployed `cr360_hr_clock`, proposed `cr360_hr_decide_request`).

**ADR-003: Authorization source = DB membership rows.** `loadViewer()` uses `auth.getUser()` (server-verified) and reads `cr360_hr_memberships` / `cr360_hr_employees`. It never consults `user_metadata` or UI selections. Navigation hiding is UX only; every page and route re-checks.

**ADR-004: Two-layer enforcement.** Pure TS policy (`access.ts`) is unit-tested and used by pages/routes. RLS is the final gate, tested by `supabase/tests`. A bug in one layer is caught by the other.

**ADR-005: Staff never see money fields by default.** This is the owner's decision. StaffOS queries select no money columns; `redact.ts` strips them defensively; `canReadPayroll` denies staff, teachers, finance-by-role and partners.

**ADR-006: Ledger, not counters.** Session balance is derived from append-only entries. Attendance debit is idempotent per (student, class session); undo is a compensating credit with a reason. Legacy `sessions_used` stays until migrated; `0003` adds DB idempotency and audit to it now.

**ADR-007: Money as bigint minor units plus rate snapshots.** No float arithmetic and no "current rate" assumptions. CEO compensation and partner distributions live in separate confidential finance.

**ADR-008: GPS is a signal, not proof.** The server timestamp and site check run in the DB. Sites stay disabled until verified on site; coordinates are never inferred from map links. A rejection never deducts pay, and a correction request is always offered. No background tracking. Wi-Fi SSID is not attempted (browsers cannot read it).

**ADR-009: Bilingual via cookie dictionary.** A server-rendered locale avoids hydration flicker. `lo` text uses Noto Sans Lao / Phetsarath fallbacks with taller line-height.

**ADR-010: Proposed migrations live outside `supabase/migrations`.** That way `supabase db push` can never apply them by accident. Each has a rollback, pre-flight queries and verification steps.

## Legacy → target migration map (Phase 1b+)

| Legacy (`public`) | Target | Strategy |
|---|---|---|
| `users` (role, salary, bank, ID) | `cr360_hr_employees` (safe) + `cr360_vault.contracts` (pay) + memberships | Backfill by script after 0001/0002; keep `users` read-compatible until legacy pages are retired |
| `student_packages` (counter) | ledger (`clickrobot.session_ledger` or new) | Opening balance entry = `sessions_total - sessions_used` per package, reconciled report before switch |
| `attendance` | attendance + ledger debit | 0003 first; then dual-write |
| `invoices` / `income_records` (float numeric) | invoices/payments/allocations in minor units | Convert with recorded `rate_to_lak` as snapshot; never recompute |
| `leave_requests` (legacy) | `cr360_hr_leave_requests` | Migrate history read-only after membership bootstrap |
| `leads`, `lead_activities` | CRM (Phase 3) | Add branch scoping and consent |
