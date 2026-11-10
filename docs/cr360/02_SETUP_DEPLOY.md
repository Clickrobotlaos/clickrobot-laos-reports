# ClickRobot 360 — setup, test & deploy

## Local development
```bash
npm ci
cp .env.example .env.local        # fill URL + publishable (anon) key ONLY
npm run dev                       # legacy app at /, ClickRobot 360 at /360
```

## Checks (all must pass before merging)
```bash
npm run typecheck
npm test                          # 41 unit tests (access, privacy, ledger, booking, GPS, payroll, money, schemas)
npx eslint lib/cr360 app/360 app/api/cr360 components/cr360 tests
npm run build
npm start & BASE_URL=http://localhost:3000 npm run test:smoke   # 8 auth-boundary checks
```
Staging RLS tests (never production): `psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_negative_tests.sql`

## Activating the first real workflow (StaffOS self check-in + requests)
These steps write to production and need CEO approval and execution, in order:
1. **Apply `supabase/proposed/0001`** (P0 fixes). Take a backup first.
2. **Bootstrap memberships** for real staff with a reviewed SQL script run by the CEO in the SQL editor (never from the browser). One row per person in `public.cr360_hr_memberships` (`ceo` / `hr` / `manager`+branch / `staff`+branch), and one `public.cr360_hr_employees` row linked by `auth_user_id`. No salary goes in these tables.
3. **Create shifts** in `public.cr360_hr_shifts` (SQL editor until the shift planner ships).
4. **GPS site:** a branch admin stands at the staff entrance, records lat/lon with ≤10 m accuracy several times, and inserts `public.cr360_hr_sites` with `enabled=false`. Field-test, then set `enabled=true, approved_at=now(), approved_by=<admin uid>`. Until then, check-in is refused with a non-punitive message and staff use correction requests.
5. Staff sign in with their existing account → `/360/staff`.
6. **Apply `0004`** to enable manager approve/reject (UI wiring follows in Phase 2).

## Deploy (Vercel) — only with owner consent
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. **Do not** add a service-role key.
- Supabase Auth → URL configuration: add the Vercel domain to redirect URLs.
- Supabase Auth: enable leaked-password protection; enable MFA (TOTP) for CEO/HR/finance before payroll ships.
- Use preview deployments for review; promote to production only after the gates in `00_AUDIT_AND_BLOCKERS.md §5`.

## Secrets policy
- Only the publishable/anon key ever reaches the browser.
- `.env*` is git-ignored (except `.env.example`, which holds placeholders only).
- No credentials in logs, analytics, AI prompts, commit messages or screenshots. GPS coordinates are not logged by API routes.
