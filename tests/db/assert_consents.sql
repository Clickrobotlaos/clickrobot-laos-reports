-- Owner decision D (0013): explicit guardian consent, private by default. Run after all migrations.
\set QUIET on
-- G1 ...e1, G2 ...e2 (both guardians of TST-001, branch A); manager A ...a1; manager B ...b1; teacher staff A ...a2

begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a1');
select public.cr360_guardian_link('00000000-0000-0000-0000-0000000000e1', 'TST-001', 'mother') as l1 \gset
select public.cr360_guardian_link('00000000-0000-0000-0000-0000000000e2', 'TST-001', 'father') as l2 \gset
select set_config('t.l1', :'l1', true), set_config('t.l2', :'l2', true);
select public.cr360_guardian_verify(:'l1', 'consent-test-v1');

-- private by default
select t.ok((select ok from public.cr360_student_consent_ok(array['TST-001'], 'ai_reports')) = false, 'D AI reports are NOT allowed by default');
select t.ok((select ok from public.cr360_student_consent_ok(array['TST-001'], 'portal_media')) = false, 'D portal photos/videos are NOT allowed by default');

-- guardian reviews: required consent shown from the verified link
select t.claims('00000000-0000-0000-0000-0000000000e1');
select t.ok((select count(*) from public.cr360_guardian_my_consents() where purpose = 'data_processing' and granted) = 1, 'D guardian sees the required data-processing consent from verification');
do $$ declare code text; begin
  begin perform public.cr360_guardian_consent_set('TST-001', 'ai_reports', true, null); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', 'D a grant without a consent text version is refused');
  begin perform public.cr360_guardian_consent_set('TST-002', 'ai_reports', true, 'consent-test-v1'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', 'D a guardian cannot set consent for someone else''s child');
  begin perform public.cr360_guardian_consent_set('TST-001', 'data_processing', false, null); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', 'D required consent is not toggled here (withdrawal = revoking the link)');
end $$;
select t.ok(public.cr360_guardian_consent_set('TST-001', 'ai_reports', true, 'consent-test-v1'), 'D guardian grants AI reports');
select t.ok(not public.cr360_guardian_consent_set('TST-001', 'ai_reports', true, 'consent-test-v1'), 'D granting again is a no-op');
select t.ok(public.cr360_guardian_consent_set('TST-001', 'portal_media', true, 'consent-test-v1'), 'D guardian grants private portal media');
select t.ok(public.cr360_guardian_ai_allowed('TST-001') = true and public.cr360_guardian_ai_allowed('TST-002') = false, 'D guardian can check AI permission for own child only');

-- portal media does NOT imply public marketing
select t.claims('00000000-0000-0000-0000-0000000000a2');
select t.ok((select ok from public.cr360_student_consent_ok(array['TST-001'], 'ai_reports')) = true, 'D teacher sees AI consent = yes (boolean only)');
select t.ok((select ok from public.cr360_student_consent_ok(array['TST-001'], 'public_marketing')) = false, 'D private media consent never implies public marketing');
do $$ declare n int := 0; begin
  begin select count(*) into n from public.cr360_guardian_consents; exception when insufficient_privilege then n := 0; end;
  perform t.ok(n = 0, 'D staff cannot read the consent table directly');
end $$;

-- second guardian verified and withdraws: NOT allowed any more
select t.claims('00000000-0000-0000-0000-0000000000a1');
select public.cr360_guardian_verify(current_setting('t.l2')::uuid, 'consent-test-v1');
select t.claims('00000000-0000-0000-0000-0000000000e2');
select public.cr360_guardian_consent_set('TST-001', 'ai_reports', false, null);
select t.claims('00000000-0000-0000-0000-0000000000a2');
select t.ok((select ok from public.cr360_student_consent_ok(array['TST-001'], 'ai_reports')) = false, 'D if any verified guardian withdraws, the purpose is off');
-- G1 withdraws media
select t.claims('00000000-0000-0000-0000-0000000000e1');
select public.cr360_guardian_consent_set('TST-001', 'portal_media', false, null);
select t.ok((select granted from public.cr360_guardian_my_consents() where purpose = 'portal_media') = false, 'D guardian sees the withdrawn state');
select t.claims('00000000-0000-0000-0000-0000000000a2');
select t.ok((select ok from public.cr360_student_consent_ok(array['TST-001'], 'portal_media')) = false, 'D withdrawal takes effect immediately');

-- in-person record by the branch manager (paper form), not by other branches
select t.claims('00000000-0000-0000-0000-0000000000b1');
do $$ declare code text; begin
  begin perform public.cr360_guardian_consent_record(current_setting('t.l1')::uuid, 'notifications', true, 'consent-test-v1', 'form 12'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', 'D other-branch manager cannot record consent');
end $$;
select t.claims('00000000-0000-0000-0000-0000000000a1');
do $$ declare code text; begin
  begin perform public.cr360_guardian_consent_record(current_setting('t.l1')::uuid, 'notifications', true, 'consent-test-v1', ''); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', 'D an in-person record needs a note (form reference)');
end $$;
select t.ok(public.cr360_guardian_consent_record(current_setting('t.l1')::uuid, 'notifications', true, 'consent-test-v1', 'signed form 12'), 'D branch manager records an in-person consent');

-- revoking the link removes every consent effect
select public.cr360_guardian_revoke(current_setting('t.l1')::uuid, 'moved away');
select t.claims('00000000-0000-0000-0000-0000000000a2');
select t.ok((select ok from public.cr360_student_consent_ok(array['TST-001'], 'notifications')) = false, 'D a revoked link''s consents no longer count');

-- anon / outsiders
select t.claims('00000000-0000-0000-0000-0000000000d9');
select t.ok((select count(*) from public.cr360_student_consent_ok(array['TST-001'], 'ai_reports')) = 0, 'D non-members get nothing from the consent check');
reset role;
select t.ok((select count(*) from public.cr360_guardian_consents where method = 'portal') >= 4 and
  (select count(*) from public.cr360_guardian_consents where method = 'in_person') = 1, 'D every change is kept as an event (who/when/version/method)');
do $$ declare code text; begin
  begin delete from public.cr360_guardian_consents; code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', 'D consent history cannot be deleted');
end $$;
rollback;
