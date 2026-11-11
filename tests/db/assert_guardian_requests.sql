-- 0009 parent requests. Run after all proposed migrations.
\set QUIET on
-- G1 ...e1, G2 ...e2, manager A ...a1 (branch A), manager B ...b1, CEO ...c0; TST-001 = branch A child, TST-002 = branch B

begin;
-- set up: verified link G1 ↔ TST-001, PENDING (unverified) link G2 ↔ TST-001
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a1');
select public.cr360_guardian_link('00000000-0000-0000-0000-0000000000e1', 'TST-001') as l1 \gset
select public.cr360_guardian_verify(:'l1', 'consent-test');
select public.cr360_guardian_link('00000000-0000-0000-0000-0000000000e2', 'TST-001') as l2 \gset

-- verified guardian creates an absence notice
select t.claims('00000000-0000-0000-0000-0000000000e1');
select public.cr360_guardian_request_create('TST-001', 'absence', current_date + 1, current_date + 1, 'family trip') as r1 \gset
select set_config('t.r1', :'r1', true);
select t.ok(:'r1' <> '', '0009 verified guardian can submit a request');
select t.ok((select count(*) from public.cr360_guardian_requests) = 1, '0009 guardian sees own request');
do $$ declare code text; begin
  begin perform public.cr360_guardian_request_create('TST-002', 'absence', current_date, current_date, 'not my child'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0009 cannot request for a child without a verified link');
  begin perform public.cr360_guardian_request_create('TST-001', 'absence', null, null, 'no date'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '23514', '0009 absence/extension require a start date');
  begin perform public.cr360_guardian_request_create('TST-001', 'absence', current_date + 3, current_date + 1, 'backwards'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '23514', '0009 end before start rejected');
  begin perform public.cr360_guardian_request_create('TST-001', 'absence', current_date - 30, current_date - 29, 'old'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', '0009 dates far in the past rejected');
  begin perform public.cr360_guardian_request_create('TST-001', 'refund', null, null, 'unknown kind'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '23514', '0009 unknown request kind rejected');
end $$;

-- unverified guardian cannot submit; cannot see others' requests
select t.claims('00000000-0000-0000-0000-0000000000e2');
do $$ declare code text; begin
  begin perform public.cr360_guardian_request_create('TST-001', 'makeup', null, null, 'pending link'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0009 pending (unverified) link cannot submit');
  begin perform public.cr360_guardian_request_cancel(current_setting('t.r1')::uuid); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = 'P0002', '0009 another guardian cannot cancel (looks like not found)');
end $$;
select t.ok((select count(*) from public.cr360_guardian_requests) = 0, '0009 other guardians see no request rows');
do $$ declare code text; begin
  begin perform * from public.cr360_guardian_requests_for_staff(); code := 'ok'; exception when others then code := sqlstate; end;
  perform t.ok(code = 'ok' and (select count(*) from public.cr360_guardian_requests_for_staff()) = 0, '0009 staff listing returns nothing to a guardian');
end $$;

-- staff side
select t.claims('00000000-0000-0000-0000-0000000000b1');
select t.ok((select count(*) from public.cr360_guardian_requests_for_staff()) = 0, '0009 other-branch manager sees no requests');
do $$ declare code text; begin
  begin perform public.cr360_guardian_request_decide(current_setting('t.r1')::uuid, 'approve'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0009 other-branch manager cannot decide');
end $$;
select t.claims('00000000-0000-0000-0000-0000000000a1');
select t.ok((select count(*) from public.cr360_guardian_requests_for_staff() where status = 'pending') = 1, '0009 branch manager sees the pending request');
select t.ok((select student_name from public.cr360_guardian_requests_for_staff() limit 1) = 'TEST Child One', '0009 listing shows the student name');
do $$ declare code text; begin
  begin perform public.cr360_guardian_request_decide(current_setting('t.r1')::uuid, 'reject', ' '); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', '0009 rejection requires a note');
end $$;
select t.ok(public.cr360_guardian_request_decide(current_setting('t.r1')::uuid, 'approve', 'noted, see you next week') = 'approved', '0009 manager approves');
do $$ declare code text; begin
  begin perform public.cr360_guardian_request_decide(current_setting('t.r1')::uuid, 'reject', 'changed mind'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '40001', '0009 decided request cannot be decided again');
end $$;
reset role;
select t.ok((select sessions_used from public.student_packages where student_id = 'TST-001') = 0, '0009 approval does not touch the session ledger');
select t.ok((select count(*) from cr360_vault.audit_events where entity = 'cr360_guardian_requests') = 2, '0009 create + approve audited');

-- guardian sees the decision; cannot cancel a decided request
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000e1');
select t.ok((select status || '|' || review_note from public.cr360_guardian_requests where id = current_setting('t.r1')::uuid) = 'approved|noted, see you next week', '0009 guardian sees decision and note');
do $$ declare code text; begin
  begin perform public.cr360_guardian_request_cancel(current_setting('t.r1')::uuid); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '40001', '0009 decided request cannot be cancelled');
end $$;
-- cancel own pending; idempotent
select public.cr360_guardian_request_create('TST-001', 'makeup', null, null, 'can we do Saturday?') as r2 \gset
select public.cr360_guardian_request_cancel(:'r2');
select public.cr360_guardian_request_cancel(:'r2');
select t.ok((select status from public.cr360_guardian_requests where id = :'r2') = 'cancelled', '0009 guardian cancels own pending request (idempotent)');

-- abuse guard: max 10 pending
do $$ declare code text; i int; begin
  for i in 1..10 loop perform public.cr360_guardian_request_create('TST-001', 'other', null, null, 'question ' || i); end loop;
  begin perform public.cr360_guardian_request_create('TST-001', 'other', null, null, 'eleventh'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '54000', '0009 more than 10 open requests is refused');
end $$;

-- revoking the link stops new requests immediately
select public.cr360_guardian_revoke(:'l1', 'withdraw');
do $$ declare code text; begin
  begin perform public.cr360_guardian_request_create('TST-001', 'other', null, null, 'after revoke'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0009 revoked guardian cannot submit');
end $$;

-- no direct writes
do $$ declare blocked boolean; begin
  begin insert into public.cr360_guardian_requests (guardian_user_id, student_code, kind, message) values (auth.uid(), 'TST-002', 'other', 'sneaky'); blocked := false;
  exception when insufficient_privilege then blocked := true; end;
  perform t.ok(blocked, '0009 no direct INSERT into requests');
end $$;
rollback;

begin;
set local role anon; select t.claims(null);
do $$ declare denied boolean; begin
  begin perform public.cr360_guardian_request_create('TST-001', 'other', null, null, 'anon'); denied := false; exception when insufficient_privilege then denied := true; end;
  perform t.ok(denied, '0009 anon cannot create requests');
end $$;
rollback;
