-- 0021 campaigns, attribution, referral rewards. Manager A ...a1, manager B ...b1, staff A ...a2, CEO ...c0.
\set QUIET on
begin;
select set_config('t.d', ((now() at time zone 'Asia/Vientiane')::date)::text, true);
insert into public.leads (id, student_name, branch_id, source, status) values
  ('90000000-0000-0000-0000-000000000001', 'TEST Lead One', '10000000-0000-0000-0000-00000000000a', 'Facebook', 'New'),
  ('90000000-0000-0000-0000-000000000002', 'TEST Lead Two', '10000000-0000-0000-0000-00000000000a', 'Referral', 'Registered'),
  ('90000000-0000-0000-0000-000000000003', 'TEST Lead Three', '10000000-0000-0000-0000-00000000000b', 'Referral', 'Registered');
set local role authenticated;
select t.claims('00000000-0000-0000-0000-0000000000a1');
do $$ declare code text; begin
  begin perform public.cr360_campaign_save(null, 'All-branch', 'Facebook', null, current_setting('t.d')::date, current_setting('t.d')::date + 30, 0, 0); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0021 a branch manager cannot create an all-branch campaign');
end $$;
select public.cr360_campaign_save(null, 'Nov Facebook ads', 'Facebook', '10000000-0000-0000-0000-00000000000a', current_setting('t.d')::date - 10, current_setting('t.d')::date + 20, 1000000, 600000) as cp \gset
select set_config('t.cp', :'cp', true);
select t.claims('00000000-0000-0000-0000-0000000000a2');
select t.ok(public.cr360_lead_attribute('90000000-0000-0000-0000-000000000001', current_setting('t.cp')::uuid, null), '0021 branch staff attribute a lead to a campaign');
do $$ declare code text; begin
  begin perform public.cr360_lead_attribute('90000000-0000-0000-0000-000000000002', null, 'NOPE-999'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', '0021 the referrer must be an existing student');
  begin perform public.cr360_lead_attribute('90000000-0000-0000-0000-000000000003', null, 'TST-001'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0021 staff cannot attribute another branch''s lead');
end $$;
select public.cr360_lead_attribute('90000000-0000-0000-0000-000000000002', current_setting('t.cp')::uuid, 'TST-001');
select t.claims('00000000-0000-0000-0000-0000000000a1');
select t.ok((select leads from public.cr360_campaign_report(current_setting('t.d')::date - 30, current_setting('t.d')::date)) = 2
  and (select cost_per_lead from public.cr360_campaign_report(current_setting('t.d')::date - 30, current_setting('t.d')::date)) = 300000
  and (select cost_per_registration from public.cr360_campaign_report(current_setting('t.d')::date - 30, current_setting('t.d')::date)) = 600000,
  '0021 campaign report: leads, cost per lead and per registration');
do $$ declare code text; begin
  begin perform public.cr360_referral_reward('90000000-0000-0000-0000-000000000001', 'approve', 'x'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', '0021 no reward without a recorded referrer / registration');
end $$;
select t.ok(public.cr360_referral_reward('90000000-0000-0000-0000-000000000002', 'approve', '1 free session') = 'approved', '0021 manager approves a reward after registration');
select t.ok(public.cr360_referral_reward('90000000-0000-0000-0000-000000000002', 'approve', 'again') = 'approved', '0021 approving twice is a no-op');
select t.ok(public.cr360_referral_reward('90000000-0000-0000-0000-000000000002', 'give', 'given at front desk') = 'given', '0021 reward marked given');
select t.ok((select registered from public.cr360_referral_board() where referrer_student_code = 'TST-001') = 1, '0021 referral leaderboard counts registrations');
select t.claims('00000000-0000-0000-0000-0000000000b1');
select t.ok((select count(*) from public.cr360_referral_rewards) = 0 and (select count(*) from public.cr360_campaign_report(current_setting('t.d')::date - 30, current_setting('t.d')::date)) = 0,
  '0021 other-branch manager sees no rewards or campaign results');
do $$ declare code text; begin
  begin perform public.cr360_referral_reward('90000000-0000-0000-0000-000000000002', 'decline', 'not eligible'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0021 other-branch manager cannot decide rewards');
end $$;
reset role;
select t.ok((select count(*) from cr360_vault.audit_events where action like 'crm.referral_reward.%') = 2, '0021 reward approve/give audited');
rollback;
