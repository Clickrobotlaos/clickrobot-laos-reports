-- =====================================================================================
-- PROPOSED — NOT APPLIED. Requires CEO approval AND a Lao privacy/consent review before any
-- real guardian is invited. Apply after 0001–0004. Rollback: 0005_guardian_links.rollback.sql
--
-- Verified guardian ↔ student links for the parent portal.
--  * Legacy has no students table; a student is identified by student_packages.student_id
--    (text code; all 182 production rows have a unique code as of 2026-11-10). Links attach to
--    that code so they survive package renewals.
--  * A link grants NOTHING until verified (verified_at + verified_by + consent_at), and
--    stops granting immediately when revoked. The child's branch is never authorisation.
--  * Guardians read through one narrow SECURITY DEFINER function returning their own linked
--    children's balance data only — no phone, photo, DOB, tokens or other families.
--  * Links are managed only through audited RPCs by the CEO or the manager of the student's
--    branch (cr360 memberships). No client INSERT/UPDATE/DELETE on the table.
--  * Does not touch legacy rows or the existing token portal (/p/[token]).
-- =====================================================================================
begin;

create table if not exists public.cr360_guardian_links (
  id uuid primary key default gen_random_uuid(),
  guardian_user_id uuid not null references auth.users(id) on delete cascade,
  student_code text not null check (length(trim(student_code)) between 1 and 80),
  relationship text not null default 'guardian' check (relationship in ('mother','father','guardian','grandparent','other')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  verified_by uuid,
  verified_at timestamptz,
  consent_at timestamptz,
  consent_version text,
  revoked_by uuid,
  revoked_at timestamptz,
  revoke_reason text,
  constraint guardian_link_verified_needs_consent check (verified_at is null or (consent_at is not null and verified_by is not null)),
  constraint guardian_link_no_self_verify check (verified_by is null or verified_by <> guardian_user_id)
);
-- One live link per guardian+child; history kept after revocation.
create unique index if not exists cr360_guardian_links_live
  on public.cr360_guardian_links (guardian_user_id, student_code) where revoked_at is null;

alter table public.cr360_guardian_links enable row level security;
revoke all on public.cr360_guardian_links from anon, authenticated;
grant select on public.cr360_guardian_links to authenticated;
drop policy if exists cr360_guardian_links_own on public.cr360_guardian_links;
create policy cr360_guardian_links_own on public.cr360_guardian_links for select to authenticated
  using (guardian_user_id = (select auth.uid()));

-- Branches a student code belongs to (via its packages).
create or replace function cr360_authz.student_branches(p_code text)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select distinct p.branch_id from public.student_packages p where p.student_id = p_code and p.branch_id is not null
$$;
revoke all on function cr360_authz.student_branches(text) from public, anon, authenticated;

create or replace function cr360_authz.can_manage_student(p_code text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
     and exists (select 1 from cr360_authz.student_branches(p_code))
     and not exists (
       select 1 from cr360_authz.student_branches(p_code) b
       where not exists (
         select 1 from public.cr360_hr_memberships m
         where m.user_id = (select auth.uid()) and m.active
           and (m.role = 'ceo' or (m.role = 'manager' and m.branch_id = b))
       )
     )
$$;
revoke all on function cr360_authz.can_manage_student(text) from public, anon, authenticated;

-- ---- Management RPCs (audited) ----------------------------------------------------------
create or replace function public.cr360_guardian_link(p_guardian uuid, p_student_code text, p_relationship text default 'guardian')
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_guardian = v_user then raise exception 'cannot link yourself' using errcode = '42501'; end if;
  if not cr360_authz.can_manage_student(p_student_code) then raise exception 'access denied' using errcode = '42501'; end if;
  insert into public.cr360_guardian_links (guardian_user_id, student_code, relationship, created_by)
  values (p_guardian, p_student_code, coalesce(p_relationship, 'guardian'), v_user) returning id into v_id;
  insert into cr360_vault.audit_events (actor, action, entity, entity_id, after)
  values (v_user, 'guardian.link.created', 'cr360_guardian_links', v_id, jsonb_build_object('relationship', p_relationship));
  return v_id;
end $$;

create or replace function public.cr360_guardian_verify(p_link uuid, p_consent_version text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_code text; v_guardian uuid; v_verified timestamptz; v_revoked timestamptz;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_consent_version is null or length(trim(p_consent_version)) = 0 then raise exception 'consent version required' using errcode = '22023'; end if;
  select student_code, guardian_user_id, verified_at, revoked_at into v_code, v_guardian, v_verified, v_revoked
    from public.cr360_guardian_links where id = p_link for update;
  if v_code is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if not cr360_authz.can_manage_student(v_code) then raise exception 'access denied' using errcode = '42501'; end if;
  if v_revoked is not null or v_verified is not null then raise exception 'link not pending' using errcode = '40001'; end if;
  update public.cr360_guardian_links
     set verified_by = v_user, verified_at = now(), consent_at = now(), consent_version = p_consent_version
   where id = p_link;
  insert into cr360_vault.audit_events (actor, action, entity, entity_id, after)
  values (v_user, 'guardian.link.verified', 'cr360_guardian_links', p_link, jsonb_build_object('consent_version', p_consent_version));
end $$;

create or replace function public.cr360_guardian_revoke(p_link uuid, p_reason text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_code text; v_guardian uuid; v_revoked timestamptz;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'reason required' using errcode = '22023'; end if;
  select student_code, guardian_user_id, revoked_at into v_code, v_guardian, v_revoked
    from public.cr360_guardian_links where id = p_link for update;
  if v_code is null then raise exception 'not found' using errcode = 'P0002'; end if;
  -- A guardian may withdraw their own link/consent; otherwise CEO or the student's branch manager.
  if v_guardian <> v_user and not cr360_authz.can_manage_student(v_code) then raise exception 'access denied' using errcode = '42501'; end if;
  if v_revoked is not null then return; end if; -- idempotent
  update public.cr360_guardian_links set revoked_by = v_user, revoked_at = now(), revoke_reason = p_reason where id = p_link;
  insert into cr360_vault.audit_events (actor, action, entity, entity_id, reason)
  values (v_user, 'guardian.link.revoked', 'cr360_guardian_links', p_link, p_reason);
end $$;

-- ---- Guardian read path -----------------------------------------------------------------
-- Return shape may evolve: drop first so re-applying a changed version never fails.
drop function if exists public.cr360_guardian_children();
create function public.cr360_guardian_children()
returns table (student_code text, student_name text, package_id uuid, program_name text, branch_name text,
               package text, sessions_total int, sessions_used int, active boolean, start_date date)
language sql stable security definer set search_path = '' as $$
  select p.student_id, p.student_name, p.id, pr.name, b.name,
         p.package, p.sessions_total, p.sessions_used, p.active, p.start_date
  from public.cr360_guardian_links l
  join public.student_packages p on p.student_id = l.student_code
  left join public.programs pr on pr.id = p.program_id
  left join public.branches b on b.id = p.branch_id
  where l.guardian_user_id = (select auth.uid())
    and l.verified_at is not null and l.consent_at is not null and l.revoked_at is null
  order by p.student_name, p.start_date desc nulls last
$$;

revoke all on function public.cr360_guardian_link(uuid, text, text) from public, anon;
revoke all on function public.cr360_guardian_verify(uuid, text) from public, anon;
revoke all on function public.cr360_guardian_revoke(uuid, text) from public, anon;
revoke all on function public.cr360_guardian_children() from public, anon;
grant execute on function public.cr360_guardian_link(uuid, text, text) to authenticated;
grant execute on function public.cr360_guardian_verify(uuid, text) to authenticated;
grant execute on function public.cr360_guardian_revoke(uuid, text) to authenticated;
grant execute on function public.cr360_guardian_children() to authenticated;

-- Link by e-mail for the manager UI. Links ONLY an existing auth account (never creates one).
-- Note: reveals to an authorised manager whether an e-mail has an account (accepted; staff-only, audited).
create or replace function public.cr360_guardian_link_by_email(p_email text, p_student_code text, p_relationship text default 'guardian')
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_guardian uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not cr360_authz.can_manage_student(p_student_code) then raise exception 'access denied' using errcode = '42501'; end if;
  if p_email is null or position('@' in p_email) < 2 then raise exception 'invalid email' using errcode = '22023'; end if;
  select id into v_guardian from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_guardian is null then raise exception 'no account for this email' using errcode = 'P0002'; end if;
  return public.cr360_guardian_link(v_guardian, p_student_code, p_relationship);
end $$;

-- Links of one student, for the manager UI (CEO or the student's branch manager only).
drop function if exists public.cr360_guardian_links_for(text);
create function public.cr360_guardian_links_for(p_student_code text)
returns table (id uuid, guardian_email text, relationship text, created_at timestamptz,
               verified_at timestamptz, consent_version text, revoked_at timestamptz, revoke_reason text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not cr360_authz.can_manage_student(p_student_code) then raise exception 'access denied' using errcode = '42501'; end if;
  return query
    select l.id, u.email::text, l.relationship, l.created_at, l.verified_at, l.consent_version, l.revoked_at, l.revoke_reason
    from public.cr360_guardian_links l left join auth.users u on u.id = l.guardian_user_id
    where l.student_code = p_student_code
    order by l.revoked_at nulls first, l.created_at desc;
end $$;

revoke all on function public.cr360_guardian_link_by_email(text, text, text) from public, anon;
revoke all on function public.cr360_guardian_links_for(text) from public, anon;
grant execute on function public.cr360_guardian_link_by_email(text, text, text) to authenticated;
grant execute on function public.cr360_guardian_links_for(text) to authenticated;

commit;
