-- Rollback for 0012: restores the v0.4 membership checks (membership.active only) and drops the
-- lifecycle functions. Status values and audit rows written by them are kept.
begin;
do $$ begin
  if exists (select 1 from public.users where status = 'Suspended') then
    raise exception 'rollback refused: suspended users exist; reinstate or terminate them first';
  end if;
end $$;
alter table public.users drop constraint if exists users_status_check;
alter table public.users add constraint users_status_check check (status = any (array['Active', 'On leave', 'Terminated']));
drop function if exists public.cr360_staff_suspend(uuid, text);
drop function if exists public.cr360_staff_reinstate(uuid, text, date);
drop function if exists public.cr360_staff_offboard(uuid, date, text);
drop function if exists public.cr360_staff_close_ended();
drop function if exists cr360_authz.employment_snapshot(uuid);
drop function if exists cr360_authz.require_ceo();
create or replace function cr360_authz.has_role(p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.cr360_hr_memberships m
    where m.user_id = (select auth.uid()) and m.active and m.role = any(p_roles));
$$;
create or replace function cr360_authz.can_access_branch(p_branch uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.cr360_hr_memberships m
    where m.user_id = (select auth.uid()) and m.active
      and (m.role in ('ceo','hr') or (m.role = 'manager' and m.branch_id = p_branch)));
$$;
create or replace function cr360_authz.active_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.cr360_hr_memberships m where m.user_id = (select auth.uid()) and m.active);
$$;
drop function if exists cr360_authz.member_employment_ok(uuid);
commit;
