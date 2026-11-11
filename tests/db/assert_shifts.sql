-- 0008 shift planner. Run after all proposed migrations.
\set QUIET on
-- manager A ...a1 (branch A), manager B ...b1, staff A ...a2, CEO ...c0; employees: a2 (A), a3 (A), b9 (B)

begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a1');
select public.cr360_hr_create_shift('20000000-0000-0000-0000-0000000000a2', now() + interval '1 day', now() + interval '1 day 8 hours') as s1 \gset
select set_config('t.s1', :'s1', true);
select t.ok(:'s1' <> '', '0008 branch-A manager creates a shift for own-branch staff');

do $$ declare code text; begin
  begin perform public.cr360_hr_create_shift('20000000-0000-0000-0000-0000000000a2', now() + interval '1 day 4 hours', now() + interval '1 day 10 hours'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '23P01', '0008 overlapping shift for the same person is rejected');
  begin perform public.cr360_hr_create_shift('20000000-0000-0000-0000-0000000000a2', now() + interval '1 day 8 hours', now() + interval '1 day 12 hours'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = 'none', '0008 back-to-back shift is allowed');
  begin perform public.cr360_hr_create_shift('20000000-0000-0000-0000-0000000000b9', now() + interval '2 days', now() + interval '2 days 4 hours'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0008 manager A cannot schedule branch-B staff');
  begin perform public.cr360_hr_create_shift('20000000-0000-0000-0000-0000000000a3', now() - interval '1 day', now() - interval '20 hours'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', '0008 back-dated shift is rejected (no fabricated attendance)');
  begin perform public.cr360_hr_create_shift('20000000-0000-0000-0000-0000000000a3', now() + interval '1 day', now() + interval '1 day 17 hours'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', '0008 shift longer than 16 h is rejected');
  begin perform public.cr360_hr_create_shift('20000000-0000-0000-0000-0000000000a3', now() + interval '1 day 2 hours', now() + interval '1 day'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', '0008 end before start is rejected');
end $$;

-- staff sees own shift through existing v0.4 RLS; cannot create shifts
select t.claims('00000000-0000-0000-0000-0000000000a2');
select t.ok((select count(*) from public.cr360_hr_shifts where id = current_setting('t.s1')::uuid) = 1, '0008 staff can see the shift on their own schedule');
do $$ declare code text; begin
  begin perform public.cr360_hr_create_shift('20000000-0000-0000-0000-0000000000a2', now() + interval '3 days', now() + interval '3 days 2 hours'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0008 plain staff cannot create shifts (even for themselves)');
  begin perform public.cr360_hr_cancel_shift(current_setting('t.s1')::uuid, 'not me'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0008 plain staff cannot cancel shifts');
end $$;

-- manager B cannot cancel a branch-A shift; manager A can, with a reason; idempotent
select t.claims('00000000-0000-0000-0000-0000000000b1');
do $$ declare code text; begin
  begin perform public.cr360_hr_cancel_shift(current_setting('t.s1')::uuid, 'not mine'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0008 other-branch manager cannot cancel');
end $$;
select t.claims('00000000-0000-0000-0000-0000000000a1');
do $$ declare code text; begin
  begin perform public.cr360_hr_cancel_shift(current_setting('t.s1')::uuid, ''); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', '0008 cancel requires a reason');
end $$;
select public.cr360_hr_cancel_shift(current_setting('t.s1')::uuid, 'staff swap');
select public.cr360_hr_cancel_shift(current_setting('t.s1')::uuid, 'staff swap again');
select t.ok((select status from public.cr360_hr_shifts where id = current_setting('t.s1')::uuid) = 'cancelled', '0008 shift cancelled (row kept as history)');
-- cancelled slot can be re-used
select t.ok(public.cr360_hr_create_shift('20000000-0000-0000-0000-0000000000a2', now() + interval '1 day 1 hour', now() + interval '1 day 5 hours') is not null, '0008 cancelled time slot can be scheduled again');
reset role;
select t.ok((select count(*) from cr360_vault.audit_events where entity = 'cr360_hr_shifts' and action = 'shift.cancelled') = 1, '0008 one cancel audit event (idempotent second cancel writes nothing)');
select t.ok((select count(*) from cr360_vault.audit_events where entity = 'cr360_hr_shifts' and action = 'shift.created') = 3, '0008 every created shift is audited');
rollback;

begin;
-- CEO can schedule any branch
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000c0');
select t.ok(public.cr360_hr_create_shift('20000000-0000-0000-0000-0000000000b9', now() + interval '2 days', now() + interval '2 days 4 hours') is not null, '0008 CEO can schedule in any branch');
-- direct writes still impossible
do $$ declare blocked boolean; begin
  begin insert into public.cr360_hr_shifts (employee_id, branch_id, starts_at, ends_at)
        values ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', now() - interval '3 days', now() - interval '2 days 20 hours'); blocked := false;
  exception when insufficient_privilege then blocked := true; end;
  perform t.ok(blocked, '0008 no direct INSERT into shifts, even for CEO (RPC only)');
end $$;
rollback;

begin;
set local role anon; select t.claims(null);
do $$ declare denied boolean; begin
  begin perform public.cr360_hr_create_shift('20000000-0000-0000-0000-0000000000a2', now() + interval '1 day', now() + interval '1 day 1 hour'); denied := false;
  exception when insufficient_privilege then denied := true; end;
  perform t.ok(denied, '0008 anon cannot create shifts');
end $$;
rollback;
