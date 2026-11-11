-- 0016 class media. Class 40..01 (branch A ...0a), teacher staff A ...a2; staff A2 ...a3 same branch, not assigned;
-- manager A ...a1; G1 ...e1 guardian of TST-001 (pkg 30..01); G2 ...e2 guardian of TST-002 (pkg 30..02, branch B, manager B ...b1)
\set QUIET on
begin;
update public.classes set teacher_id = '00000000-0000-0000-0000-0000000000a2' where id = '40000000-0000-0000-0000-000000000001';
insert into public.class_bookings (class_id, package_id, kind, status) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'regular', 'Confirmed'),
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'regular', 'Confirmed');
select set_config('t.d', ((now() at time zone 'Asia/Vientiane')::date)::text, true);
select set_config('t.p1', '10000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-000000000001/' || current_setting('t.d') || '/p1.jpg', true);
select set_config('t.p2', '10000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-000000000001/' || current_setting('t.d') || '/p2.jpg', true);
set local role authenticated;
select t.claims('00000000-0000-0000-0000-0000000000a1');
select public.cr360_guardian_link('00000000-0000-0000-0000-0000000000e1', 'TST-001', 'mother') as l1 \gset
select public.cr360_guardian_verify(:'l1', 'consent-test-v1');
select t.claims('00000000-0000-0000-0000-0000000000b1');
select public.cr360_guardian_link('00000000-0000-0000-0000-0000000000e2', 'TST-002', 'father') as l2 \gset
select public.cr360_guardian_verify(:'l2', 'consent-test-v1');
select t.claims('00000000-0000-0000-0000-0000000000e1');
select public.cr360_guardian_consent_set('TST-001', 'portal_media', true, 'consent-test-v1');

-- uploads
select t.claims('00000000-0000-0000-0000-0000000000a3');
do $$ declare code text; begin
  begin insert into storage.objects (bucket_id, name) values ('cr360-class-media', current_setting('t.p1')); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0016 a same-branch teacher not assigned to the class cannot upload');
end $$;
select t.claims('00000000-0000-0000-0000-0000000000a2');
do $$ declare code text; begin
  begin insert into storage.objects (bucket_id, name) values ('cr360-class-media', '10000000-0000-0000-0000-00000000000b/40000000-0000-0000-0000-000000000001/' || current_setting('t.d') || '/x.jpg'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0016 upload path with the wrong branch is refused');
  begin perform public.cr360_media_register(current_setting('t.p1'), 'photo', 'image/jpeg', 300000, null, null, array['30000000-0000-0000-0000-000000000001']::uuid[]); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = 'P0002', '0016 a file must be uploaded before it is registered');
end $$;
insert into storage.objects (bucket_id, name) values ('cr360-class-media', current_setting('t.p1')), ('cr360-class-media', current_setting('t.p2'));
select t.ok(true, '0016 class teacher uploads to the private bucket');
select public.cr360_media_register(current_setting('t.p1'), 'photo', 'image/jpeg', 300000, null, 'Line follower test', array['30000000-0000-0000-0000-000000000001']::uuid[]) as m1 \gset
select public.cr360_media_register(current_setting('t.p2'), 'photo', 'image/jpeg', 280000, null, 'Team photo', array['30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002']::uuid[]) as m2 \gset
select set_config('t.m1', :'m1', true), set_config('t.m2', :'m2', true);

-- not shared yet: parents see nothing
select t.claims('00000000-0000-0000-0000-0000000000e1');
select t.ok((select count(*) from public.cr360_guardian_media('TST-001')) = 0 and (select count(*) from storage.objects) = 0, '0016 private items are invisible to parents');

-- share: single-child photo OK; group photo refused while one child lacks consent
select t.claims('00000000-0000-0000-0000-0000000000a2');
select t.ok(public.cr360_media_decide(current_setting('t.m1')::uuid, 'share') = 'shared', '0016 teacher shares a photo of a consenting child');
do $$ declare code text; begin
  begin perform public.cr360_media_decide(current_setting('t.m2')::uuid, 'share'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', '0016 a group photo is refused unless EVERY tagged child has media consent');
end $$;
select t.claims('00000000-0000-0000-0000-0000000000e1');
select t.ok((select count(*) from public.cr360_guardian_media('TST-001')) = 1, '0016 parent sees the shared photo of their child');
select t.ok((select count(*) from storage.objects where name = current_setting('t.p1')) = 1 and (select count(*) from storage.objects where name = current_setting('t.p2')) = 0,
  '0016 parent can read (sign) only the shared file, not the private group photo');
select t.claims('00000000-0000-0000-0000-0000000000e2');
select t.ok((select count(*) from public.cr360_guardian_media('TST-001')) = 0 and (select count(*) from storage.objects) = 0, '0016 another family sees nothing');
-- withdrawal hides it immediately
select t.claims('00000000-0000-0000-0000-0000000000e1');
select public.cr360_guardian_consent_set('TST-001', 'portal_media', false, null);
select t.ok((select count(*) from public.cr360_guardian_media('TST-001')) = 0 and (select count(*) from storage.objects) = 0, '0016 withdrawing media consent hides the photo at once');

-- limits: one video per class per day
select t.claims('00000000-0000-0000-0000-0000000000a2');
insert into storage.objects (bucket_id, name) values ('cr360-class-media', replace(current_setting('t.p1'), 'p1.jpg', 'v1.mp4')), ('cr360-class-media', replace(current_setting('t.p1'), 'p1.jpg', 'v2.mp4'));
select public.cr360_media_register(replace(current_setting('t.p1'), 'p1.jpg', 'v1.mp4'), 'video', 'video/mp4', 20000000, 45, null, '{}');
do $$ declare code text; begin
  begin perform public.cr360_media_register(replace(current_setting('t.p1'), 'p1.jpg', 'v2.mp4'), 'video', 'video/mp4', 20000000, 45, null, '{}'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '23514', '0016 only one video per class per day');
end $$;

-- removal: reason required; then only the branch manager can delete the file
do $$ declare code text; begin
  begin perform public.cr360_media_decide(current_setting('t.m2')::uuid, 'remove', ''); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', '0016 removing needs a reason');
end $$;
do $$ declare n int; begin
  delete from storage.objects where name = current_setting('t.p2'); get diagnostics n = row_count;
  perform t.ok(n = 0, '0016 files cannot be deleted before they are marked removed');
end $$;
select public.cr360_media_decide(current_setting('t.m2')::uuid, 'remove', 'blurry');
select t.claims('00000000-0000-0000-0000-0000000000a1');
do $$ declare n int; begin
  delete from storage.objects where name = current_setting('t.p2'); get diagnostics n = row_count;
  perform t.ok(n = 1, '0016 branch manager deletes a removed file');
end $$;
reset role;
select t.ok((select count(*) from cr360_vault.audit_events where entity = 'cr360_class_media') = 2, '0016 share and remove are audited');
set local role anon; select t.claims(null);
do $$ declare code text; n int := 0; begin
  begin select count(*) into n from storage.objects where bucket_id = 'cr360-class-media'; exception when others then n := 0; end;
  perform t.ok(n = 0, '0016 anonymous users read nothing from the bucket');
end $$;
rollback;
