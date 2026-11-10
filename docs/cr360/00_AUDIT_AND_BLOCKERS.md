# ClickRobot 360 — Phase 0 audit, risk register & security blockers

**Date:** 2026-11-10 · **Status:** NOT production-ready · **Production DB changes made in this phase:** none (read-only inspection only)

## 1. Production database — read-only audit (`clickrobot-records`, `eqafpmxohburlfuysfdv`, Postgres 17)

Audit method: Supabase security advisor + read-only `SELECT`s on `pg_policies`, `pg_proc`, `information_schema` and row counts. No DDL, no DML, no policy change.

**Migrations applied:** `20261106180455` neon_to_supabase_private_schema · `20261107160630` nova_ai_office_tasks_rls_realtime · `20261107165107` nova_agent_results_and_execution_times · `20261109184450` cr360_staffos_v04_isolated_foundation. The legacy `db/008…017.sql` files in this repo were applied manually and are **not** in migration history. Treat them as documentation of the live state, not as replayable migrations.

**Live data (row counts on 2026-11-10):** `public.users` 3 (roles: admin 1, co_admin 1, staff 1) · `branches` 2 · `student_packages` 182 (171 active) · `invoices` 2 (both `Sent`, both shared by token) · `attendance` 6 · `leads` 3 · `salary_payroll` 0 · `cr360_hr_memberships` 0 · `cr360_hr_employees` 0. **This data is real and must be preserved.**

**Schemas:**
| Schema | Contents | Notes |
|---|---|---|
| `public` (legacy Records app) | 26 tables + 6 views, policies built on `public.my_role()` reading `public.users.role` | Used by the current live app in this repo |
| `public.cr360_hr_*` + `cr360_vault` + `cr360_authz` | v0.4 StaffOS foundation (8 + 3 tables) | Deny-by-default; empty; **used by the new `/360` app** |
| `clickrobot` | students, guardians, student_guardians, packages, session_ledger, class_sessions, enrollments, attendance… | RLS on, **no policies** → API-closed. Not consumed by any app code. Candidate target model for Phase 1b. Do not assume it matches `public` |
| `ceo360` | companies, memberships, approvals, audit_events, agent_runs, vaki_* … | RLS on, no policies → API-closed. Origin unclear (not in this repo). **Owner to confirm purpose before reuse** |

### 1.1 Security findings

| ID | Sev | Finding | Evidence | Proposed fix |
|---|---|---|---|---|
| **P0-1** | **Critical** | `admin_deep_reset()` / `admin_nuclear_reset()` are `SECURITY DEFINER`, **EXECUTE granted to `anon`**. Their guard is `if my_role() <> 'admin'`, and for anon `my_role()` is NULL, so the guard evaluates NULL and never raises. **Anyone with the public anon key (it ships in every page) can wipe financial, lookup and settings tables** via `POST /rest/v1/rpc/admin_deep_reset`. | advisor lint 0028 + `has_function_privilege('anon',…)=true` + function source | `supabase/proposed/0001` |
| **P0-2** | **Critical** | `p_users_self_update` lets any signed-in user update **every column** of their own `users` row, including `role`, so a staff user can make themselves `admin` and then call the reset RPCs. The "self-edit lock" (README) is client-side only. | `pg_policies` | `0001` (column-guard trigger) |
| **P0-3** | High | `p_users_read = auth.uid() IS NOT NULL`, so every signed-in user can read every colleague's `base_salary`, `bank_account_no`, `id_card`, address and DOB. | `pg_policies`, `users` columns | `0002` (scope read + `staff_directory()` RPC) |
| P1-4 | High | `p_invoices_public = share_token IS NOT NULL`, so anon can **list every shared invoice** (child name, parent phone, amount), not just the one whose token they hold. | `pg_policies` | `0002` (`get_shared_invoice(token)` RPC) |
| P1-5 | High | 6 `SECURITY DEFINER` views (`v_parent_portal`, `v_class_today_roster`, `v_classes_today`, `v_packages_today`, `v_teacher_month_classes`, `v_contracts_expiring`) bypass RLS. `v_parent_portal` is read by anon from `/p/[token]`. | advisor lint 0010 | Phase 1b: replace with exact-token RPCs / `security_invoker` views. Needs app change to `/p/[token]` |
| P1-6 | Medium | Broad legacy policies: every signed-in user reads all `income_records`, `expense_records`, `invoices`, `student_packages`, `leads`, `leave_requests`, `daily_reports`, `settings` (incl. bank settings). `leads` UPDATE open to any signed-in user. No branch scoping anywhere in legacy. | `pg_policies` | Phase 1b branch-scoped policies (needs membership model) |
| P2-7 | Medium | 11 functions with mutable `search_path`. | advisor lint 0011 | `0001` |
| P2-8 | Medium | Legacy attendance can debit a package twice for the same class/day (no unique constraint); `sessions_used` is a mutable counter with no audit. | schema | `0003` (unique index + append-only audit). Pre-flight: 0 duplicates today |
| P2-9 | Low | Leaked-password protection disabled in Supabase Auth. | advisor | Dashboard toggle (owner) |
| P2-10 | Info | Destructive "reset" features exist in Settings at all. | `lib/backup.ts` | Owner decision: remove, or two-person + backup-confirmed |

**Recommendation:** approve and apply **0001 immediately** (staging first if a staging project can be created; otherwise production with a backup taken first). It changes no rows and does not affect legitimate admin use. Until it is applied, the live Records app is exposed to anonymous data destruction.

## 2. v0.4 prototype source audit (`reference-code/ClickRobot360-v04`)

- `app.js` (553 lines, ~93 functions) plus `styles.css` (43 lines, 13 CSS tokens). It's a single-page vanilla-JS app with 19 sections (Command Center, Students, Classes, Attendance, 3D Class Fill, Parent Portal, CRM, HR & Staff 360 [7 tabs], Announcements, School Partners, Billing, Daily Finance, Finance & Reports, Budget, CEO Vault, Branches, Inventory, Reports, Settings).
- **All state is held in `localStorage`** under one key, and all data is fictional. The role selector is a UI preview only, so it provides no security. GPS uses `getCurrentPosition` (single shot, which is good) but is compared client-side. WhatsApp uses `wa.me` deep links (6 references), and those are not proof of delivery.
- **Reused:** information architecture (the 19 sections map onto the 6 role workspaces), StaffOS tab flow (overview → time → leave/corrections → responsibilities → payroll → policies), single-shot GPS with an accuracy display, a "deductions OFF" default, and original punches retained on correction.
- **Not reused:** localStorage persistence, client-side role switching, client-side GPS verdicts, fake KPIs, scripted chatbot, WhatsApp "sent" states.

## 3. Existing repo audit (legacy "Report & Record System", Next.js 16.2.10 / React 19.2)

- Fully client-side app (`"use client"` everywhere) using the browser Supabase client. Authorization relies on `public.users.role` and a client `PERMS` table (`lib/util.ts`). This is UX gating only; real enforcement is the legacy RLS above.
- **Preserved unchanged:** all routes and pages, `db/*.sql`, `lib/*`, `components/*`, root `page.tsx`, the empty `cd` file.
- **Changed (backward compatible):** `app/classes/page.tsx` and `app/i/[token]/page.tsx` now try the safer RPCs from `0002` first and **fall back to the old query** when the RPC does not exist. Behaviour is identical today.

## 4. Risk register

| Risk | Impact | Mitigation / owner action |
|---|---|---|
| P0-1/P0-2 exploited before fix | Total data loss / privilege escalation | Apply 0001; take a backup now (Dashboard → Database → Backups) |
| Only one Supabase project (production) exists | No safe place for destructive/RLS tests | **Create a staging project or Supabase branch** (needs owner approval; may incur cost) |
| GPS sites have no verified coordinates | Clock-in impossible (by design) | Branch admin records entrance coordinates on site and approves; until then use correction requests |
| Indoor GPS accuracy is often worse than 10 m (Naga Mall 5F) | Many "low accuracy" rejections | Approved fallback needed: rotating on-site QR (Phase 2). Wi-Fi SSID is **not** readable from a browser |
| Lao translations are a first pass | Mistranslation | Native-speaker review of `lib/cr360/i18n.ts` |
| Payroll, OT, leave and penalty rules under Lao law unknown | Legal exposure | Lao counsel review; penalties stay OFF |
| `ceo360` / `clickrobot` schemas of unknown provenance | Duplicate models | Owner to confirm what created them |

## 5. Production-readiness gate (master prompt §I) — current status

| Gate | Status |
|---|---|
| Real multi-user auth with server-side scoped access | **Partial.** `/360` uses verified `auth.getUser()` and DB memberships plus RLS. MFA and phone OTP not configured |
| No secrets in client bundle | **Pass.** Build scanned; no service-role key exists in the codebase |
| Verified GPS entrance coordinates | **Blocked.** On-site verification required |
| No broad salary/bank reads via legacy tables/views | **Fail.** P0-3, P1-5 (fix drafted, awaiting approval) |
| Idempotent session deductions, protected approvals | **Partial.** Pure model plus tests done; DB enforcement in 0003/0004 awaiting approval |
| Backup/restore, a11y, pen-test, Lao legal review, CEO sign-off | **Not started** |
