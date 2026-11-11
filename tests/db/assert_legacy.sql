-- Legacy security findings P0-1..P2-8 + no-regression checks for the legacy Records app.
-- Run with: psql -v ON_ERROR_STOP=1 -v mode=baseline|fixed -f tests/db/assert_legacy.sql
\set QUIET on
select set_config('t.mode', :'mode', false);

-- ---------------------------------------------------------------- P0-1 anon data wipe
-- "Fixed" = the GUARD refuses the call (SQLSTATE 42501), independent of data. In production today
-- the guard is bypassed and the wipe only fails later, by accident, on a foreign key reference.
begin;
set local role anon; select t.claims(null);
do $$ declare code text;
begin
  begin perform public.admin_deep_reset(); code := 'completed';
  exception when others then code := sqlstate; end;
  perform t.sec(code = '42501', 'P0-1 anon is refused by admin_deep_reset guard (got ' || code || ')');
end $$;
rollback;

begin;
set local role anon; select t.claims(null);
do $$ declare code text;
begin
  begin perform public.admin_nuclear_reset(); code := 'completed';
  exception when others then code := sqlstate; end;
  perform t.sec(code = '42501', 'P0-1 anon is refused by admin_nuclear_reset guard (got ' || code || ')');
end $$;
rollback;

-- Demonstrate real data loss once the accidental FK blockers are absent (rolled back).
begin;
update public.users set branch_id = null;
delete from public.cr360_hr_leave_requests; delete from public.cr360_hr_employees; delete from public.cr360_hr_memberships;
delete from public.classes;
set local role anon; select t.claims(null);
do $$ declare code text;
begin
  begin perform public.admin_deep_reset(); code := 'completed';
  exception when others then code := sqlstate; end;
  perform t.sec(code = '42501', 'P0-1 anon cannot wipe data when no FK references block it (got ' || code || ')');
end $$;
reset role;
select t.sec((select count(*) from public.settings) = 1, 'P0-1 settings survive the anon call');
rollback;

-- regression: a real admin still passes the guard. (The reset itself may then fail on FK references —
-- the same happens in production today; that is a separate legacy defect, not changed here.)
begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000c0');
do $$ declare code text;
begin
  begin perform public.admin_deep_reset(); code := 'completed';
  exception when others then code := sqlstate; end;
  perform t.ok(code <> '42501', 'admin still passes the reset guard (outcome: ' || code || ')');
end $$;
rollback;

-- regression: signed-in staff is refused by the guard in every mode
begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a2');
do $$ declare code text;
begin
  begin perform public.admin_deep_reset(); code := 'completed';
  exception when others then code := sqlstate; end;
  perform t.ok(code <> 'completed', 'signed-in staff cannot complete admin_deep_reset (got ' || code || ')');
end $$;
rollback;

-- ---------------------------------------------------------------- P0-2 self role escalation
begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a2');
do $$ declare blocked boolean; n int;
begin
  begin
    update public.users set role = 'admin' where id = auth.uid();
    get diagnostics n = row_count; blocked := (n = 0);
  exception when insufficient_privilege then blocked := true; end;
  perform t.ok(blocked, 'P0-2 staff cannot make themselves admin (closed in production 2026-11-11; 0001 adds a trigger guard too)');
end $$;
rollback;

begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a2');
do $$ declare blocked boolean; n int;
begin
  begin
    update public.users set base_salary = 5000000 where id = auth.uid();
    get diagnostics n = row_count; blocked := (n = 0);
  exception when insufficient_privilege then blocked := true; end;
  perform t.ok(blocked, 'P0-2 staff cannot raise own salary (closed in production 2026-11-11)');
end $$;
rollback;

begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000c1');
do $$ declare blocked boolean; n int;
begin
  begin
    update public.users set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a2';
    get diagnostics n = row_count; blocked := (n = 0);
  exception when insufficient_privilege then blocked := true; end;
  perform t.sec(blocked, 'P0-2 co_admin cannot grant admin role');
end $$;
rollback;

-- regressions for documented legacy behaviour
begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a2');
do $$ declare n int; begin
  update public.users set phone = '020-TEST' where id = auth.uid(); get diagnostics n = row_count;
  -- Production 2026-11-11 dropped p_users_self_update entirely (side effect: no self-service phone edits).
  perform t.ok(n = 0, 'staff cannot edit their own users row since the 2026-11-11 production change (owner decision to restore safe self-edits)');
end $$;
rollback;

begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000c1');
do $$ declare n int := 0; begin
  begin update public.users set base_salary = 333 where id = '00000000-0000-0000-0000-0000000000a2'; get diagnostics n = row_count;
  exception when insufficient_privilege then n := 0; end;
  perform t.sec(n = 0, 'B: co_admin without a CEO payroll grant cannot change a colleague''s salary');
end $$;
rollback;

begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000c0');
do $$ declare n int; begin
  update public.users set role = 'co_admin' where id = '00000000-0000-0000-0000-0000000000a2'; get diagnostics n = row_count;
  perform t.ok(n = 1, 'admin can still change another user''s role');
end $$;
rollback;

-- ---------------------------------------------------------------- P0-3 colleague salary read
begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a2');
select t.ok((select count(*) from public.users where id <> auth.uid()) = 0, 'P0-3 staff cannot read colleagues'' rows (closed in production 2026-11-11)');
select t.ok((select count(*) from public.users where id = auth.uid()) = 1, 'staff can read own users row (app-context)');
rollback;

begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000c1');
select t.sec((select count(*) from public.users) = 1, 'B: co_admin without a payroll grant reads only own users row');
rollback;

begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000f1');
select t.ok((select count(*) from public.users) = 1, 'B: finance reads only own users row (production 2026-11-11 and 0002)');
select t.sec((select count(*) from public.salary_payroll where user_id is distinct from auth.uid()) = 0, 'B: finance without a payroll grant reads no colleague payslips');
rollback;

-- ---------------------------------------------------------------- P1-4 anon invoice listing
begin;
set local role anon; select t.claims(null);
select t.sec((select count(*) from public.invoices) = 0, 'P1-4 anon cannot list shared invoices');
rollback;

begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a2');
select t.ok((select count(*) from public.invoices) = 2, 'signed-in staff still read invoices (legacy p_invoices_read)');
rollback;

-- ---------------------------------------------------------------- attendance double-debit (already prevented by legacy UNIQUE(package_id,date))
begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a2');
insert into public.attendance (package_id, class_id, date, status) values
  ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '2026-11-10', 'Present');
select t.ok((select sessions_used from public.student_packages where id = '30000000-0000-0000-0000-000000000001') = 1, 'first Present debits exactly one session');
do $$ declare blocked boolean;
begin
  begin
    insert into public.attendance (package_id, class_id, date, status) values
      ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '2026-11-10', 'Present');
    blocked := false;
  exception when unique_violation then blocked := true; end;
  perform t.ok(blocked, 'duplicate Present for same package/day is rejected (legacy UNIQUE constraint)');
end $$;
select t.ok((select sessions_used from public.student_packages where id = '30000000-0000-0000-0000-000000000001') = 1,
  'double tap still debits exactly one session');
rollback;

-- ---------------------------------------------------------------- P1-6 any signed-in account reads legacy data
-- A guardian (auth account with no staff record) and a Terminated former employee.
begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000e1');
select t.sec((select count(*) from public.student_packages) = 0, 'P1-6 non-staff account cannot read student packages');
select t.sec((select count(*) from public.invoices) = 0, 'P1-6 non-staff account cannot read invoices');
select t.sec((select count(*) from public.settings) = 0, 'P1-6 non-staff account cannot read settings (bank details)');
do $$ declare blocked boolean; begin
  begin insert into public.leads (student_name, status) values ('SPAM', 'New'); blocked := false;
  exception when insufficient_privilege then blocked := true; end;
  perform t.sec(blocked, 'P1-6 non-staff account cannot create leads');
end $$;
rollback;

begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000d9');
select t.sec((select count(*) from public.student_packages) = 0, 'P1-6 Terminated former staff cannot read student packages');
do $$ declare blocked boolean; n int; begin
  begin update public.student_packages set sessions_used = 0; get diagnostics n = row_count; blocked := (n = 0);
  exception when insufficient_privilege then blocked := true; end;
  perform t.sec(blocked, 'P1-6 Terminated former staff cannot modify student packages');
end $$;
rollback;

-- regressions: active legacy staff keep their reads/writes; anon reads still return empty, not errors
begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a2');
select t.ok((select count(*) from public.student_packages) = 2, 'active staff still read packages');
select t.ok((select count(*) from public.settings) = 1, 'active staff still read settings');
do $$ declare n int; begin
  insert into public.leads (student_name, status) values ('TEST Lead', 'New'); get diagnostics n = row_count;
  perform t.ok(n = 1, 'active staff can still create leads');
end $$;
rollback;

begin;
set local role anon; select t.claims(null);
select t.ok((select count(*) from public.branches) = 0, 'anon branch read returns empty (no error) — invoice share page');
select t.ok((select count(*) from public.settings) = 0, 'anon settings read returns empty (no error)');
rollback;

-- ---------------------------------------------------------------- P2-11 duplicate income per invoice (legacy 3-call payment)
begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a2');
insert into public.income_records (date, branch_id, amount, currency, rate_to_lak, amount_lak, invoice_id, received_by, created_by)
values (current_date, '10000000-0000-0000-0000-00000000000a', 100, 'LAK', 1, 100, '50000000-0000-0000-0000-000000000001', auth.uid(), auth.uid());
do $$ declare blocked boolean; begin
  begin
    insert into public.income_records (date, branch_id, amount, currency, rate_to_lak, amount_lak, invoice_id, received_by, created_by)
    values (current_date, '10000000-0000-0000-0000-00000000000a', 100, 'LAK', 1, 100, '50000000-0000-0000-0000-000000000001', auth.uid(), auth.uid());
    blocked := false;
  exception when unique_violation then blocked := true; end;
  perform t.sec(blocked, 'P2-11 a second income row for the same invoice (double click) is rejected');
end $$;
rollback;
