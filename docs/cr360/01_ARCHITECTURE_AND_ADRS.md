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
| `app/360/**` | Role workspaces: `ceo`, `manager`, `students` (+ guardian link admin), `classes` (timetable, 2.5D fill), `crm` (Kanban), `finance` (operational, unreconciled), `staff`, `parent`, `schools` |
| `app/api/cr360/**` | `me`, `locale`, `staff/{clock,leave,ot,correction}`, `approvals/decision`, `guardians/{link,verify,revoke}`, `crm/lead-action`, `finance/mark-paid`, `shifts/{create,cancel}`, `attendance/mark` |
| `components/cr360/**` | Shell (rail + mobile bottom nav), TimeClock, RequestForms, BranchChart |
| `supabase/proposed/**` | Migrations + rollbacks awaiting approval |
| `supabase/tests/rls_negative_tests.sql` | Staging-only RLS negative tests (self-rolling-back) |
| `tests/unit/**` | Vitest (117 tests) · `tests/e2e/boundary-smoke.mjs` auth-boundary smoke |
| `tests/db/**` | Local Postgres harness: schema-only production replica, baseline exploit reproduction, migration/rollback verification |

## ADRs

**ADR-001: Extend this repo; don't start a new one.** The owner asked to continue from existing code and preserve records. The 360 app lives under `/360` beside the legacy app, which keeps working throughout. Route groups requested (`/ceo`, `/staff`…) are mounted at `/360/ceo`, `/360/staff`… because `/staff` is already a legacy route.

**ADR-002: No service-role key in the app.** All server code acts as the signed-in user (publishable key + session cookie), so RLS always applies. Privileged operations are narrow `SECURITY DEFINER` RPCs that check `auth.uid()` and memberships (e.g. deployed `cr360_hr_clock`, proposed `cr360_hr_decide_request`).

**ADR-003: Authorization source = DB membership rows.** `loadViewer()` uses `auth.getUser()` (server-verified) and reads `cr360_hr_memberships` / `cr360_hr_employees`. It never consults `user_metadata` or UI selections. Navigation hiding is UX only; every page and route re-checks.

**ADR-004: Two-layer enforcement.** Pure TS policy (`access.ts`) is unit-tested and used by pages/routes. RLS is the final gate, tested by `supabase/tests`. A bug in one layer is caught by the other.

**ADR-005: Staff never see money fields by default.** This is the owner's decision. StaffOS queries select no money columns; `redact.ts` strips them defensively; `canReadPayroll` denies staff, teachers, finance-by-role and partners.

**ADR-006: Ledger, not counters.** Session balance is derived from append-only entries. Attendance debit is idempotent per (student, class session); undo is a compensating credit with a reason. Legacy `sessions_used` stays until migrated. Its existing `UNIQUE(package_id,date)` already prevents double debit; `0003` adds an append-only audit.

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

**ADR-011: Prove migrations on a schema replica before asking for approval.** There is no staging project yet, so `tests/db/run.sh` rebuilds the production schema from a read-only catalog snapshot in a throwaway local Postgres. It reproduces each finding, then verifies fix, idempotency and rollback. The harness disproved one of my own audit findings (P2-8) and two bugs in the staging RLS tests, which is why it exists.

**ADR-012: Students are keyed by the legacy `student_id` code; balances are rebuilt from attendance.** Legacy has no students table. `/360/students` groups packages by code and never merges by name. It rebuilds each package ledger from attendance rows and flags any package whose stored `sessions_used` counter disagrees (0 of 182 today). Because legacy RLS lets any staff member read all packages, the branch filter in `lib/cr360/legacy-students.ts` is the effective boundary for managers in `/360` until per-branch legacy policies land. The legacy Records app itself is not restricted by this.

**ADR-013: Parents authorise through verified links, never through tables.** Guardians get no table grants at all (0006). They read via one SECURITY DEFINER function (0005) that returns only children with a verified, consented, unrevoked link, with names joined in. The child's branch, URL, or a guessed id never grants access.

**ADR-014: Page through every bulk read.** Supabase caps each response at its max-rows setting (1000 by default) regardless of `.limit()`. All `/360` bulk reads use `fetchAllPages` with a stable `id` order; hitting the safety cap shows an error instead of a silently short total.

**ADR-015: Write to legacy tables only where the legacy app already does, with the same semantics.** The CRM stage moves replicate the Records app's exact field changes, add server-side branch scoping, and guard against races with a conditional UPDATE on the status the user saw. Conversions that need several records (trial booking, registration/payment) stay in the Records app until a transactional RPC exists.

**ADR-016: Multi-row business events are one database function.** Recording a payment touches income, registration, invoice and (via trigger) the session package. It runs as one `SECURITY DEFINER` function under a row lock, idempotent by invoice state, with legacy role and closed-month rules enforced inside. Browser code never sequences financial writes.

**ADR-017: AI drafts, humans approve; children are de-identified before any model call.** Parent reports are drafted by Claude (`lib/cr360/ai-reports.ts`, official SDK, structured output, server-side refusal fallback) or by a deterministic template. The model receives only lesson content, rubric scores and notes with every class member's name removed (`lib/cr360/reports.ts`). The send is refused if a name survives. Drafts are never saved or shown to parents without a teacher's explicit approval, and the database (0010) enforces that edits reset approval.
