-- Owner decision B: confidential pay is need-to-know. Run after all proposed migrations.
\set QUIET on
-- CEO (legacy admin) ...c0, co_admin ...c1, finance ...f1, staff A ...a2, staff A2 ...a3

-- staff: own payslip only
begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a2');
select t.ok((select count(*) from public.salary_payroll) = 1, 'B staff reads exactly their own payslip');
select t.ok((select staff_name from public.salary_payroll) = 'TEST Staff A', 'B staff payslip is their own');
do $$ declare code text; begin
  begin perform public.cr360_grant_payroll_access(auth.uid(), 'self grant'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', 'B staff cannot grant themselves payroll access');
end $$;
rollback;

-- finance / co_admin: nothing confidential by default, cannot self-grant, cannot write pay
begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000f1');
select t.ok(not cr360_authz.can_read_confidential_hr(), 'B finance has no confidential HR access by default');
select t.ok((select count(*) from public.staff_directory()) = 5, 'B finance still sees colleague names via staff_directory');
do $$ declare code text; n int := 0; begin
  begin perform public.cr360_grant_payroll_access(auth.uid(), 'self grant'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', 'B finance cannot grant itself payroll access');
  begin insert into public.salary_payroll (month, staff_id, user_id, staff_name, net, currency, rate_to_lak, net_lak)
        values ('2026-11', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a2', 'x', 1, 'LAK', 1, 1); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', 'B finance without a grant cannot create payslips');
end $$;
rollback;

begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000c1');
do $$ declare code text; begin
  begin insert into public.users (id, name, role, base_salary) values (gen_random_uuid(), 'TEST New Hire', 'staff', 500); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', 'B co_admin without a grant cannot set salary on a new hire');
  begin insert into public.users (id, name, role) values ('00000000-0000-0000-0000-00000000aaaa', 'TEST New Hire', 'staff'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = 'none', 'B co_admin can still create a staff record without pay details');
end $$;
rollback;

-- CEO grants payroll access to finance: it can process payroll; revoking ends it; history kept
begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000c0');
select t.ok((select count(*) from public.users) = 6 and (select count(*) from public.salary_payroll) = 2, 'B CEO reads all staff pay records');
do $$ declare code text; begin
  begin perform public.cr360_grant_payroll_access('00000000-0000-0000-0000-0000000000f1', ''); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', 'B a grant needs a reason');
end $$;
select public.cr360_grant_payroll_access('00000000-0000-0000-0000-0000000000f1', 'monthly payroll processing') as g1 \gset
select public.cr360_grant_payroll_access('00000000-0000-0000-0000-0000000000f1', 'again') as g2 \gset
select t.ok(:'g1' = :'g2', 'B granting twice is idempotent (one active grant)');

select t.claims('00000000-0000-0000-0000-0000000000f1');
select t.ok((select count(*) from public.users) = 6 and (select count(*) from public.salary_payroll) = 2, 'B finance WITH a CEO grant reads pay records for processing');
do $$ declare n int; begin
  update public.users set base_salary = 444 where id = '00000000-0000-0000-0000-0000000000a2'; get diagnostics n = row_count;
  perform t.ok(n = 0, 'B finance (not co_admin/admin) still has no users write policy, grant or not');
end $$;

select t.claims('00000000-0000-0000-0000-0000000000c0');
select t.ok(public.cr360_revoke_payroll_access('00000000-0000-0000-0000-0000000000f1', 'role change'), 'B CEO revokes the grant');
select t.claims('00000000-0000-0000-0000-0000000000f1');
select t.ok((select count(*) from public.users) = 1 and (select count(*) from public.salary_payroll) = 0, 'B access ends immediately after revoke');
select t.claims('00000000-0000-0000-0000-0000000000c0');
select t.ok((select count(*) from public.cr360_payroll_grants() where revoked_at is not null) = 1, 'B revoked grant stays in the history (CEO view)');
reset role;
do $$ declare code text; begin
  begin delete from cr360_authz.payroll_grants; code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', 'B grant history cannot be deleted, even by the table owner');
end $$;
rollback;

-- co_admin with a grant can edit pay (legacy staff page keeps working once authorised)
begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000c0');
select public.cr360_grant_payroll_access('00000000-0000-0000-0000-0000000000c1', 'HR administrator');
select t.claims('00000000-0000-0000-0000-0000000000c1');
do $$ declare n int; begin
  update public.users set base_salary = 333 where id = '00000000-0000-0000-0000-0000000000a2'; get diagnostics n = row_count;
  perform t.ok(n = 1, 'B co_admin WITH a CEO grant can edit a colleague''s salary');
end $$;
rollback;

-- regression for the NULL-guard bug: an account WITHOUT a legacy users row (360-only manager)
begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a1');
select t.ok(cr360_authz.is_ceo() = false and cr360_authz.can_read_confidential_hr() = false, 'B no legacy row: is_ceo/can_read are false, never NULL');
do $$ declare code text; begin
  begin perform public.cr360_grant_payroll_access('00000000-0000-0000-0000-0000000000a2', 'sneaky grant'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', 'B an account without a legacy row cannot grant payroll access');
end $$;
rollback;

-- anon: nothing
begin;
set local role anon; select t.claims(null);
do $$ declare code text; begin
  begin perform public.cr360_grant_payroll_access('00000000-0000-0000-0000-0000000000f1', 'x'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', 'B anon cannot call the grant function');
end $$;
select t.ok((select count(*) from public.salary_payroll) = 0, 'B anon reads no payslips');
rollback;
