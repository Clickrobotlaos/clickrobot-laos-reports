-- =====================================================================================
-- PROPOSED — NOT APPLIED. Requires CEO approval. Apply AFTER 0002, 0004 and 0006. Staging first.
-- Rollback: 0012_employment_lifecycle.rollback.sql
--
-- OWNER DECISION A (2026-11-11): access is revoked on the effective termination date or contract
-- expiry; suspension and reinstatement are supported; offboarding is auditable; records are kept.
--
--  * 0006 already makes legacy access (my_role / is_legacy_staff) depend on cr360_authz.employment_ok:
--    status Active/On leave, and today <= end_date and <= contract_end (Asia/Vientiane).
--  * This migration applies the SAME rule to ClickRobot 360 memberships (has_role, can_access_branch,
--    active_member), plus the StaffOS employee status ('suspended' / 'departed' lose access).
--  * Three CEO-only, audited functions: cr360_staff_suspend, cr360_staff_reinstate, cr360_staff_offboard.
--    Nothing is deleted: users, attendance, payslips, contracts and audit rows all stay for management.
--
-- DATA IMPACT: no rows change on apply. Each function call changes only that person's status fields
-- and writes an audit row. Users with neither a legacy users row nor an employee row (e.g. parents)
-- are unaffected by this rule (parents are authorised through 0005 links, not memberships).
-- =====================================================================================
begin;

-- membership holders: a linked legacy users row must pass employment_ok; a linked employee row must
-- not be suspended/departed.
create or replace function cr360_authz.member_employment_ok(p_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_uid is not null
    and (not exists (select 1 from public.users u where u.id = p_uid) or cr360_authz.employment_ok(p_uid))
    and not exists (select 1 from public.cr360_hr_employees e
                    where e.auth_user_id = p_uid and e.employment_status in ('suspended', 'departed'))
$$;
revoke all on function cr360_authz.member_employment_ok(uuid) from public, anon;
grant execute on function cr360_authz.member_employment_ok(uuid) to authenticated;

create or replace function cr360_authz.has_role(p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.cr360_hr_memberships m
    where m.user_id = (select auth.uid()) and m.active and m.role = any(p_roles)
  ) and cr360_authz.member_employment_ok((select auth.uid()));
$$;
create or replace function cr360_authz.can_access_branch(p_branch uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.cr360_hr_memberships m
    where m.user_id = (select auth.uid()) and m.active
      and (m.role in ('ceo','hr') or (m.role = 'manager' and m.branch_id = p_branch))
  ) and cr360_authz.member_employment_ok((select auth.uid()));
$$;
create or replace function cr360_authz.active_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.cr360_hr_memberships m where m.user_id = (select auth.uid()) and m.active
  ) and cr360_authz.member_employment_ok((select auth.uid()));
$$;

-- 0005's student/guardian admin check reads memberships directly: apply the same employment rule.
create or replace function cr360_authz.can_manage_student(p_code text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
     and cr360_authz.member_employment_ok((select auth.uid()))
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

-- 'Suspended' is a new employment status (production CHECK allows Active / On leave / Terminated).
-- Widening the check changes no rows. employment_ok already treats it as "no access".
alter table public.users drop constraint if exists users_status_check;
alter table public.users add constraint users_status_check
  check (status = any (array['Active', 'On leave', 'Suspended', 'Terminated']));

create or replace function cr360_authz.require_ceo() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if (cr360_authz.is_ceo() or cr360_authz.has_role(array['ceo'])) is not true then
    raise exception 'only the CEO can change employment status' using errcode = '42501';
  end if;
  return auth.uid();
end $$;
revoke all on function cr360_authz.require_ceo() from public, anon, authenticated;

create or replace function cr360_authz.employment_snapshot(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'status', u.status, 'active', u.active, 'end_date', u.end_date, 'contract_end', u.contract_end,
    'membership_active', (select m.active from public.cr360_hr_memberships m where m.user_id = p_user),
    'employee_status', (select e.employment_status from public.cr360_hr_employees e where e.auth_user_id = p_user))
  from public.users u where u.id = p_user
$$;
revoke all on function cr360_authz.employment_snapshot(uuid) from public, anon, authenticated;

create or replace function public.cr360_staff_suspend(p_user uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := cr360_authz.require_ceo(); v_before jsonb; v_after jsonb;
begin
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'reason required' using errcode = '22023'; end if;
  if p_user = v_actor then raise exception 'you cannot suspend yourself' using errcode = '22023'; end if;
  v_before := cr360_authz.employment_snapshot(p_user);
  if v_before is null then raise exception 'user not found' using errcode = 'P0002'; end if;
  update public.users set status = 'Suspended', active = false where id = p_user;
  update public.cr360_hr_employees set employment_status = 'suspended' where auth_user_id = p_user and employment_status <> 'departed';
  v_after := cr360_authz.employment_snapshot(p_user);
  insert into cr360_vault.audit_events (actor, action, entity, entity_id, before, after, reason)
  values (v_actor, 'hr.employment.suspend', 'users', p_user, v_before, v_after, trim(p_reason));
  return v_after;
end $$;

create or replace function public.cr360_staff_reinstate(p_user uuid, p_reason text, p_new_contract_end date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := cr360_authz.require_ceo(); v_before jsonb; v_after jsonb;
        v_today date := (now() at time zone 'Asia/Vientiane')::date;
begin
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'reason required' using errcode = '22023'; end if;
  if p_new_contract_end is not null and p_new_contract_end < v_today then
    raise exception 'new contract end is in the past' using errcode = '22023';
  end if;
  v_before := cr360_authz.employment_snapshot(p_user);
  if v_before is null then raise exception 'user not found' using errcode = 'P0002'; end if;
  update public.users
     set status = 'Active', active = true,
         end_date = case when end_date < v_today then null else end_date end,
         contract_end = case when p_new_contract_end is not null then p_new_contract_end
                             when contract_end < v_today then null else contract_end end
   where id = p_user;
  update public.cr360_hr_employees set employment_status = 'active' where auth_user_id = p_user;
  update public.cr360_hr_memberships set active = true where user_id = p_user;
  v_after := cr360_authz.employment_snapshot(p_user);
  insert into cr360_vault.audit_events (actor, action, entity, entity_id, before, after, reason)
  values (v_actor, 'hr.employment.reinstate', 'users', p_user, v_before, v_after, trim(p_reason));
  return v_after;
end $$;

-- Offboarding: p_effective_date = last working day. Access continues through that day and ends
-- automatically after it (employment_ok); if it is today or earlier the status changes at once.
-- Payroll grants are revoked. Nothing is deleted.
create or replace function public.cr360_staff_offboard(p_user uuid, p_effective_date date, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := cr360_authz.require_ceo(); v_before jsonb; v_after jsonb;
        v_today date := (now() at time zone 'Asia/Vientiane')::date;
begin
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'reason required' using errcode = '22023'; end if;
  if p_effective_date is null then raise exception 'effective date required' using errcode = '22023'; end if;
  if p_user = v_actor then raise exception 'you cannot offboard yourself' using errcode = '22023'; end if;
  v_before := cr360_authz.employment_snapshot(p_user);
  if v_before is null then raise exception 'user not found' using errcode = 'P0002'; end if;
  update public.users set end_date = p_effective_date where id = p_user;
  if p_effective_date < v_today then
    update public.users set status = 'Terminated', active = false where id = p_user;
    update public.cr360_hr_employees set employment_status = 'departed' where auth_user_id = p_user;
    update public.cr360_hr_memberships set active = false where user_id = p_user;
  end if;
  update cr360_authz.payroll_grants set revoked_at = now(), revoked_by = v_actor, revoke_reason = 'offboarding: ' || trim(p_reason)
   where user_id = p_user and revoked_at is null;
  v_after := cr360_authz.employment_snapshot(p_user);
  insert into cr360_vault.audit_events (actor, action, entity, entity_id, before, after, reason)
  values (v_actor, 'hr.employment.offboard', 'users', p_user, v_before,
          v_after || jsonb_build_object('effective_date', p_effective_date), trim(p_reason));
  return v_after;
end $$;

-- Daily housekeeping (optional; access already ends by date without it): marks people whose last day
-- has passed as Terminated/departed so lists and reports show it. CEO or SQL editor/scheduler only.
create or replace function public.cr360_staff_close_ended() returns integer
language plpgsql security definer set search_path = '' as $$
declare n int; v_today date := (now() at time zone 'Asia/Vientiane')::date;
begin
  if auth.uid() is not null then perform cr360_authz.require_ceo(); end if;
  with ended as (
    update public.users set status = 'Terminated', active = false
     where end_date < v_today and coalesce(status, 'Active') <> 'Terminated' returning id)
  select count(*) into n from ended;
  update public.cr360_hr_employees e set employment_status = 'departed'
    from public.users u where u.id = e.auth_user_id and u.status = 'Terminated' and e.employment_status <> 'departed';
  update public.cr360_hr_memberships m set active = false
    from public.users u where u.id = m.user_id and u.status = 'Terminated' and m.active;
  return n;
end $$;

revoke all on function public.cr360_staff_suspend(uuid, text) from public, anon;
revoke all on function public.cr360_staff_reinstate(uuid, text, date) from public, anon;
revoke all on function public.cr360_staff_offboard(uuid, date, text) from public, anon;
revoke all on function public.cr360_staff_close_ended() from public, anon;
grant execute on function public.cr360_staff_suspend(uuid, text) to authenticated;
grant execute on function public.cr360_staff_reinstate(uuid, text, date) to authenticated;
grant execute on function public.cr360_staff_offboard(uuid, date, text) to authenticated;
grant execute on function public.cr360_staff_close_ended() to authenticated;

commit;
