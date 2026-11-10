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

`npm run test:db` reproduces every issue and verifies every fix (131 passing assertions per run, 15 of which first reproduce the vulnerabilities on the unfixed schema) on a throwaway local copy of the production schema.

## The 36 modules
| # | Module | Status | What exists / what's missing |
|---|---|---|---|
| 1 | CEO real-time dashboard | **Partial (live)** | `/360/ceo`: real counts (active packages, low balance, attendance today, open leads, unpaid invoices) by branch, timestamped. Missing: realtime push, drill-down links |
| 2 | Branch KPI analytics | **Partial (live)** | Per-branch tables on CEO, CRM funnel, finance by branch. Missing: cohorts/retention, teacher utilisation |
| 3 | Approvals & task centre | **On approval (0004)** | HR leave/OT/correction approvals with audit. Missing: budget/refund/media/WhatsApp approvals, unified inbox |
| 4 | NOVA AI chief of staff | Not started | Needs approved data scope and delivery settings |
| 5 | Students & guardians | **Live + On approval (0005)** | `/360/students` list/detail; guardian links with in-person verification UI |
| 6 | Timetables/classes/rooms | **Partial (live)** | `/360/classes` weekly timetable, teacher/room conflict detection across branches. Class editing stays in Records app |
| 7 | Attendance & session deductions | **Partial (live)** | Ledger rebuilt from attendance with counter reconciliation (0/182 mismatches). Marking attendance stays in Records app. Double debit already blocked by legacy constraint (verified) |
| 8 | Packages, renewals, makeups | **Partial (live)** | Balances, low-balance and overdrawn flags. Missing: renewal/extension/freeze workflows, makeup credits ledger |
| 9 | Parent portal | **On approval (0005 + 0006)** | `/360/parent`: children, course, branch, sessions left. Missing: invoices, calendar, media, requests |
| 10 | Learning progression | Not started | |
| 11 | Private child media | Not started | Needs private bucket + consent design |
| 12 | Competitions/teams | Not started | |
| 13 | CRM trial-to-sale | **Live** | `/360/crm` Kanban, funnel, follow-up SLA flags, safe stage moves with race protection. Trial booking/registration in Records app |
| 14 | Marketing/referrals | Not started | |
| 15 | WhatsApp/email | Not started | Needs WhatsApp Business account; will never mark "sent" without provider confirmation |
| 16 | Service desk (absence/extension) | Not started | |
| 17 | HR employee directory | **Live** | `/360/manager` branch staff, safe columns only |
| 18 | GPS timekeeping, leave, OT | **Live (GPS on site approval)** | `/360/staff` check-in/out via deployed RPC with server time; leave/OT/correction requests. GPS refuses until each entrance is verified on site |
| 19 | Contracts & payroll | Not started | Vault tables exist (v0.4); needs Lao labour-law rules + two-person release |
| 20 | Staff tasks & performance | Not started | |
| 21 | Branches & HQ/franchise access | **Partial** | Branch scoping in every /360 page; franchise tenancy not modelled |
| 22 | School partners | Not started | Needs current contract terms |
| 23 | Franchise & royalties | Not started | Needs signed agreement figures |
| 24 | Inventory | Not started | |
| 25 | 2.5D/3D classroom fill | **Live** | Isometric seat map per class from real bookings (regulars + that day's makeups), text alternative |
| 26 | Daily cashbook | Not started | |
| 27 | Invoices/payments/refunds | **Partial (live, read-only)** | Open/overdue invoices on finance page. Missing: reconciled payments ledger (not yet drafted) |
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
| Unit (domain rules, access, contracts) | 98 | `npm test` |
| Database harness (exploit repro, fixes, isolation, idempotency, rollback) | 131 | `npm run test:db` |
| Auth-boundary smoke against a production build | 28 | `npm run test:smoke` |
| Visual check (seat map, Kanban; 1440/390 px; dark mode; no horizontal overflow) | manual screenshots | — |

## Not verified (be aware)
- **No screen behind sign-in has been seen in a real browser with a real account**: there were no test credentials. Server logic is unit- and harness-tested; layout of the new widgets was checked with static renders only.
- Supabase Auth, PostgREST and Storage themselves are not in the local harness.
- Lao translations need a native speaker's review.
- GPS has never been tested on a real device at a branch.

## Owner decisions needed
1. Approve 0001 now (urgent), then 0002–0004, 0006 (before any parent account), then 0005.
2. Former staff: inactive/Terminated users lose all legacy access in 0006 — confirm.
3. Should the finance role keep full access to staff salary records (0002 keeps it)?
4. Is one class per package per day intended (blocks same-day makeup)?
5. Consent text for parents (Lao counsel) → set `CR360_GUARDIAN_CONSENT_VERSION`.
6. Staging Supabase project (may cost money) for end-to-end tests with real auth.
7. What created the `ceo360` and `clickrobot` schemas?
