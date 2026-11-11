-- =====================================================================================
-- PROPOSED — NOT APPLIED. Requires CEO approval. Apply AFTER 0005 (guardian links). Staging first.
-- Rollback: 0013_guardian_consents.rollback.sql
--
-- OWNER DECISION D (2026-11-11): explicit guardian consent, private by default.
--   required   data_processing   storing/processing the child's information. Recorded when a manager
--                                VERIFIES the link (0005 consent_at + consent_version). Withdrawing it =
--                                revoking the link (existing, audited).
--   optional   portal_media      teacher photos/videos shown in the PRIVATE parent portal
--              ai_reports        using AI to help prepare learning reports (de-identified input)
--              notifications     messages through WhatsApp or other channels
--              public_marketing  SEPARATE consent for any public/marketing use of photos/videos
--   Optional purposes are OFF until a guardian grants them; parents review and withdraw any time.
--   With several guardians: allowed only if at least one verified guardian granted AND none withdrew.
--   Every change is an append-only event (who, when, version, portal/in person). Nothing is deleted.
--
-- DATA IMPACT: one new table; no existing rows change.
-- =====================================================================================
begin;

create table if not exists public.cr360_guardian_consents (
  id bigint generated always as identity primary key,
  link_id uuid not null references public.cr360_guardian_links(id),
  student_code text not null,
  guardian_user_id uuid not null,
  purpose text not null check (purpose in ('portal_media', 'ai_reports', 'notifications', 'public_marketing')),
  granted boolean not null,
  consent_version text check (consent_version is null or length(consent_version) between 3 and 60),
  method text not null check (method in ('portal', 'in_person')),
  note text check (note is null or length(note) <= 300),
  recorded_by uuid not null,
  recorded_at timestamptz not null default now(),
  check (not granted or consent_version is not null)          -- a grant always names the text version
);
create index if not exists cr360_guardian_consents_latest on public.cr360_guardian_consents (link_id, purpose, id desc);
create index if not exists cr360_guardian_consents_code on public.cr360_guardian_consents (student_code, purpose);
alter table public.cr360_guardian_consents enable row level security;
revoke all on public.cr360_guardian_consents from public, anon, authenticated;   -- functions only

create or replace function public.cr360_guardian_consents_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'consent history is append-only' using errcode = '42501'; end $$;
drop trigger if exists cr360_guardian_consents_immutable on public.cr360_guardian_consents;
create trigger cr360_guardian_consents_immutable before update or delete on public.cr360_guardian_consents
  for each row execute function public.cr360_guardian_consents_immutable();

-- current state for one link + purpose (NULL = never asked = not granted)
create or replace function cr360_authz.consent_latest(p_link uuid, p_purpose text) returns boolean
language sql stable security definer set search_path = '' as $$
  select c.granted from public.cr360_guardian_consents c
  where c.link_id = p_link and c.purpose = p_purpose order by c.id desc limit 1
$$;
revoke all on function cr360_authz.consent_latest(uuid, text) from public, anon, authenticated;

-- Is a purpose allowed for a child? At least one verified live guardian granted, none withdrew.
create or replace function cr360_authz.student_consent(p_code text, p_purpose text) returns boolean
language sql stable security definer set search_path = '' as $$
  with live as (
    select l.id from public.cr360_guardian_links l
    where l.student_code = p_code and l.verified_at is not null and l.consent_at is not null and l.revoked_at is null)
  select coalesce(
    exists (select 1 from live where cr360_authz.consent_latest(live.id, p_purpose) is true)
    and not exists (select 1 from live where cr360_authz.consent_latest(live.id, p_purpose) is false), false)
$$;
revoke all on function cr360_authz.student_consent(text, text) from public, anon, authenticated;

-- Guardian (portal): set an optional purpose for one of their verified children.
create or replace function public.cr360_guardian_consent_set(p_student_code text, p_purpose text, p_granted boolean, p_version text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_link uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_purpose not in ('portal_media', 'ai_reports', 'notifications', 'public_marketing') or p_granted is null then
    raise exception 'invalid purpose' using errcode = '22023';
  end if;
  select l.id into v_link from public.cr360_guardian_links l
   where l.guardian_user_id = auth.uid() and l.student_code = p_student_code
     and l.verified_at is not null and l.consent_at is not null and l.revoked_at is null;
  if v_link is null then raise exception 'access denied' using errcode = '42501'; end if;
  if p_granted and (p_version is null or length(trim(p_version)) < 3) then
    raise exception 'consent text version not configured' using errcode = '22023';
  end if;
  if cr360_authz.consent_latest(v_link, p_purpose) is not distinct from p_granted then return false; end if;  -- idempotent
  insert into public.cr360_guardian_consents (link_id, student_code, guardian_user_id, purpose, granted, consent_version, method, recorded_by)
  values (v_link, p_student_code, auth.uid(), p_purpose, p_granted, case when p_granted then trim(p_version) end, 'portal', auth.uid());
  return true;
end $$;

-- Staff (manager of the child's branch / CEO): record a consent given IN PERSON (e.g. signed form).
create or replace function public.cr360_guardian_consent_record(p_link uuid, p_purpose text, p_granted boolean, p_version text, p_note text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_code text; v_guardian uuid;
begin
  select l.student_code, l.guardian_user_id into v_code, v_guardian from public.cr360_guardian_links l
   where l.id = p_link and l.verified_at is not null and l.revoked_at is null;
  if v_code is null then raise exception 'link not found or not verified' using errcode = 'P0002'; end if;
  if cr360_authz.can_manage_student(v_code) is not true then raise exception 'access denied' using errcode = '42501'; end if;
  if p_purpose not in ('portal_media', 'ai_reports', 'notifications', 'public_marketing') or p_granted is null then
    raise exception 'invalid purpose' using errcode = '22023';
  end if;
  if p_granted and (p_version is null or length(trim(p_version)) < 3) then raise exception 'consent text version required' using errcode = '22023'; end if;
  if p_note is null or length(trim(p_note)) < 3 then raise exception 'note required (e.g. form reference)' using errcode = '22023'; end if;
  if cr360_authz.consent_latest(p_link, p_purpose) is not distinct from p_granted then return false; end if;
  insert into public.cr360_guardian_consents (link_id, student_code, guardian_user_id, purpose, granted, consent_version, method, note, recorded_by)
  values (p_link, v_code, v_guardian, p_purpose, p_granted, case when p_granted then trim(p_version) end, 'in_person', trim(p_note), auth.uid());
  return true;
end $$;

-- Guardian: review own choices per child (required consent shown from the verified link).
create or replace function public.cr360_guardian_my_consents()
returns table (student_code text, purpose text, granted boolean, consent_version text, recorded_at timestamptz, method text)
language sql stable security definer set search_path = '' as $$
  select l.student_code, 'data_processing', true, l.consent_version, l.consent_at, 'in_person'
    from public.cr360_guardian_links l
   where l.guardian_user_id = auth.uid() and l.verified_at is not null and l.consent_at is not null and l.revoked_at is null
  union all
  select x.student_code, x.purpose, x.granted, x.consent_version, x.recorded_at, x.method from (
    -- latest event per link + purpose (DISTINCT ON needs its own ORDER BY ... id desc)
    select distinct on (c.link_id, c.purpose) c.student_code, c.purpose, c.granted, c.consent_version, c.recorded_at, c.method
      from public.cr360_guardian_consents c
      join public.cr360_guardian_links l on l.id = c.link_id
     where l.guardian_user_id = auth.uid() and l.verified_at is not null and l.revoked_at is null
     order by c.link_id, c.purpose, c.id desc) x
$$;

-- Staff: which of these children allow a purpose? Booleans only; no guardian details.
-- Callers: teachers (AI drafts), media upload, notification sending. Active staff members only.
create or replace function public.cr360_student_consent_ok(p_codes text[], p_purpose text)
returns table (student_code text, ok boolean)
language sql stable security definer set search_path = '' as $$
  select c, cr360_authz.student_consent(c, p_purpose)
    from unnest(coalesce(p_codes, '{}'::text[])) as c
   where cr360_authz.active_member() and cardinality(p_codes) <= 500
     and p_purpose in ('portal_media', 'ai_reports', 'notifications', 'public_marketing')
$$;

revoke all on function public.cr360_guardian_consent_set(text, text, boolean, text) from public, anon;
revoke all on function public.cr360_guardian_consent_record(uuid, text, boolean, text, text) from public, anon;
revoke all on function public.cr360_guardian_my_consents() from public, anon;
revoke all on function public.cr360_student_consent_ok(text[], text) from public, anon;
grant execute on function public.cr360_guardian_consent_set(text, text, boolean, text) to authenticated;
grant execute on function public.cr360_guardian_consent_record(uuid, text, boolean, text, text) to authenticated;
grant execute on function public.cr360_guardian_my_consents() to authenticated;
grant execute on function public.cr360_student_consent_ok(text[], text) to authenticated;

commit;
