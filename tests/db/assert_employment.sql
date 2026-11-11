-- Owner decision A (0006 + 0012): access ends on the termination date / contract expiry and while
-- suspended; reinstatement; audited offboarding; records kept.
\set QUIET on
-- CEO ...c0 (legacy admin + cr360 ceo), manager A ...a1, staff A ...a2, staff A2 ...a3

-- dates and statuses (set directly as the table owner, then test as the person)
begin;
update public.users set end_date = (now() at time zone 'Asia/Vientiane')::date - 1 where id = '00000000-0000-0000-0000-0000000000a3';
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a3');
select t.ok(public.my_role() is null and (select count(*) from public.student_packages) = 0, 'A past end date: no legacy role, no data');
select t.ok(not cr360_authz.active_member(), 'A past end date: ClickRobot 360 membership no longer counts');
select t.ok((select count(*) from public.cr360_hr_employees) = 0, 'A past end date: StaffOS records closed to them');
rollback;

begin;
update public.users set end_date = (now() at time zone 'Asia/Vientiane')::date where id = '00000000-0000-0000-0000-0000000000a3';
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a3');
select t.ok(public.my_role() = 'staff', 'A access continues through the last working day');
rollback;

begin;
update public.users set contract_end = (now() at time zone 'Asia/Vientiane')::date - 1 where id = '00000000-0000-0000-0000-0000000000a3';
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a3');
select t.ok(public.my_role() is null, 'A expired contract: access revoked');
rollback;

begin;
update public.users set status = 'On leave', active = false where id = '00000000-0000-0000-0000-0000000000a3';
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a3');
select t.ok(public.my_role() = 'staff' and cr360_authz.active_member(), 'A staff on leave keep access (legacy sets active=false for On leave)');
rollback;

-- CEO suspends, reinstates, offboards — audited; others cannot
begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a1');
do $$ declare code text; begin
  begin perform public.cr360_staff_suspend('00000000-0000-0000-0000-0000000000a2', 'not allowed'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', 'A a 360 branch manager (no legacy row) cannot suspend staff');
end $$;
select t.claims('00000000-0000-0000-0000-0000000000c0');
do $$ declare code text; begin
  begin perform public.cr360_staff_suspend(auth.uid(), 'oops'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', 'A the CEO cannot suspend themselves (no lock-out)');
  begin perform public.cr360_staff_suspend('00000000-0000-0000-0000-0000000000a2', ''); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', 'A suspension needs a reason');
end $$;
select public.cr360_staff_suspend('00000000-0000-0000-0000-0000000000a2', 'investigation');
select t.claims('00000000-0000-0000-0000-0000000000a2');
select t.ok(public.my_role() is null and not cr360_authz.active_member(), 'A suspended staff lose legacy and 360 access immediately');
select t.claims('00000000-0000-0000-0000-0000000000c0');
select public.cr360_staff_reinstate('00000000-0000-0000-0000-0000000000a2', 'cleared');
select t.claims('00000000-0000-0000-0000-0000000000a2');
select t.ok(public.my_role() = 'staff' and cr360_authz.active_member(), 'A reinstated staff regain access');
reset role;
select t.ok((select count(*) from cr360_vault.audit_events where entity_id = '00000000-0000-0000-0000-0000000000a2'
             and action in ('hr.employment.suspend', 'hr.employment.reinstate')) = 2, 'A suspend and reinstate are both audited with before/after');
rollback;

begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000c0');
select public.cr360_grant_payroll_access('00000000-0000-0000-0000-0000000000a3', 'temporary payroll help');
select public.cr360_staff_offboard('00000000-0000-0000-0000-0000000000a3', ((now() at time zone 'Asia/Vientiane')::date + 7), 'resigned');
select t.claims('00000000-0000-0000-0000-0000000000a3');
select t.ok(public.my_role() = 'staff', 'A future-dated offboarding: access continues until the last day');
select t.ok(not cr360_authz.can_read_confidential_hr(), 'A offboarding revokes payroll grants at once');
select t.claims('00000000-0000-0000-0000-0000000000c0');
select public.cr360_staff_offboard('00000000-0000-0000-0000-0000000000a3', ((now() at time zone 'Asia/Vientiane')::date - 1), 'last day moved');
select t.claims('00000000-0000-0000-0000-0000000000a3');
select t.ok(public.my_role() is null and not cr360_authz.active_member(), 'A past-dated offboarding: access ends immediately');
select t.claims('00000000-0000-0000-0000-0000000000c0');
select t.ok((select status from public.users where id = '00000000-0000-0000-0000-0000000000a3') = 'Terminated'
  and (select count(*) from public.salary_payroll where user_id = '00000000-0000-0000-0000-0000000000a3') = 1,
  'A offboarded person is Terminated; their payslip history is kept for management');
reset role;
select t.ok((select active from public.cr360_hr_memberships where user_id = '00000000-0000-0000-0000-0000000000a3') = false
  and (select employment_status from public.cr360_hr_employees where auth_user_id = '00000000-0000-0000-0000-0000000000a3') = 'departed',
  'A 360 membership deactivated and employee marked departed (row kept)');
rollback;

begin;
update public.users set end_date = (now() at time zone 'Asia/Vientiane')::date - 3 where id = '00000000-0000-0000-0000-0000000000a3';
select t.ok(public.cr360_staff_close_ended() = 1, 'A housekeeping marks people past their last day as Terminated');
select t.ok((select status from public.users where id = '00000000-0000-0000-0000-0000000000a3') = 'Terminated', 'A housekeeping keeps the row');
rollback;
