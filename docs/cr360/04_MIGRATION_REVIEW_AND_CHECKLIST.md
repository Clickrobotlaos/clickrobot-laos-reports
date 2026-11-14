# ClickRobot 360 — migration review, backup/restore and authorization checklist

**Prepared:** 2026-11-11 · **Production changes made by this work:** none (read-only inspection only)
**Scope:** `supabase/proposed/0001`–`0013`, revised for owner decisions A–D of 2026-11-11.

> Nothing in this document has been applied to the live database. Each migration below needs your
> separate, explicit authorization. Approving the review is not approving the application.

## 0. What changed in production today (not from this repository)

Four migrations were applied to production on **2026-11-11 between 05:05 and 05:16 UTC** by a process
outside this repository (`staffos_phase3_*`). I read them from `supabase_migrations.schema_migrations`
(read-only) and rebuilt the test replica on top of them, so every result below is measured against
**today's** production.

| Production change today | Effect | What it means for this plan |
|---|---|---|
| `users`: signed-in users can SELECT only directory columns; read policy = self, admin, co_admin; self-edit policy dropped; anon revoked from `salary_payroll` | Closes P0-2 (self-promotion) and P0-3 (salary reads) | Good. But **nobody, not even the CEO, can read salary/bank/ID through the API now**, and staff can no longer edit their own phone. The Records app's Profile, Staff, Staff detail and Payroll pages asked for `select("*")`, which is now refused. This branch fixes those pages (`lib/legacy-users.ts`) |
| New branch row, shift templates, check-in attempt queue, corrected request policies, 1 CEO + 1 manager StaffOS membership | Pilot setup | Compatible with 0004/0008/0012. Branch count is now 3 |
| `staffos_payroll_report`, `staffos_review_attendance`, `staffos_propose_payroll_adjustment`: only callable with the **service-role key** | A server holding the service-role key is planned | This app deliberately has **no** service-role key (ADR-002). Two parallel designs now exist; see decision 6 |

**Still open in production right now:** P0-1. `admin_deep_reset` / `admin_nuclear_reset` are executable by
`anon` (verified 2026-11-11 after the changes above). Anyone with the public key can start a data wipe.

## 1. Baseline (read-only, 2026-11-11, before any change)

| Item | Count |
|---|---|
| users | 3 |
| branches | 3 |
| student_packages | 182 (sessions_used total 6) |
| attendance | 6 (0 packages with 2 rows on one day) |
| invoices / income_records | 2 / 0 |
| salary_payroll | 0 |
| leads / classes / class_bookings | 3 / 0 / 0 |
| invoices with share token shorter than 16 chars | 0 (0002 length guard is safe) |
| users with a status other than Active / On leave / Terminated | 0 (0012 constraint change is safe) |
| `ceo360.*` and `clickrobot.*` | all 24 tables empty, no API access (see §6) |

Record these again immediately before applying. Every migration must leave these counts unchanged
(verified on the replica, and verifiable on a restored backup with `tests/db/restore-check.sh`).

## 2. Per-migration review

"Rows changed" = rows inserted, updated or deleted in existing tables when the migration is applied.

| # | Purpose | Database impact | Rows changed | Rollback | Depends on |
|---|---|---|---|---|---|
| **0001** | **Close anonymous data wipe (P0-1)**; trigger guard on role/salary/status self-edits (P0-2, defence in depth); pin `search_path` on 11 functions | REVOKE EXECUTE from anon on 2 functions; 1 trigger; function settings | **0** | Restores grants (leaky) | — |
| **0002** | Decision B: need-to-know pay. Row read = self / CEO / CEO-granted payroll admin; `cr360_staff_confidential()` returns full records to exactly those people; pay/bank/ID writes need the same; staff read own payslips; exact-token invoice share link (P1-4) | 1 new table (`cr360_authz.payroll_grants`, append-only); 2 triggers; 5 functions; policy changes on `users`, `salary_payroll`, `invoices` | **0** | Restores the 2026-11-11 policies; keeps grant history | 0001 |
| 0003 | Append-only audit trail of every attendance change | 1 audit table + triggers | **0** | Drops triggers; keeps audit table | — |
| 0004 | Audited approve/reject for leave, OT, corrections | 1 audit table (`cr360_vault.audit_events`); 1 function | **0** | Drops function; keeps audit table | — |
| 0005 | Verified parent↔child links (pending → in-person verified + consent version → revocable) | 1 table; 6 functions | **0** | Drops functions; keeps links | 0004 |
| **0006** | Decision A + parent safety: legacy data readable only by employed staff; `my_role()` = NULL when Terminated, Suspended, past `end_date` or past `contract_end` (On leave keeps access) | Function bodies + 24 `ALTER POLICY` | **0** | Restores "any signed-in user" (leaky once parents exist) | 0001 |
| 0007 | Record a payment once, atomically (income + registration + invoice) | Unique index on `income_records.invoice_id`; 1 function | **0** (0 income rows today) | Drops both | 0001 |
| 0008 | Manager shift planner (no overlap, no back-dating, audited) | 2 functions | **0** | Drops functions | 0004 |
| 0009 | Parent requests (absence, makeup, extension, schedule) + manager decisions | 1 table; 5 functions | **0** | Keeps requests table | 0005 |
| 0010 | Lesson log, student follow-up, parent reports with teacher approval; **manager-assigned substitutes** (dated, revocable, audited). Only teacher/assistant, assigned substitute, branch manager, CEO can read private teaching records | 3 tables; 9 functions | **0** | Drops functions; keeps records | 0004, 0005, 0006 |
| **0011** | Decision C: several classes per day; one deduction per attended class; never twice | Replaces `UNIQUE(package_id,date)` with per-class unique index + class-less unique index + race-safe trigger | **0** | Refuses if any package has 2 rows on a day (would require deleting attendance) | 0003 |
| **0012** | Decision A: memberships follow employment; CEO-only audited suspend / reinstate / offboard; `Suspended` status | Widens `users_status_check`; redefines 3 v0.4 helper functions; 5 functions | **0** | Refuses while anyone is Suspended | 0002, 0004, 0006 |
| 0014 | Parent portal: next-14-day schedule (incl. makeups) and invoices/payments linked to the child's packages; read-only functions for verified parents | 2 functions | **0** | Drops functions | 0005 |
| 0015 | Achievements & certificates: teacher proposes, branch manager/CEO issues (numbered), declines or revokes with reason; parents see issued ones and print certificates; audited | 1 table + counter; 6 functions | **0** | Drops functions; keeps records | 0005, 0010, 0012 |
| 0016 | Private class photos/short videos: private Storage bucket, upload by class staff only, shared only if every tagged child has media consent (re-checked on each read), 6 photos + 1 video (≤60 s, ≤50 MB) per class/day, hidden after 90 days, audited | Bucket row + 1 table + storage policies | **0** | Drops policies/functions; keeps files and table | 0010, 0013 |
| 0017 | In-app announcements (parents/staff, Lao/English, dated); branch manager own branch, CEO any/all; draft→published→withdrawn kept; nothing sent externally; audited | 1 table; 5 functions | **0** | Drops functions; keeps announcements | 0005, 0012 |
| 0018 | Secure in-app parent–staff messaging per child; parent (verified) ↔ branch manager/CEO and the child's own teachers/substitute only; append-only; close/reopen; 30 msgs/hour; never external or AI | 2 tables; 6 functions | **0** | Drops functions; keeps conversations | 0005, 0012, 0015 |
| 0019 | Branch finance: expense requests (manager approves up to a CEO-set limit, default 0 = CEO only; no self-approval; requester cannot pay; salary excluded); pay writes ONE expense_records row (closed months respected); daily cash count vs system cash, recounts kept | 3 tables; 9 functions | **0** (rows added only when paying) | Drops functions; keeps records | 0001, 0004, 0006, 0012 |
| 0020 | Inventory: CEO catalogue; append-only stock movements per branch (receive, use, transfer both sides at once, corrections/damaged/lost with note); no negative stock; staff view own branch | 2 tables; 4 functions | **0** | Drops functions; keeps history | 0010, 0012, 0019 |
| 0021 | Marketing campaigns, lead attribution (campaign / referring student) without altering `leads`, referral rewards only after registration (approve → given / decline), campaign cost per lead/registration, referral leaderboard | 3 tables; 5 functions | **0** | Drops functions; keeps records | 0004, 0006, 0012, 0020 |
| 0022 | Monthly budgets per branch/category (CEO); budget vs spent vs approved-unpaid report; managers cannot approve requests that exceed a budget (fills 0019's hook; rollback restores it) | 1 table; 4 functions | **0** | Restores hook; keeps budgets | 0019 |
| **0013** | Decision D: consent per purpose (portal media, AI reports, notifications, separate public marketing), private by default, reviewable/withdrawable; any guardian's withdrawal wins | 1 append-only table; 5 functions | **0** | Drops functions; keeps consent history | 0005 |

**No migration deletes, overwrites or reformats existing data.** The only statements that touch existing
rows are inside functions that run later when a person uses them (e.g. recording a payment).
Rollbacks never drop tables that hold records. Where a rollback would require deleting data (0011,
0012), it refuses and changes nothing.

### Bugs found and fixed during this review
- **NULL-guard flaw (same class as P0-1)** in my own 0002 draft: `is_ceo()` returned NULL for accounts
  without a legacy `users` row, and `if not NULL` never raises, so a 360-only manager (or a future
  parent) could have passed the CEO check. Fixed (`coalesce`), and **every** authorization guard in
  0004–0013 now uses `is not true`. Regression test added.
- `cr360_guardian_my_consents()` could show a parent an older consent choice (unordered `DISTINCT ON`
  inside a `UNION`). Fixed; test added.
- Restore script silently "restored" nothing when the dump was unreadable. Fixed; it now aborts.

## 3. Test evidence (local throwaway Postgres; never touches Supabase)

`npm run test:db` builds a replica of **today's** production schema (legacy schema snapshot + v0.4
foundation + the four 2026-11-11 migrations, with fictional fixtures), then:

| Phase | Checks |
|---|---|
| Staging RLS suite (self-contained) | 14 |
| Baseline on today's production replica (16 reproduce still-open issues, the rest confirm what is already closed) | 34 |
| After 0001–0013, applied **twice** (idempotency) | 269 |
| Rollback 0013→0001, re-apply, re-assert | 12 suites re-pass |

Decision-specific checks: payroll access (B) 34 · employment lifecycle (A) 19 · attendance per class (C) 10 ·
consent (D) 22 · substitutes (0010) 13. App: 139 unit tests; persona render suite (5 personas, Lao at
390 px); auth-boundary smoke; CI on every push.

**Not covered:** Supabase Auth/PostgREST/Storage themselves, production data volumes, real sign-in.

## 4. Backup and recovery procedure

1. **Backup** (owner, from a trusted computer; the dump contains personal data):
   ```bash
   # Supabase CLI (free) — uses the database password from Dashboard → Project Settings → Database
   supabase db dump --db-url "$PROD_DB_URL" -f backup-YYYYMMDD-HHMM.sql            # schema
   supabase db dump --db-url "$PROD_DB_URL" --data-only -f data-YYYYMMDD-HHMM.sql  # data
   cat backup-*.sql data-*.sql > full-YYYYMMDD-HHMM.sql
   ```
   Also note whether the Dashboard shows a daily backup for today (Database → Backups; depends on plan).
2. **Verify recovery before applying anything** (free, local, deletes the copy afterwards):
   ```bash
   bash tests/db/restore-check.sh full-YYYYMMDD-HHMM.sql             # restores + prints row counts
   REHEARSE=1 bash tests/db/restore-check.sh full-YYYYMMDD-HHMM.sql  # + applies 0001–0013 and rollbacks
   ```
   Pass condition: counts equal the §1 baseline, and the rehearsal prints both `PASS` lines.
3. **Restore, if ever needed:** prefer the migration's rollback file (fast, no data loss). Full restore =
   `psql "$PROD_DB_URL" -f full-….sql` into a **new** project, or Supabase point-in-time restore if the
   plan includes it. Never restore over production without a second backup.
4. Store the dump encrypted; delete local copies after the change window.

## 5. Staging
No paid service is used. Staging = the local replica (`npm run test:db`) plus the restored-backup
rehearsal (`restore-check.sh`), both on free local Postgres. Optional, no cost on the free tier: a second
Supabase project for real-auth tests with fictional data. Creating it needs your approval (decision 7).

## 6. `ceo360` and `clickrobot` schemas (decision F)
Inspected read-only: RLS on, no policies, no API usage grants, no functions or views, **all 24 tables
empty**. Nothing in this plan modifies, deletes or recreates them. Reuse plan (separate approval):
`clickrobot.session_ledger` (idempotency key, purchase/attendance/reversal/adjustment/transfer) is the
intended target for the ledger migration (ADR-006); `ceo360.approvals`/`audit_events` for the NOVA/CEO
command centre. No duplicate tables were created for those purposes in 0001–0013.

## 7. Authorization checklist (please answer per line)

**Before any migration**
- [ ] Backup taken (§4.1) and `restore-check.sh` passed on it (§4.2), with REHEARSE=1
- [ ] Baseline counts recorded (§1) on the day
- [ ] Change window agreed; nobody editing staff/payroll during it

**Group 1: urgent security (recommended today)**
- [ ] **0001**: close anonymous data wipe. Verify after: anon `select admin_deep_reset()` → permission denied
- [ ] **0002**: need-to-know pay (decision B). Verify: staff sees own payslip only; finance sees none; CEO sees all via function
- [ ] Decide: grant payroll access to anyone besides the CEO? (`select cr360_grant_payroll_access('<user>', 'reason')` as CEO)
- [ ] Decide: restore staff self-edit of **safe** profile fields (phone, address, emergency contact) that today's production change removed? (I can prepare it; 0001's trigger already blocks role/pay/status self-edits)

**Group 2: before any parent account exists**
- [ ] **0006**: employed-staff-only legacy access + termination/contract dates (decision A)
- [ ] **0004** → **0005** → **0013**: audit, verified parent links, consent
- [ ] Consent text (Lao + English) reviewed by counsel; version label set as `CR360_GUARDIAN_CONSENT_VERSION`

**Group 3: operations**
- [ ] **0003** → **0011**: attendance audit, then several classes per day (decision C)
- [ ] **0012**: suspend / reinstate / offboard (decision A)
- [ ] **0007**: one-time payment recording (before real payments are recorded in the app)
- [ ] **0008**, **0009**, **0010**: shifts, parent requests, lesson logs + substitutes
- [ ] **0014**, **0015**: parent schedule/invoices; achievements and certificates
- [ ] **0017**: in-app announcements
- [ ] **0018**: parent–staff messaging
- [ ] **0020**: inventory
- [ ] **0021**: marketing campaigns and referral rewards
- [ ] **0022**: budgets (after 0019)
- [ ] **0019**: branch finance (set the manager approval limit after applying)
- [ ] **0016**: class photos/videos. Check the plan's storage allowance first (estimate in the media section of the status report)

**After each group**
- [ ] Re-run §1 counts: unchanged
- [ ] Supabase security advisor: no new errors
- [ ] Sign in as each real role and open `/360`

**Separate decisions (no action without your yes)**
1. Deploy this branch (Vercel preview first)
2. Turn AI drafting on (`CR360_AI_DRAFTS_ENABLED`, `CR360_AI_MODEL`, key) after a verified test call
3. Enable leaked-password protection and MFA for CEO/HR/finance (Dashboard)
4. Remove or two-person-protect the reset features (P2-10)
5. Replace security-definer views used by `/p/[token]` (P1-5)
6. **Service-role pay gateway** (today's production functions) vs this app's no-service-role design: choose one. Keeping both doubles the payroll access surface
7. Optional free second Supabase project for real-auth staging
