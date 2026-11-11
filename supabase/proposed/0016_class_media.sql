-- =====================================================================================
-- PROPOSED — NOT APPLIED. Requires CEO approval. Apply AFTER 0010 and 0013. Staging first.
-- Rollback: 0016_class_media.rollback.sql
--
-- Private class photos and short videos for the parent portal (owner request 2026-11-11).
--  * PRIVATE Supabase Storage bucket `cr360-class-media` (not public), 50 MB per file, JPEG/WebP/MP4.
--    Path: <branch_id>/<class_id>/<yyyy-mm-dd>/<uuid>.<ext>. Files are compressed on the teacher's phone.
--  * Upload: class teacher/assistant, assigned substitute, branch manager, CEO (can_teach_class).
--  * Each item tags the children in it. It can be SHARED only if EVERY tagged child has portal-media
--    consent (0013). Consent is re-checked on every read: one withdrawal hides the item at once.
--  * Parents read only shared, unexpired items that tag their verified child; the app hands out signed
--    URLs valid for one hour. Never public. No marketing use (separate consent, not used here).
--  * Retention: expires_on = lesson date + 90 days (hidden after that; a manager clears the files).
--  * Limits: 6 photos and 1 video per class per day (enforced here).
-- DATA IMPACT: one bucket row, one table, storage policies; no existing rows change.
-- =====================================================================================
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cr360-class-media', 'cr360-class-media', false, 52428800, array['image/jpeg', 'image/webp', 'video/mp4'])
on conflict (id) do nothing;

create table if not exists public.cr360_class_media (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id),
  branch_id uuid not null references public.branches(id),
  lesson_date date not null,
  storage_path text not null unique,
  kind text not null check (kind in ('photo', 'video')),
  mime text not null check (mime in ('image/jpeg', 'image/webp', 'video/mp4')),
  bytes integer not null check (bytes > 0 and bytes <= 52428800),
  duration_s numeric(6,1) check (duration_s is null or (duration_s > 0 and duration_s <= 60)),
  caption text check (caption is null or length(caption) <= 300),
  tagged_packages uuid[] not null default '{}',
  status text not null default 'private' check (status in ('private', 'shared', 'removed')),
  uploaded_by uuid not null,
  uploaded_at timestamptz not null default now(),
  shared_by uuid, shared_at timestamptz,
  removed_by uuid, removed_at timestamptz, remove_reason text,
  expires_on date not null,
  check (kind = 'video' or duration_s is null)
);
create index if not exists cr360_class_media_class_day on public.cr360_class_media (class_id, lesson_date);
create index if not exists cr360_class_media_tags on public.cr360_class_media using gin (tagged_packages);
alter table public.cr360_class_media enable row level security;
revoke all on public.cr360_class_media from anon, authenticated;
grant select on public.cr360_class_media to authenticated;
drop policy if exists cr360_class_media_staff_read on public.cr360_class_media;
create policy cr360_class_media_staff_read on public.cr360_class_media for select to authenticated
  using (cr360_authz.can_view_class_progress(class_id));

-- every tagged child currently allows portal media (and at least one child is tagged)
create or replace function cr360_authz.media_consented(p_tagged uuid[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select cardinality(p_tagged) > 0 and not exists (
    select 1 from unnest(p_tagged) as t(pkg)
    left join public.student_packages p on p.id = t.pkg
    where p.student_id is null or cr360_authz.student_consent(p.student_id, 'portal_media') is not true)
$$;
revoke all on function cr360_authz.media_consented(uuid[]) from public, anon, authenticated;

-- may the caller read this object? staff of the class, or a verified, consenting guardian of a tagged child
create or replace function cr360_authz.can_read_media_object(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(exists (
    select 1 from public.cr360_class_media m
    where m.storage_path = p_path
      -- staff of the class (also removed items, so a manager can delete the file); parents: shared only
      and (cr360_authz.can_view_class_progress(m.class_id)
           or (m.status = 'shared' and m.expires_on >= (now() at time zone 'Asia/Vientiane')::date
               and cr360_authz.media_consented(m.tagged_packages)
               and exists (select 1 from unnest(m.tagged_packages) t(pkg) join public.student_packages p on p.id = t.pkg
                           where cr360_authz.is_verified_guardian_of(p.student_id))))), false)
$$;
revoke all on function cr360_authz.can_read_media_object(text) from public, anon;
grant execute on function cr360_authz.can_read_media_object(text) to authenticated;

create or replace function cr360_authz.can_upload_media_path(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select cr360_authz.can_teach_class(c.id) and c.branch_id::text = (storage.foldername(p_path))[1]
    from public.classes c
    where c.id::text = (storage.foldername(p_path))[2]
      and (storage.foldername(p_path))[3] ~ '^\d{4}-\d{2}-\d{2}$'
      and array_length(storage.foldername(p_path), 1) = 3), false)
$$;
revoke all on function cr360_authz.can_upload_media_path(text) from public, anon;
grant execute on function cr360_authz.can_upload_media_path(text) to authenticated;

-- Storage policies: private bucket; no anon access; no updates (re-upload = new file).
drop policy if exists cr360_media_read on storage.objects;
create policy cr360_media_read on storage.objects for select to authenticated
  using (bucket_id = 'cr360-class-media' and cr360_authz.can_read_media_object(name));
drop policy if exists cr360_media_upload on storage.objects;
create policy cr360_media_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'cr360-class-media' and cr360_authz.can_upload_media_path(name));
drop policy if exists cr360_media_delete on storage.objects;
create policy cr360_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'cr360-class-media' and exists (
    select 1 from public.cr360_class_media m where m.storage_path = name and m.status = 'removed'
      and cr360_authz.is_branch_manager(m.branch_id)));

-- Register an uploaded file (after the upload succeeded).
create or replace function public.cr360_media_register(
  p_path text, p_kind text, p_mime text, p_bytes integer, p_duration numeric, p_caption text, p_tagged uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_class uuid; v_branch uuid; v_date date; v_id uuid; v_today date := (now() at time zone 'Asia/Vientiane')::date;
begin
  if cr360_authz.can_upload_media_path(p_path) is not true then raise exception 'access denied' using errcode = '42501'; end if;
  v_branch := ((storage.foldername(p_path))[1])::uuid; v_class := ((storage.foldername(p_path))[2])::uuid; v_date := ((storage.foldername(p_path))[3])::date;
  if v_date > v_today or v_date < v_today - 14 then raise exception 'lesson date out of range' using errcode = '22023'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'cr360-class-media' and o.name = p_path) then
    raise exception 'file not uploaded' using errcode = 'P0002';
  end if;
  if (p_kind = 'photo' and p_mime not in ('image/jpeg', 'image/webp')) or (p_kind = 'video' and p_mime <> 'video/mp4') then
    raise exception 'invalid file type' using errcode = '22023';
  end if;
  if (select count(*) from public.cr360_class_media m where m.class_id = v_class and m.lesson_date = v_date and m.kind = p_kind and m.status <> 'removed')
     >= (case when p_kind = 'photo' then 6 else 1 end) then
    raise exception 'limit reached for this class and day' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(coalesce(p_tagged, '{}')) t(pkg) where not exists (
      select 1 from public.class_bookings k where k.package_id = t.pkg and k.class_id = v_class and k.status = 'Confirmed')) then
    raise exception 'tagged child not booked in this class' using errcode = '22023';
  end if;
  insert into public.cr360_class_media (class_id, branch_id, lesson_date, storage_path, kind, mime, bytes, duration_s, caption, tagged_packages, uploaded_by, expires_on)
  values (v_class, v_branch, v_date, p_path, p_kind, p_mime, p_bytes, p_duration, nullif(trim(coalesce(p_caption, '')), ''),
          coalesce(p_tagged, '{}'), auth.uid(), v_date + 90)
  returning id into v_id;
  return v_id;
end $$;

-- p_action: share | unshare | remove (remove needs a reason; the file is then deleted via the Storage API)
create or replace function public.cr360_media_decide(p_id uuid, p_action text, p_reason text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare m public.cr360_class_media%rowtype;
begin
  select * into m from public.cr360_class_media where id = p_id for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if cr360_authz.can_teach_class(m.class_id) is not true then raise exception 'access denied' using errcode = '42501'; end if;
  if m.status = 'removed' then return 'removed'; end if;
  if p_action = 'share' then
    if cr360_authz.media_consented(m.tagged_packages) is not true then
      raise exception 'every tagged child needs photo/video consent' using errcode = '22023';
    end if;
    update public.cr360_class_media set status = 'shared', shared_by = auth.uid(), shared_at = now() where id = p_id;
  elsif p_action = 'unshare' then
    update public.cr360_class_media set status = 'private' where id = p_id;
  elsif p_action = 'remove' then
    if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'reason required' using errcode = '22023'; end if;
    update public.cr360_class_media set status = 'removed', removed_by = auth.uid(), removed_at = now(), remove_reason = trim(p_reason) where id = p_id;
  else raise exception 'invalid action' using errcode = '22023';
  end if;
  insert into cr360_vault.audit_events (actor, action, entity, entity_id, branch_id, before, after, reason)
  values (auth.uid(), 'media.' || p_action, 'cr360_class_media', p_id, m.branch_id, jsonb_build_object('status', m.status),
          jsonb_build_object('status', (select status from public.cr360_class_media where id = p_id)), p_reason);
  return (select status from public.cr360_class_media where id = p_id);
end $$;

-- Parents: shared, unexpired, consented items that tag their verified child (paths only; the app signs URLs)
create or replace function public.cr360_guardian_media(p_student_code text)
returns table (id uuid, storage_path text, kind text, caption text, lesson_date date, class_name text)
language sql stable security definer set search_path = '' as $$
  select m.id, m.storage_path, m.kind, m.caption, m.lesson_date, c.name
    from public.cr360_class_media m
    join public.classes c on c.id = m.class_id
   where cr360_authz.is_verified_guardian_of(p_student_code)
     and m.status = 'shared' and m.expires_on >= (now() at time zone 'Asia/Vientiane')::date
     and exists (select 1 from public.student_packages p where p.id = any (m.tagged_packages) and p.student_id = p_student_code)
     and cr360_authz.media_consented(m.tagged_packages)
   order by m.lesson_date desc, m.uploaded_at desc
   limit 60
$$;

revoke all on function public.cr360_media_register(text, text, text, integer, numeric, text, uuid[]) from public, anon;
revoke all on function public.cr360_media_decide(uuid, text, text) from public, anon;
revoke all on function public.cr360_guardian_media(text) from public, anon;
grant execute on function public.cr360_media_register(text, text, text, integer, numeric, text, uuid[]) to authenticated;
grant execute on function public.cr360_media_decide(uuid, text, text) to authenticated;
grant execute on function public.cr360_guardian_media(text) to authenticated;
commit;
