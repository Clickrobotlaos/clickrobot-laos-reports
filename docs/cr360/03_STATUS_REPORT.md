# ClickRobot 360 — status report

**As of:** 2026-11-11 (owner decisions A–F applied to the proposals) · **Branch:** `ccr-1a90774f-9qovze` · **Production database changes made:** none (read-only inspection only)

## How to read this
- **Live**: works against today's production database as soon as the app is deployed and the user has a ClickRobot 360 membership.
- **On approval**: built and harness-tested, but switched off until you approve and apply the named migration.
- **Partial**: some of the module exists; the rest is listed.
- **Not started**: nothing built yet.

Nothing here is a mock. Pages show real rows or an honest empty/"not enabled" state, and nothing shows invented numbers.

## Migrations awaiting your approval
Full review, backup/restore procedure and the authorization checklist: **`04_MIGRATION_REVIEW_AND_CHECKLIST.md`**.
Production received four StaffOS migrations today from outside this repository; the plan and all tests
are re-based on that state. **P0-1 (anonymous data wipe) is still open in production: 0001 is urgent.**

| Group | Migrations | Why |
|---|---|---|
| 1 Urgent security | 0001, 0002 | Anonymous wipe; need-to-know pay (decision B) |
| 2 Before any parent account | 0006, 0004, 0005, 0013 | Employed-staff-only access + termination dates (A); audited parent links; consent (D) |
| 3 Operations | 0003, 0011, 0012, 0007, 0008, 0009, 0010 | Attendance audit + several classes a day (C); suspend/offboard (A); payments; shifts; parent requests; lesson logs with assigned substitutes |

`npm run test:db`: 14 staging + 34 baseline + 269 post-migration checks on a replica of today's production schema, applied twice, rolled back and re-applied.

## The 36 modules
| # | Module | Status | What exists / what's missing |
|---|---|---|---|
| 1 | CEO real-time dashboard | **Partial (live)** | `/360/ceo`: real counts (active packages, low balance, attendance today, open leads, unpaid invoices) by branch, timestamped. Missing: realtime push, drill-down links |
| 2 | Branch KPI analytics | **Partial (live)** | Per-branch tables on CEO, CRM funnel, finance by branch. Missing: cohorts/retention, teacher utilisation |
| 3 | Approvals & task centre | **On approval (0004)** | HR leave/OT/correction approvals with audit. Missing: budget/refund/media/WhatsApp approvals, unified inbox |
| 4 | NOVA AI chief of staff | Not started | Needs approved data scope and delivery settings |
| 5 | Students & guardians | **Live + On approval (0005)** | `/360/students` list/detail; guardian links with in-person verification UI |
| 6 | Timetables/classes/rooms | **Partial (live)** | `/360/classes` weekly timetable, teacher/room conflict detection across branches. Class editing stays in Records app |
| 7 | Attendance & session deductions | **Live + On approval (0011)** | Teacher roll call (StaffOS "My classes today", `/360/classes`; assigned substitutes too): today only, booked students only, no Present without sessions left, idempotent, race-safe. Decision C: several classes a day, one deduction per attended class (0011; until then the legacy one-row-per-day rule applies and the UI says so) |
| 8 | Packages, renewals, makeups | **Partial (live)** | Balances, low-balance and overdrawn flags. Missing: renewal/extension/freeze workflows, makeup credits ledger |
| 9 | Parent portal | **On approval (0005 + 0006, 0009, 0013, 0014)** | Children, sessions left, next-14-day schedule incl. makeups, invoices / payments linked to packages, requests, approved reports, privacy choices. Announcements (0017) and renewal reminders (live: at ≤2 sessions left, link to requests). Secure messaging (0018). Missing: NOVA | `/360/parent`: children, course, branch, sessions left, requests to the centre. Missing: invoices, calendar, media |
| 10 | Learning progression | **On approval (0010, 0013)** | Lesson log, rubric, follow-up, parent reports with teacher approval, assigned substitutes. AI drafts off until verified + consent. Achievements & certificates (0015): teacher proposes, manager issues, numbered printable certificate for parents. Missing: lesson-plan curriculum, teacher KPIs |
| 11 | Private child media | **On approval (0016)** | Private bucket; photos shrunk on the phone (1600 px JPEG), short MP4 videos (≤60 s, ≤50 MB); 6 photos + 1 video per class/day; tag children; share only with every tagged child's consent; parent gallery with 1-hour links; 90-day expiry. Check storage allowance before enabling |
| 12 | Competitions/teams | Not started | |
| 13 | CRM trial-to-sale | **Live** | `/360/crm` Kanban, funnel, follow-up SLA flags, safe stage moves with race protection. Trial booking/registration in Records app |
| 14 | Marketing/referrals | Not started | |
| 15 | WhatsApp/email | Not started | Needs WhatsApp Business account; will never mark "sent" without provider confirmation |
| 16 | Service desk (absence/extension) | **On approval (0009)** | Parent requests from `/360/parent`; managers approve/reject in the shared queue on `/360/manager`; approval never changes sessions automatically |
| 17 | HR employee directory | **Live** | `/360/manager` branch staff, safe columns only |
| 18 | GPS timekeeping, shifts, leave, OT | **Live (GPS on site approval) + On approval (0004, 0008)** | `/360/staff` check-in/out via deployed RPC with server time; leave/OT/correction requests; manager shift planner (0008) and approvals (0004). GPS refuses until each entrance is verified on site |
| 19 | Contracts & payroll | **On approval (0002, 0012)** | Need-to-know pay (decision B), own payslips, CEO payroll grants, suspend/reinstate/offboard. Separate service-role pay functions were added to production today outside this repo (decision needed). UI: StaffOS My pay (own salary + payslips, hidden until tapped); CEO People & access page (payroll grants, suspend/reinstate/offboard). Missing: payroll runs UI, Lao labour-law rules |
| 20 | Staff tasks & performance | **Partial (live; lesson part on 0010)** | `/360/manager` Teaching indicators month to date per teacher: classes scheduled, roll call taken, lesson logged, reports approved (labelled as questions, not scores). Missing: tasks, reviews | |
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
| 36 | Documents/settings/consent | **On approval (0013)** | Per-purpose guardian consent with history; parent Privacy choices; consent version gate |

## Test evidence
| Suite | Count | Command |
|---|---|---|
| Unit (domain rules, access, contracts, AI config, de-identification) | 139 | `npm test` |
| Database harness (exploit repro, fixes, isolation, idempotency, rollback) | 317 per run | `npm run test:db` |
| Backup restore + migration rehearsal on a restored copy | — | `REHEARSE=1 bash tests/db/restore-check.sh <dump>` |
| Auth-boundary smoke against a production build | 36 | `npm run test:smoke` |
| Rendered pages as 4 personas against a fake Supabase (errors, expected text, leak checks, Lao @ 390 px) | 41 | `npm run test:render` |
| Visual review of every rendered page (desktop + phone, light + dark) | screenshots reviewed | — |

## Not verified (be aware)
- Roll call writes go through the legacy attendance policy, which allows legacy roles `staff`, `finance`, `admin` and `co_admin`. A user whose legacy role is `manager` gets "not allowed". That's existing legacy behaviour; production currently has no legacy `manager` users.
- **No screen has been used with a real account against the real database**: there were no test credentials. Every `/360` page *has* been rendered in a real browser against a fake Supabase with fictional data (`npm run test:render`), and the screenshots were reviewed. That review found and fixed two layout bugs (category bars not stretching, parent-link buttons stacking) and one unclear message (the "Low" balance banner). Real sign-in, real RLS through the API, and real data volumes still need a staging check.
- Supabase Auth, PostgREST and Storage themselves are not in the local harness.
- Lao translations need a native speaker's review.
- GPS has never been tested on a real device at a branch.

## Instructor module (owner requests 2026-11-11)
- `/360/lessons/[class]`: lesson log (unit, lesson, level, covered, next plan, handover notes), per-student 4-skill rubric and private follow-up, bilingual parent reports, teacher approval before parents see anything.
- **Need-to-know:** only the class teacher/assistant, a **manager-assigned substitute** (between the dates set; revocable; audited), the branch manager and the CEO can open a class's private records. Other teachers in the branch see nothing. Substitutes see the covered class in StaffOS "My classes today" and can take the roll call.
- **AI drafting is OFF** until you switch it on (`CR360_AI_DRAFTS_ENABLED=true` + `CR360_AI_MODEL` + server key). No model id is hard-coded. When on, only children whose parents gave **AI consent** (0013) are sent; others get the template. Children's and guardians' names, phone numbers, e-mails, links, ID codes and dates are removed from every field, and the request is blocked if any survive.
- Not built yet from your list: photo/video daily reports (needs private storage + 0013 media consent), achievements and certificates, teacher performance indicators.

## Owner decisions (2026-11-11) and where they are implemented
| | Decision | Implemented in |
|---|---|---|
| A | Access ends on termination date / contract expiry; suspension, reinstatement, audited offboarding; history kept | 0006 (`employment_ok`), 0012, tests `assert_employment.sql` |
| B | Pay is need-to-know: CEO; CEO-granted payroll admin; staff own only; managers/finance nothing by default | 0002, `access.ts canReadPayroll`, tests `assert_payroll_access.sql` |
| C | Several classes per day; one deduction per attended class; never twice | 0011, roll call, tests `assert_attendance_per_class.sql` |
| D | Explicit consent per purpose, separate public marketing, private by default, withdrawable | 0013, parent portal Privacy choices, AI gating, tests `assert_consents.sql` |
| E | Staging with fictional data, no paid services | Local replica + restore rehearsal |
| F | Reuse `ceo360`/`clickrobot`, never delete/recreate | Inspected (empty, API-closed); untouched; reuse plan in 04 §6 |

## Still needed from you
See the checklist at the end of `04_MIGRATION_REVIEW_AND_CHECKLIST.md`.

## Continuous integration
`.github/workflows/ci.yml` runs on every push and pull request with no secrets and no Supabase access: app checks + production build + boundary smoke, the database harness, and the persona render suite (screenshots kept 7 days as a build artifact). First run: all three jobs green.
