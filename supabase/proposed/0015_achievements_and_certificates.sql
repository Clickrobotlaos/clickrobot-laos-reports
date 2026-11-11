-- =====================================================================================
-- PROPOSED — NOT APPLIED. Requires CEO approval. Apply AFTER 0005, 0010, 0012. Staging first.
-- Rollback: 0015_achievements_and_certificates.rollback.sql
--
-- Student achievements and digital certificates (owner request 2026-11-11):
--  * A teacher of a class the child is booked in (or an assigned substitute) PROPOSES an achievement.
--  * The branch manager or CEO ISSUES it (a certificate number is assigned) or declines it.
--  * Issued achievements can be REVOKED with a reason; nothing is ever deleted. All steps audited.
--  * Parents see ISSUED achievements of their verified children; certificates print from the portal.
--  * No public verification link (a child's name would be exposed); verification is by certificate
--    number through the centre.
-- DATA IMPACT: one new table and a counter; no existing rows change.
-- =====================================================================================
begin;

create table if not exists public.cr360_achievements (
  id uuid primary key default gen_random_uuid(),
  student_code text not null,
  package_id uuid not null references public.student_packages(id),
  branch_id uuid not null references public.branches(id),
  kind text not null check (kind in ('badge', 'level_complete', 'competition', 'certificate')),
  title_en text not null check (length(trim(title_en)) between 2 and 160),
  title_lo text check (title_lo is null or length(title_lo) <= 160),
  level text check (level is null or length(level) <= 100),
  note text check (note is null or length(note) <= 500),
  awarded_on date not null,
  status text not null default 'proposed' check (status in ('proposed', 'issued', 'declined', 'revoked')),
  certificate_no text unique,
  proposed_by uuid not null,
  proposed_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  revoke_reason text,
  check ((status = 'issued') = (certificate_no is not null) or status = 'revoked')
);
create index if not exists cr360_achievements_code on public.cr360_achievements (student_code, status);
create table if not exists cr360_authz.certificate_counter (year int primary key, last_no int not null default 0);
revoke all on cr360_authz.certificate_counter from public, anon, authenticated;

alter table public.cr360_achievements enable row level security;
revoke all on public.cr360_achievements from anon, authenticated;
grant select on public.cr360_achievements to authenticated;

-- teacher / assistant / assigned substitute of any active class the package is booked in
create or replace function cr360_authz.teaches_package(p_package uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(exists (
    select 1 from public.class_bookings k
    where k.package_id = p_package and k.status = 'Confirmed' and cr360_authz.can_teach_class(k.class_id)), false)
$$;
revoke all on function cr360_authz.teaches_package(uuid) from public, anon, authenticated;

create or replace function cr360_authz.can_see_achievement(p_code text, p_package uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(cr360_authz.can_manage_student(p_code) or cr360_authz.teaches_package(p_package), false)
$$;
revoke all on function cr360_authz.can_see_achievement(text, uuid) from public, anon;
grant execute on function cr360_authz.can_see_achievement(text, uuid) to authenticated;

drop policy if exists cr360_achievements_staff_read on public.cr360_achievements;
create policy cr360_achievements_staff_read on public.cr360_achievements for select to authenticated
  using (cr360_authz.can_see_achievement(student_code, package_id));

create or replace function public.cr360_achievement_propose(
  p_package uuid, p_kind text, p_title_en text, p_title_lo text, p_level text, p_awarded_on date, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_code text; v_branch uuid; v_id uuid; v_today date := (now() at time zone 'Asia/Vientiane')::date;
begin
  select p.student_id, p.branch_id into v_code, v_branch from public.student_packages p where p.id = p_package;
  if v_code is null then raise exception 'student not found' using errcode = 'P0002'; end if;
  if (cr360_authz.teaches_package(p_package) or cr360_authz.can_manage_student(v_code)) is not true then
    raise exception 'access denied' using errcode = '42501';
  end if;
  if p_kind not in ('badge', 'level_complete', 'competition', 'certificate') then raise exception 'invalid kind' using errcode = '22023'; end if;
  if p_title_en is null or length(trim(p_title_en)) < 2 then raise exception 'title required' using errcode = '22023'; end if;
  if p_awarded_on is null or p_awarded_on > v_today or p_awarded_on < v_today - 365 then raise exception 'invalid date' using errcode = '22023'; end if;
  insert into public.cr360_achievements (student_code, package_id, branch_id, kind, title_en, title_lo, level, note, awarded_on, proposed_by)
  values (v_code, p_package, v_branch, p_kind, trim(p_title_en), nullif(trim(coalesce(p_title_lo, '')), ''),
          nullif(trim(coalesce(p_level, '')), ''), nullif(trim(coalesce(p_note, '')), ''), p_awarded_on, auth.uid())
  returning id into v_id;
  insert into cr360_vault.audit_events (actor, action, entity, entity_id, branch_id, after)
  values (auth.uid(), 'learning.achievement.propose', 'cr360_achievements', v_id, v_branch, jsonb_build_object('kind', p_kind, 'title', trim(p_title_en)));
  return v_id;
end $$;

-- p_action: issue | decline | revoke (revoke needs a reason; only issued achievements can be revoked)
create or replace function public.cr360_achievement_decide(p_id uuid, p_action text, p_reason text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare a public.cr360_achievements%rowtype; v_year int := extract(year from (now() at time zone 'Asia/Vientiane'))::int; v_no int; v_cert text;
begin
  select * into a from public.cr360_achievements where id = p_id for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if cr360_authz.can_manage_student(a.student_code) is not true then raise exception 'access denied' using errcode = '42501'; end if;
  if p_action = 'issue' and a.status = 'proposed' then
    insert into cr360_authz.certificate_counter (year, last_no) values (v_year, 1)
      on conflict (year) do update set last_no = cr360_authz.certificate_counter.last_no + 1 returning last_no into v_no;
    v_cert := 'CR-' || v_year || '-' || lpad(v_no::text, 5, '0');
    update public.cr360_achievements set status = 'issued', certificate_no = v_cert, decided_by = auth.uid(), decided_at = now() where id = p_id;
  elsif p_action = 'decline' and a.status = 'proposed' then
    update public.cr360_achievements set status = 'declined', decided_by = auth.uid(), decided_at = now(), revoke_reason = nullif(trim(coalesce(p_reason, '')), '') where id = p_id;
  elsif p_action = 'revoke' and a.status = 'issued' then
    if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'reason required' using errcode = '22023'; end if;
    update public.cr360_achievements set status = 'revoked', revoke_reason = trim(p_reason), decided_by = auth.uid(), decided_at = now() where id = p_id;
  elsif (p_action = 'issue' and a.status = 'issued') or (p_action = 'decline' and a.status = 'declined') or (p_action = 'revoke' and a.status = 'revoked') then
    return a.status;   -- idempotent
  else
    raise exception 'invalid action for status %', a.status using errcode = '22023';
  end if;
  insert into cr360_vault.audit_events (actor, action, entity, entity_id, branch_id, before, after, reason)
  values (auth.uid(), 'learning.achievement.' || p_action, 'cr360_achievements', p_id, a.branch_id,
          jsonb_build_object('status', a.status), jsonb_build_object('status', (select status from public.cr360_achievements where id = p_id)), p_reason);
  return (select status from public.cr360_achievements where id = p_id);
end $$;

-- Parents: issued achievements of a verified child (name joined for the certificate)
create or replace function public.cr360_guardian_achievements(p_student_code text)
returns table (id uuid, kind text, title_en text, title_lo text, level text, awarded_on date, certificate_no text,
               student_name text, branch_name text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.kind, a.title_en, a.title_lo, a.level, a.awarded_on, a.certificate_no, p.student_name, b.name
    from public.cr360_achievements a
    join public.student_packages p on p.id = a.package_id
    left join public.branches b on b.id = a.branch_id
   where a.student_code = p_student_code and a.status = 'issued' and cr360_authz.is_verified_guardian_of(p_student_code)
   order by a.awarded_on desc
$$;

revoke all on function public.cr360_achievement_propose(uuid, text, text, text, text, date, text) from public, anon;
revoke all on function public.cr360_achievement_decide(uuid, text, text) from public, anon;
revoke all on function public.cr360_guardian_achievements(text) from public, anon;
grant execute on function public.cr360_achievement_propose(uuid, text, text, text, text, date, text) to authenticated;
grant execute on function public.cr360_achievement_decide(uuid, text, text) to authenticated;
grant execute on function public.cr360_guardian_achievements(text) to authenticated;
commit;
