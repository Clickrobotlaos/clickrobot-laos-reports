# ClickRobot 360 — status report

**As of:** 2026-11-11 (overnight build) · **Branch:** `ccr-1a90774f-9qovze` · **Production database changes made:** none (read-only inspection only)

## How to read this
- **Live**: works against today's production database as soon as the app is deployed and the user has a ClickRobot 360 membership.
- **On approval**: built and harness-tested, but switched off until you approve and apply the named migration.
- **Partial**: some of the module exists; the rest is listed.
- **Not started**: nothing built yet.

Nothing here is a mock. Pages show real rows or an honest empty/"not enabled" state, and nothing shows invented numbers.

## Security fixes awaiting your approval (apply in this order)
| # | Fix | Why it matters | Verified |
|---|---|---|---|
| 0001 | Reset RPCs closed to anon; users can't change their own role/salary; function search paths pinned | Anyone with the public key can start the data wipe; any staff can make themselves admin | Exploits reproduced, then closed |
| 0002 | Colleague salary/bank/ID hidden; invoice share link checks the exact token | Every signed-in user reads all salaries; anon lists all shared invoices | Same |
| 0003 | Append-only attendance audit trail | Attendance edits/deletes leave no history | Same |
| 0004 | Audited approve/reject for leave/OT/corrections | No approval path exists | Same |
| 0006 | Legacy data readable only by active staff; terminated staff lose access | First parent account would read everything; ex-staff keep read+write | Same |
| 0005 | Verified parent ↔ student links | Parent portal | 29 isolation checks |
| 0009 | Parent requests (absence, makeup, extension, schedule) + manager review | Parents have no way to send requests; changes go through chat | 27 checks |
| 0008 | Shift planner (create/cancel shifts with overlap, no back-dating, audit) | Shifts can only be added in the SQL editor today, so StaffOS schedules and attendance % stay empty | 19 checks |
| 0007 | Atomic, idempotent "mark invoice paid" + one income row per invoice | A double click records the payment twice; a failed step leaves income on an unpaid invoice | Duplicate reproduced, then closed; 23 payment checks |

`npm run test:db` reproduces every issue and verifies every fix (177 passing assertions per run, 16 of which first reproduce the vulnerabilities on the unfixed schema) on a throwaway local copy of the production schema.

## The 36 modules
| # | Module | Status | What exists / what's missing |
|---|---|---|---|
| 1 | CEO real-time dashboard | **Partial (live)** | `/360/ceo`: real counts (active packages, low balance, attendance today, open leads, unpaid invoices) by branch, timestamped. Missing: realtime push, drill-down links |
| 2 | Branch KPI analytics | **Partial (live)** | Per-branch tables on CEO, CRM funnel, finance by branch. Missing: cohorts/retention, teacher utilisation |
| 3 | Approvals & task centre | **On approval (0004)** | HR leave/OT/correction approvals with audit. Missing: budget/refund/media/WhatsApp approvals, unified inbox |
| 4 | NOVA AI chief of staff | Not started | Needs approved data scope and delivery settings |
| 5 | Students & guardians | **Live + On approval (0005)** | `/360/students` list/detail; guardian links with in-person verification UI |
| 6 | Timetables/classes/rooms | **Partial (live)** | `/360/classes` weekly timetable, teacher/room conflict detection across branches. Class editing stays in Records app |
| 7 | Attendance & session deductions | **Live** | Teacher roll call ("My classes today" in StaffOS; also on `/360/classes` for managers): today only, assigned classes only, booked students only, no Present without sessions left, idempotent, race-safe. Ledger rebuilt from attendance with counter reconciliation (0/182 mismatches). Double debit blocked by the legacy one-row-per-day constraint (verified) |
| 8 | Packages, renewals, makeups | **Partial (live)** | Balances, low-balance and overdrawn flags. Missing: renewal/extension/freeze workflows, makeup credits ledger |
| 9 | Parent portal | **On approval (0005 + 0006, 0009)** | `/360/parent`: children, course, branch, sessions left, requests to the centre. Missing: invoices, calendar, media |
| 10 | Learning progression | Not started | |
| 11 | Private child media | Not started | Needs private bucket + consent design |
| 12 | Competitions/teams | Not started | |
| 13 | CRM trial-to-sale | **Live** | `/360/crm` Kanban, funnel, follow-up SLA flags, safe stage moves with race protection. Trial booking/registration in Records app |
| 14 | Marketing/referrals | Not started | |
| 15 | WhatsApp/email | Not started | Needs WhatsApp Business account; will never mark "sent" without provider confirmation |
| 16 | Service desk (absence/extension) | **On approval (0009)** | Parent requests from `/360/parent`; managers approve/reject in the shared queue on `/360/manager`; approval never changes sessions automatically |
| 17 | HR employee directory | **Live** | `/360/manager` branch staff, safe columns only |
| 18 | GPS timekeeping, shifts, leave, OT | **Live (GPS on site approval) + On approval (0004, 0008)** | `/360/staff` check-in/out via deployed RPC with server time; leave/OT/correction requests; manager shift planner (0008) and approvals (0004). GPS refuses until each entrance is verified on site |
| 19 | Contracts & payroll | Not started | Vault tables exist (v0.4); needs Lao labour-law rules + two-person release |
| 20 | Staff tasks & performance | Not started | |
| 21 | Branches & HQ/franchise access | **Partial** | Branch scoping in every /360 page; franchise tenancy not modelled |
| 22 | School partners | Not started | Needs current contract terms |
| 23 | Franchise & royalties | Not started | Needs signed agreement figures |
| 24 | Inventory | Not started | |
| 25 | 2.5D/3D classroom fill | **Live** | Isometric seat map per class from real bookings (regulars + that day's makeups), text alternative |
| 26 | Daily cashbook | Not started | |
| 27 | Invoices/payments/refunds | **Partial (on approval 0007)** | Open/overdue invoices; "Record payment" (atomic: income + registration + package exactly once) in `/360/finance` and the Records app's Mark paid button. Missing: partial payments, refunds, statement matching |
| 28 | Expenses/purchasing | **Partial (live, read-only)** | Expenses by category/branch. Missing: purchase requests/POs |
| 29 | Budgets/approvals | Not started | |
| 30 | Branch P&L / cash flow | **Partial (live)** | Operational income − expenses by branch and month, labelled not reconciled |
| 31 | CEO compensation / partner distributions | Not started | Access model and tests exist (`canReadExecutiveFinance`) |
| 32 | LAK/THB/USD | **Partial** | Integer-cent maths, rate snapshots in domain lib, original-currency totals, rate-consistency check |
| 33 | AI financial summaries | Not started | |
| 34 | Secure access & audit | **Live + On approval** | DB-membership auth, RLS + server checks, same-origin, no service key; audit trails in 0003/0004/0005 |
| 35 | Workflow automations | Not started | |
| 36 | Documents/settings/consent | **Partial** | Consent version gate for parents; locale setting |

## Test evidence
| Suite | Count | Command |
|---|---|---|
| Unit (domain rules, access, contracts) | 120 | `npm test` |
| Database harness (exploit repro, fixes, isolation, idempotency, rollback) | 177 | `npm run test:db` |
| Auth-boundary smoke against a production build | 36 | `npm run test:smoke` |
| Rendered pages as 4 personas against a fake Supabase (errors, expected text, leak checks, Lao @ 390 px) | 41 | `npm run test:render` |
| Visual review of every rendered page (desktop + phone, light + dark) | screenshots reviewed | — |

## Not verified (be aware)
- Roll call writes go through the legacy attendance policy, which allows legacy roles `staff`, `finance`, `admin` and `co_admin`. A user whose legacy role is `manager` gets "not allowed". That's existing legacy behaviour; production currently has no legacy `manager` users.
- **No screen has been used with a real account against the real database**: there were no test credentials. Every `/360` page *has* been rendered in a real browser against a fake Supabase with fictional data (`npm run test:render`), and the screenshots were reviewed. That review found and fixed two layout bugs (category bars not stretching, parent-link buttons stacking) and one unclear message (the "Low" balance banner). Real sign-in, real RLS through the API, and real data volumes still need a staging check.
- Supabase Auth, PostgREST and Storage themselves are not in the local harness.
- Lao translations need a native speaker's review.
- GPS has never been tested on a real device at a branch.

## Owner decisions needed
1. Approve 0001 now (urgent), then 0002–0004, 0006 (before any parent account), then 0005, 0007 (before real payments are recorded) 0008 (to start scheduling staff) and 0009 (parent requests, after 0005).
2. Former staff: inactive/Terminated users lose all legacy access in 0006 — confirm.
3. Should the finance role keep full access to staff salary records (0002 keeps it)?
4. Is one class per package per day intended (blocks same-day makeup)?
5. Consent text for parents (Lao counsel) → set `CR360_GUARDIAN_CONSENT_VERSION`.
6. Staging Supabase project (may cost money) for end-to-end tests with real auth.
7. What created the `ceo360` and `clickrobot` schemas?

## Continuous integration
`.github/workflows/ci.yml` runs on every push and pull request with no secrets and no Supabase access: app checks + production build + boundary smoke, the database harness, and the persona render suite (screenshots kept 7 days as a build artifact). First run: all three jobs green.
