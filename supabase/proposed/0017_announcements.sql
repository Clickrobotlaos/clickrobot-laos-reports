-- =====================================================================================
-- PROPOSED — NOT APPLIED. Requires CEO approval. Apply AFTER 0005 and 0012. Staging first.
-- Rollback: 0017_announcements.rollback.sql
--
-- In-app announcements (Lao/English) for parents and/or staff. NOTHING is sent outside the app
-- (WhatsApp/e-mail need separate owner authorization and notification consent, 0013).
--  * Branch manager: own branch. CEO: any branch or all branches (branch_id NULL).
--  * draft -> published -> withdrawn (kept). Shown only between show_from and show_until.
--  * Parents see published, current items for the branches of their VERIFIED children.
--  * Staff see published, current items for their branch (or all) with audience staff/all.
-- DATA IMPACT: one new table; no existing rows change.
-- =====================================================================================
begin;

create table if not exists public.cr360_announcements (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id),            -- NULL = all branches (CEO only)
  audience text not null check (audience in ('parents', 'staff', 'all')),
  title_en text not null check (length(trim(title_en)) between 2 and 140),
  title_lo text check (title_lo is null or length(title_lo) <= 140),
  body_en text not null check (length(trim(body_en)) between 2 and 2000),
  body_lo text check (body_lo is null or length(body_lo) <= 2000),
  show_from date not null,
  show_until date not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'withdrawn')),
  created_by uuid not null, created_at timestamptz not null default now(),
  published_by uuid, published_at timestamptz,
  withdrawn_by uuid, withdrawn_at timestamptz,
  check (show_until >= show_from and show_until - show_from <= 120)
);
create index if not exists cr360_announcements_live on public.cr360_announcements (status, show_from, show_until);
alter table public.cr360_announcements enable row level security;
revoke all on public.cr360_announcements from anon, authenticated;
grant select on public.cr360_announcements to authenticated;

create or replace function cr360_authz.can_manage_announcement(p_branch uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(cr360_authz.has_role(array['ceo'])
    or (p_branch is not null and cr360_authz.is_branch_manager(p_branch)), false)
$$;
create or replace function cr360_authz.can_read_announcement(p_branch uuid, p_audience text, p_status text, p_from date, p_until date) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(cr360_authz.can_manage_announcement(p_branch)
    or (p_status = 'published' and p_audience in ('staff', 'all')
        and (now() at time zone 'Asia/Vientiane')::date between p_from and p_until
        and cr360_authz.active_member()
        and (p_branch is null or exists (select 1 from public.cr360_hr_memberships m
              where m.user_id = (select auth.uid()) and m.active and (m.branch_id = p_branch or m.role in ('ceo', 'hr'))))), false)
$$;
revoke all on function cr360_authz.can_manage_announcement(uuid) from public, anon;
revoke all on function cr360_authz.can_read_announcement(uuid, text, text, date, date) from public, anon;
grant execute on function cr360_authz.can_manage_announcement(uuid) to authenticated;
grant execute on function cr360_authz.can_read_announcement(uuid, text, text, date, date) to authenticated;

drop policy if exists cr360_announcements_read on public.cr360_announcements;
create policy cr360_announcements_read on public.cr360_announcements for select to authenticated
  using (cr360_authz.can_read_announcement(branch_id, audience, status, show_from, show_until));

create or replace function public.cr360_announcement_save(
  p_id uuid, p_branch uuid, p_audience text, p_title_en text, p_title_lo text, p_body_en text, p_body_lo text, p_from date, p_until date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; a public.cr360_announcements%rowtype;
begin
  if cr360_authz.can_manage_announcement(p_branch) is not true then raise exception 'access denied' using errcode = '42501'; end if;
  if p_audience not in ('parents', 'staff', 'all') then raise exception 'invalid audience' using errcode = '22023'; end if;
  if p_from is null or p_until is null or p_until < p_from or p_until - p_from > 120
     or p_until < (now() at time zone 'Asia/Vientiane')::date then
    raise exception 'invalid dates (max 120 days, not ended)' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.cr360_announcements (branch_id, audience, title_en, title_lo, body_en, body_lo, show_from, show_until, created_by)
    values (p_branch, p_audience, trim(p_title_en), nullif(trim(coalesce(p_title_lo, '')), ''), trim(p_body_en), nullif(trim(coalesce(p_body_lo, '')), ''), p_from, p_until, auth.uid())
    returning id into v_id;
    return v_id;
  end if;
  select * into a from public.cr360_announcements where id = p_id for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if a.status <> 'draft' then raise exception 'only drafts can be edited' using errcode = '22023'; end if;
  if cr360_authz.can_manage_announcement(a.branch_id) is not true then raise exception 'access denied' using errcode = '42501'; end if;
  update public.cr360_announcements set branch_id = p_branch, audience = p_audience, title_en = trim(p_title_en),
    title_lo = nullif(trim(coalesce(p_title_lo, '')), ''), body_en = trim(p_body_en), body_lo = nullif(trim(coalesce(p_body_lo, '')), ''),
    show_from = p_from, show_until = p_until where id = p_id;
  return p_id;
end $$;

create or replace function public.cr360_announcement_status(p_id uuid, p_action text) returns text
language plpgsql security definer set search_path = '' as $$
declare a public.cr360_announcements%rowtype;
begin
  select * into a from public.cr360_announcements where id = p_id for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if cr360_authz.can_manage_announcement(a.branch_id) is not true then raise exception 'access denied' using errcode = '42501'; end if;
  if p_action = 'publish' and a.status = 'draft' then
    update public.cr360_announcements set status = 'published', published_by = auth.uid(), published_at = now() where id = p_id;
  elsif p_action = 'withdraw' and a.status = 'published' then
    update public.cr360_announcements set status = 'withdrawn', withdrawn_by = auth.uid(), withdrawn_at = now() where id = p_id;
  elsif (p_action = 'publish' and a.status = 'published') or (p_action = 'withdraw' and a.status = 'withdrawn') then
    return a.status;
  else raise exception 'invalid action for status %', a.status using errcode = '22023';
  end if;
  insert into cr360_vault.audit_events (actor, action, entity, entity_id, branch_id, before, after)
  values (auth.uid(), 'announcement.' || p_action, 'cr360_announcements', p_id, a.branch_id,
          jsonb_build_object('status', a.status), jsonb_build_object('status', (select status from public.cr360_announcements where id = p_id)));
  return (select status from public.cr360_announcements where id = p_id);
end $$;

-- Parents: current announcements for the branches of any verified child
create or replace function public.cr360_guardian_announcements()
returns table (id uuid, title_en text, title_lo text, body_en text, body_lo text, show_from date, branch_name text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.title_en, a.title_lo, a.body_en, a.body_lo, a.show_from, b.name
    from public.cr360_announcements a
    left join public.branches b on b.id = a.branch_id
   where a.status = 'published' and a.audience in ('parents', 'all')
     and (now() at time zone 'Asia/Vientiane')::date between a.show_from and a.show_until
     and exists (
       select 1 from public.cr360_guardian_links l
       where l.guardian_user_id = (select auth.uid()) and l.verified_at is not null and l.consent_at is not null and l.revoked_at is null
         and (a.branch_id is null or a.branch_id in (select cr360_authz.student_branches(l.student_code))))
   order by a.show_from desc, a.published_at desc
   limit 20
$$;

revoke all on function public.cr360_announcement_save(uuid, uuid, text, text, text, text, text, date, date) from public, anon;
revoke all on function public.cr360_announcement_status(uuid, text) from public, anon;
revoke all on function public.cr360_guardian_announcements() from public, anon;
grant execute on function public.cr360_announcement_save(uuid, uuid, text, text, text, text, text, date, date) to authenticated;
grant execute on function public.cr360_announcement_status(uuid, text) to authenticated;
grant execute on function public.cr360_guardian_announcements() to authenticated;
commit;
