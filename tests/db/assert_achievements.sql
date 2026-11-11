-- 0015 achievements & certificates. Teacher staff A ...a2 teaches class 40..01; manager A ...a1; manager B ...b1;
-- staff A2 ...a3 (same branch, not the teacher); guardian G1 ...e1 of TST-001.
\set QUIET on
begin;
update public.classes set teacher_id = '00000000-0000-0000-0000-0000000000a2' where id = '40000000-0000-0000-0000-000000000001';
insert into public.class_bookings (class_id, package_id, kind, status) values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'regular', 'Confirmed');
set local role authenticated;

select t.claims('00000000-0000-0000-0000-0000000000a3');
do $$ declare code text; begin
  begin perform public.cr360_achievement_propose('30000000-0000-0000-0000-000000000001', 'badge', 'Sensor master', null, null, (now() at time zone 'Asia/Vientiane')::date, null); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0015 a same-branch teacher who does not teach the child cannot propose');
end $$;

select t.claims('00000000-0000-0000-0000-0000000000a2');
select public.cr360_achievement_propose('30000000-0000-0000-0000-000000000001', 'level_complete', 'Spike Prime Level 2 complete', 'ຈົບລະດັບ 2', 'L2',
  (now() at time zone 'Asia/Vientiane')::date, 'Finished all projects') as a1 \gset
select set_config('t.a1', :'a1', true);
select t.ok((select status from public.cr360_achievements where id = current_setting('t.a1')::uuid) = 'proposed', '0015 class teacher proposes an achievement');
do $$ declare code text; begin
  begin perform public.cr360_achievement_decide(current_setting('t.a1')::uuid, 'issue'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0015 a teacher cannot issue their own proposal');
  begin perform public.cr360_achievement_propose('30000000-0000-0000-0000-000000000001', 'badge', 'Future', null, null, (now() at time zone 'Asia/Vientiane')::date + 5, null); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', '0015 a future award date is refused');
end $$;

select t.claims('00000000-0000-0000-0000-0000000000e1');
select t.ok((select count(*) from public.cr360_guardian_achievements('TST-001')) = 0, '0015 parents do not see proposals');

select t.claims('00000000-0000-0000-0000-0000000000b1');
do $$ declare code text; begin
  begin perform public.cr360_achievement_decide(current_setting('t.a1')::uuid, 'issue'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0015 other-branch manager cannot issue');
end $$;
select t.ok((select count(*) from public.cr360_achievements) = 0, '0015 other-branch manager cannot read the records');

select t.claims('00000000-0000-0000-0000-0000000000a1');
select t.ok(public.cr360_achievement_decide(current_setting('t.a1')::uuid, 'issue') = 'issued', '0015 branch manager issues the certificate');
select t.ok(public.cr360_achievement_decide(current_setting('t.a1')::uuid, 'issue') = 'issued', '0015 issuing twice is a no-op');
select t.ok((select certificate_no from public.cr360_achievements where id = current_setting('t.a1')::uuid) ~ '^CR-\d{4}-\d{5}$', '0015 certificate number assigned (CR-YYYY-NNNNN)');

select t.claims('00000000-0000-0000-0000-0000000000a1');
select public.cr360_guardian_link('00000000-0000-0000-0000-0000000000e1', 'TST-001', 'mother') as l1 \gset
select public.cr360_guardian_verify(:'l1', 'consent-test-v1');
select t.claims('00000000-0000-0000-0000-0000000000e1');
select t.ok((select count(*) from public.cr360_guardian_achievements('TST-001')) = 1, '0015 verified parent sees the issued certificate');
select t.ok((select count(*) from public.cr360_guardian_achievements('TST-002')) = 0, '0015 parent sees nothing for another child');

select t.claims('00000000-0000-0000-0000-0000000000a1');
do $$ declare code text; begin
  begin perform public.cr360_achievement_decide(current_setting('t.a1')::uuid, 'revoke', ''); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', '0015 revoking needs a reason');
end $$;
select t.ok(public.cr360_achievement_decide(current_setting('t.a1')::uuid, 'revoke', 'issued to wrong child') = 'revoked', '0015 manager revokes with a reason');
select t.claims('00000000-0000-0000-0000-0000000000e1');
select t.ok((select count(*) from public.cr360_guardian_achievements('TST-001')) = 0, '0015 revoked certificate disappears from the portal');
reset role;
select t.ok((select count(*) from public.cr360_achievements) = 1, '0015 revoked record is kept');
select t.ok((select count(*) from cr360_vault.audit_events where entity = 'cr360_achievements') = 3, '0015 propose, issue and revoke are audited');
rollback;
