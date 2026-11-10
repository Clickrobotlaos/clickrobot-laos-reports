-- Checks for objects that only exist after the proposed migrations (0002–0004). Run after applying them.
\set QUIET on

-- ---------------------------------------------------------------- 0002 RPCs
begin;
set local role anon; select t.claims(null);
select t.ok((select count(*) from public.get_shared_invoice('tok_aaaaaaaaaaaaaaaaaaaa')) = 1, '0002 anon gets exactly the invoice for its token');
select t.ok((select count(*) from public.get_shared_invoice('tok_')) = 0, '0002 short/partial token returns nothing');
select t.ok((select count(*) from public.get_shared_invoice(null)) = 0, '0002 null token returns nothing');
do $$ declare denied boolean; begin
  begin perform * from public.staff_directory(); denied := false; exception when insufficient_privilege then denied := true; end;
  perform t.ok(denied, '0002 anon cannot call staff_directory');
end $$;
rollback;

begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a2');
select t.ok((select count(*) from public.staff_directory()) = 5, '0002 staff_directory lists active colleagues only (terminated excluded)');
select t.ok(not exists (
  select 1 from information_schema.routines r
  join information_schema.parameters p on p.specific_name = r.specific_name
  where r.routine_schema = 'public' and r.routine_name = 'staff_directory'
    and p.parameter_name in ('base_salary', 'bank_account_no', 'id_card', 'salary_currency')
), '0002 staff_directory exposes no salary/bank/ID columns');
rollback;

-- ---------------------------------------------------------------- 0003 audit
begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a2');
insert into public.attendance (package_id, class_id, date, status) values
  ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '2026-11-11', 'Present');
reset role;
select t.ok((select count(*) from cr360_audit.attendance_changes where op = 'INSERT' and actor = '00000000-0000-0000-0000-0000000000a2') = 1, '0003 attendance insert is audited with actor');
do $$ declare blocked boolean; begin
  begin delete from cr360_audit.attendance_changes; blocked := false; exception when insufficient_privilege then blocked := true; end;
  perform t.ok(blocked, '0003 attendance audit is append-only (even for owner)');
end $$;
set local role authenticated;
do $$ declare denied boolean; begin
  begin perform 1 from cr360_audit.attendance_changes; denied := false; exception when insufficient_privilege then denied := true; end;
  perform t.ok(denied, '0003 API roles cannot read the audit schema');
end $$;
rollback;

-- ---------------------------------------------------------------- 0004 HR decisions
begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a1');
select t.ok(public.cr360_hr_decide_request('leave', '60000000-0000-0000-0000-0000000000a2', 'approve') = 'approved', '0004 manager A approves own-branch staff leave');
select t.ok((select status from public.cr360_hr_leave_requests where id = '60000000-0000-0000-0000-0000000000a2') = 'approved', '0004 status persisted');
do $$ declare code text; begin
  begin perform public.cr360_hr_decide_request('leave', '60000000-0000-0000-0000-0000000000a2', 'reject', 'again'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '40001', '0004 second decision on same request is refused');
end $$;
do $$ declare code text; begin
  begin perform public.cr360_hr_decide_request('leave', '60000000-0000-0000-0000-0000000000b9', 'approve'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0004 manager A cannot decide branch B request');
end $$;
do $$ declare code text; begin
  begin perform public.cr360_hr_decide_request('leave', '60000000-0000-0000-0000-0000000000a1', 'approve'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0004 manager cannot approve own request');
end $$;
reset role;
select t.ok((select count(*) from cr360_vault.audit_events where entity_id = '60000000-0000-0000-0000-0000000000a2') = 1, '0004 exactly one audit event written');
do $$ declare blocked boolean; begin
  begin update cr360_vault.audit_events set reason = 'tamper'; blocked := false; exception when insufficient_privilege then blocked := true; end;
  perform t.ok(blocked, '0004 audit events are append-only (even for owner)');
end $$;
rollback;

begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a2');
do $$ declare code text; begin
  begin perform public.cr360_hr_decide_request('leave', '60000000-0000-0000-0000-0000000000a3', 'approve'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code in ('42501', 'P0002'), '0004 plain staff cannot decide any request');
end $$;
rollback;

begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000c0');
do $$ declare code text; begin
  begin perform public.cr360_hr_decide_request('leave', '60000000-0000-0000-0000-0000000000b9', 'reject', ''); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', '0004 rejection requires a reason');
end $$;
select t.ok(public.cr360_hr_decide_request('leave', '60000000-0000-0000-0000-0000000000b9', 'reject', 'overlaps exam week') = 'rejected', '0004 CEO can decide any branch with reason');
rollback;

begin;
set local role anon; select t.claims(null);
do $$ declare denied boolean; begin
  begin perform public.cr360_hr_decide_request('leave', '60000000-0000-0000-0000-0000000000a2', 'approve'); denied := false;
  exception when insufficient_privilege then denied := true; end;
  perform t.ok(denied, '0004 anon cannot execute decision RPC');
end $$;
rollback;
