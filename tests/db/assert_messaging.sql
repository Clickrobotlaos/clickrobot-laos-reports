-- 0018 messaging. G1 ...e1 verified for TST-001 (branch A); G2 ...e2 unrelated; teacher staff A ...a2 teaches
-- class 40..01 where TST-001 is booked; staff A2 ...a3 same branch, not the teacher; manager A ...a1; manager B ...b1.
\set QUIET on
begin;
update public.classes set teacher_id = '00000000-0000-0000-0000-0000000000a2' where id = '40000000-0000-0000-0000-000000000001';
insert into public.class_bookings (class_id, package_id, kind, status) values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'regular', 'Confirmed');
set local role authenticated;
select t.claims('00000000-0000-0000-0000-0000000000a1');
select public.cr360_guardian_link('00000000-0000-0000-0000-0000000000e1', 'TST-001', 'mother') as l1 \gset
select public.cr360_guardian_verify(:'l1', 'consent-test-v1');

select t.claims('00000000-0000-0000-0000-0000000000e2');
do $$ declare code text; begin
  begin perform public.cr360_thread_start('TST-001', 'Hi', 'Hello'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0018 an unrelated account cannot message about a child');
end $$;
select t.claims('00000000-0000-0000-0000-0000000000e1');
select public.cr360_thread_start('TST-001', 'Pick-up time', 'Can we pick up 15 minutes early on Friday?') as th \gset
select set_config('t.th', :'th', true);
select t.ok((select count(*) from public.cr360_messages) = 1, '0018 parent starts a conversation');

select t.claims('00000000-0000-0000-0000-0000000000a2');
select t.ok((select count(*) from public.cr360_message_threads) = 1, '0018 the child''s teacher sees it');
select public.cr360_message_send(current_setting('t.th')::uuid, 'Yes, that is fine.');
select t.ok((select sender_side from public.cr360_messages order by id desc limit 1) = 'staff', '0018 teacher replies');
select t.claims('00000000-0000-0000-0000-0000000000a3');
select t.ok((select count(*) from public.cr360_message_threads) = 0 and (select count(*) from public.cr360_messages) = 0, '0018 another teacher of the branch sees nothing');
do $$ declare code text; begin
  begin perform public.cr360_message_send(current_setting('t.th')::uuid, 'hi'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0018 and cannot reply');
end $$;
select t.claims('00000000-0000-0000-0000-0000000000b1');
select t.ok((select count(*) from public.cr360_message_threads) = 0, '0018 other-branch manager sees nothing');
select t.claims('00000000-0000-0000-0000-0000000000a1');
select t.ok((select count(*) from public.cr360_messages) = 2, '0018 branch manager sees the conversation');
select t.ok(public.cr360_thread_close(current_setting('t.th')::uuid) = 'closed', '0018 manager closes the conversation');
select t.claims('00000000-0000-0000-0000-0000000000e1');
select t.ok((select count(*) from public.cr360_messages) = 2, '0018 parent reads the whole conversation');
select public.cr360_message_send(current_setting('t.th')::uuid, 'Thank you!');
select t.ok((select status from public.cr360_message_threads) = 'open', '0018 a parent reply reopens it');
do $$ declare code text; begin
  begin update public.cr360_messages set body = 'edited'; code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0018 messages cannot be edited');
end $$;
reset role;
do $$ declare code text; begin
  begin delete from public.cr360_messages; code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0018 messages cannot be deleted, even by the table owner');
end $$;
-- revoked link: no more access
set local role authenticated;
select t.claims('00000000-0000-0000-0000-0000000000a1');
select public.cr360_guardian_revoke(:'l1', 'test');
select t.claims('00000000-0000-0000-0000-0000000000e1');
select t.ok((select count(*) from public.cr360_messages) = 0, '0018 a revoked parent can no longer read the conversation');
rollback;
