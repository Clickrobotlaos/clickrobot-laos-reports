-- 0017 announcements. Manager A ...a1 (branch A), manager B ...b1, CEO ...c0, staff A ...a2,
-- G1 ...e1 verified for TST-001 (branch A), G2 ...e2 verified for TST-002 (branch B).
\set QUIET on
begin;
set local role authenticated;
select set_config('t.d', ((now() at time zone 'Asia/Vientiane')::date)::text, true);
select t.claims('00000000-0000-0000-0000-0000000000a1');
select public.cr360_guardian_link('00000000-0000-0000-0000-0000000000e1', 'TST-001', 'mother') as l1 \gset
select public.cr360_guardian_verify(:'l1', 'consent-test-v1');
select t.claims('00000000-0000-0000-0000-0000000000b1');
select public.cr360_guardian_link('00000000-0000-0000-0000-0000000000e2', 'TST-002', 'father') as l2 \gset
select public.cr360_guardian_verify(:'l2', 'consent-test-v1');

select t.claims('00000000-0000-0000-0000-0000000000a1');
select public.cr360_announcement_save(null, '10000000-0000-0000-0000-00000000000a', 'parents', 'Holiday closure', 'ປິດວັນພັກ', 'Closed on Friday.', null,
  current_setting('t.d')::date, current_setting('t.d')::date + 7) as an1 \gset
select set_config('t.an1', :'an1', true);
do $$ declare code text; begin
  begin perform public.cr360_announcement_save(null, null, 'all', 'All branches', null, 'x y', null, current_setting('t.d')::date, current_setting('t.d')::date); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0017 a branch manager cannot post to all branches');
  begin perform public.cr360_announcement_save(null, '10000000-0000-0000-0000-00000000000b', 'parents', 'Other', null, 'x y', null, current_setting('t.d')::date, current_setting('t.d')::date); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0017 a branch manager cannot post to another branch');
end $$;
select t.claims('00000000-0000-0000-0000-0000000000e1');
select t.ok((select count(*) from public.cr360_guardian_announcements()) = 0, '0017 drafts are not shown to parents');
select t.claims('00000000-0000-0000-0000-0000000000a1');
select t.ok(public.cr360_announcement_status(current_setting('t.an1')::uuid, 'publish') = 'published', '0017 branch manager publishes');
select t.claims('00000000-0000-0000-0000-0000000000e1');
select t.ok((select count(*) from public.cr360_guardian_announcements()) = 1, '0017 parent of a branch-A child sees the branch-A announcement');
select t.claims('00000000-0000-0000-0000-0000000000e2');
select t.ok((select count(*) from public.cr360_guardian_announcements()) = 0, '0017 parent of a branch-B child does not');
select t.claims('00000000-0000-0000-0000-0000000000a2');
select t.ok((select count(*) from public.cr360_announcements) = 0, '0017 a parents-only announcement is not shown to staff');

select t.claims('00000000-0000-0000-0000-0000000000c0');
select public.cr360_announcement_save(null, null, 'all', 'New term', null, 'Term starts Monday.', null, current_setting('t.d')::date, current_setting('t.d')::date + 3) as an2 \gset
select public.cr360_announcement_status(:'an2', 'publish');
select t.claims('00000000-0000-0000-0000-0000000000e2');
select t.ok((select count(*) from public.cr360_guardian_announcements()) = 1, '0017 CEO all-branch announcement reaches every verified parent');
select t.claims('00000000-0000-0000-0000-0000000000a2');
select t.ok((select count(*) from public.cr360_announcements) = 1, '0017 staff see the all-audience announcement');

select t.claims('00000000-0000-0000-0000-0000000000a1');
select t.ok(public.cr360_announcement_status(current_setting('t.an1')::uuid, 'withdraw') = 'withdrawn', '0017 manager withdraws');
select t.claims('00000000-0000-0000-0000-0000000000e1');
select t.ok((select count(*) from public.cr360_guardian_announcements() where title_en = 'Holiday closure') = 0, '0017 withdrawn announcement disappears');
reset role;
select t.ok((select count(*) from public.cr360_announcements) = 2, '0017 withdrawn announcement is kept');
select t.ok((select count(*) from cr360_vault.audit_events where entity = 'cr360_announcements') = 3, '0017 publish/withdraw audited');
rollback;
