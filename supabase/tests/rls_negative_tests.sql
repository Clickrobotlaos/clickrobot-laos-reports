-- =====================================================================================
-- RLS NEGATIVE TESTS — STAGING ONLY. Never run against production.
-- Creates FICTIONAL users/branches inside a transaction and ROLLS BACK at the end.
-- Usage: psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_negative_tests.sql
-- Each check raises an exception on failure, so a clean run = all pass.
-- =====================================================================================
begin;

-- Fictional fixtures --------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c0', 'ceo@test.invalid'),
  ('00000000-0000-0000-0000-0000000000a1', 'mgr-a@test.invalid'),
  ('00000000-0000-0000-0000-0000000000b1', 'mgr-b@test.invalid'),
  ('00000000-0000-0000-0000-0000000000a2', 'staff-a@test.invalid'),
  ('00000000-0000-0000-0000-0000000000a3', 'staff-a2@test.invalid');

insert into public.branches (id, name, active) values
  ('10000000-0000-0000-0000-00000000000a', 'TEST Branch A', true),
  ('10000000-0000-0000-0000-00000000000b', 'TEST Branch B', true);

insert into public.cr360_hr_memberships (user_id, role, branch_id) values
  ('00000000-0000-0000-0000-0000000000c0', 'ceo', null),
  ('00000000-0000-0000-0000-0000000000a1', 'manager', '10000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000b1', 'manager', '10000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-0000000000a2', 'staff', '10000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000a3', 'staff', '10000000-0000-0000-0000-00000000000a');

insert into public.cr360_hr_employees (id, auth_user_id, branch_id, display_name) values
  ('20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'TEST Staff A'),
  ('20000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a', 'TEST Staff A2'),
  ('20000000-0000-0000-0000-0000000000b9', null, '10000000-0000-0000-0000-00000000000b', 'TEST Staff B');

insert into public.cr360_hr_leave_requests (employee_id, branch_id, leave_type, start_date, end_date, reason) values
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'annual', '2026-12-01', '2026-12-02', 'test'),
  ('20000000-0000-0000-0000-0000000000b9', '10000000-0000-0000-0000-00000000000b', 'sick', '2026-12-01', '2026-12-01', 'test');

-- Helper: act as a user ------------------------------------------------------------------
create or replace function pg_temp.act_as(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function pg_temp.expect(cond boolean, msg text) returns void language plpgsql as $$
begin if not cond then raise exception 'RLS TEST FAILED: %', msg; end if; raise notice 'PASS: %', msg; end $$;

-- 1. Anonymous cannot read HR tables or vault ------------------------------------------
set local role anon;
select pg_temp.expect((select count(*) from public.cr360_hr_employees) = 0, 'anon reads no employees');
select pg_temp.expect((select count(*) from public.cr360_hr_leave_requests) = 0, 'anon reads no leave');
do $$ begin perform 1 from cr360_vault.contracts; raise exception 'RLS TEST FAILED: anon read vault'; exception when insufficient_privilege then raise notice 'PASS: anon denied vault'; end $$;
reset role;

-- 2. Manager branch restriction ----------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect((select count(*) from public.cr360_hr_employees where branch_id = '10000000-0000-0000-0000-00000000000b') = 0, 'manager A cannot see branch B employees');
select pg_temp.expect((select count(*) from public.cr360_hr_leave_requests where branch_id = '10000000-0000-0000-0000-00000000000b') = 0, 'manager A cannot see branch B leave');
select pg_temp.expect((select count(*) from public.cr360_hr_employees where branch_id = '10000000-0000-0000-0000-00000000000a') = 2, 'manager A sees own branch');
reset role;

-- 3. Self-only staff access --------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect((select count(*) from public.cr360_hr_employees) = 1, 'staff sees only own employee row');
select pg_temp.expect((select count(*) from public.cr360_hr_leave_requests) = 1, 'staff sees only own leave');
-- cannot file leave on behalf of a colleague
do $$ begin
  insert into public.cr360_hr_leave_requests (employee_id, branch_id, leave_type, start_date, end_date, reason)
  values ('20000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a', 'annual', '2026-12-05', '2026-12-05', 'spoof');
  raise exception 'RLS TEST FAILED: staff inserted leave for colleague';
exception when insufficient_privilege then raise notice 'PASS: staff cannot file for colleague'; end $$;
-- cannot self-approve via insert
do $$ begin
  insert into public.cr360_hr_leave_requests (employee_id, branch_id, leave_type, start_date, end_date, reason, status)
  values ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'annual', '2026-12-06', '2026-12-06', 'self ok', 'approved');
  raise exception 'RLS TEST FAILED: staff self-approved';
exception when insufficient_privilege then raise notice 'PASS: staff cannot self-approve'; end $$;
-- cannot update (no update policy)
update public.cr360_hr_leave_requests set status = 'approved';
select pg_temp.expect((select count(*) from public.cr360_hr_leave_requests where status = 'approved') = 0, 'staff cannot update leave status');
-- cannot forge punches directly
do $$ begin
  insert into public.cr360_hr_attendance_events (employee_id, branch_id, kind, distance_m, reported_accuracy_m)
  values ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'in', 0, 1);
  raise exception 'RLS TEST FAILED: staff inserted raw punch';
exception when insufficient_privilege then raise notice 'PASS: no direct punch insert'; end $$;
-- GPS RPC refuses while site is not approved
do $$ begin
  perform public.cr360_hr_clock('20000000-0000-0000-0000-0000000000a2', 'in', 17.0, 102.0, 5);
  raise exception 'RLS TEST FAILED: clock accepted without approved site';
exception when insufficient_privilege then raise notice 'PASS: clock refused (site not approved)'; end $$;
reset role;

-- 4. Payroll privacy: vault is closed to every API role ----------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c0');
do $$ begin perform 1 from cr360_vault.payroll_runs; raise exception 'RLS TEST FAILED: vault readable via API role'; exception when insufficient_privilege then raise notice 'PASS: vault closed even to CEO API session (server RPC only)'; end $$;
reset role;

-- 5. Legacy public.users leak (EXPECTED TO FAIL until 0002 is applied) -------------------
-- Uncomment after applying 0002 on staging:
-- select pg_temp.act_as('<legacy staff user id>');
-- select pg_temp.expect((select count(*) from public.users where id <> auth.uid()) = 0, 'staff cannot read colleagues in public.users');

rollback;
