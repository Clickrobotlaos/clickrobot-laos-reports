-- =====================================================================================
-- PROPOSED — NOT APPLIED. Requires CEO approval. Apply after 0004 (audit table).
-- Rollback: 0008_shift_planner.rollback.sql
--
-- The deployed v0.4 table public.cr360_hr_shifts has no write path at all (no INSERT/UPDATE grant), so
-- shifts can only be created in the SQL editor and StaffOS attendance % stays empty. This adds two
-- audited functions for CEO / HR (org-wide) or the employee's branch manager:
--   * cr360_hr_create_shift(employee, starts_at, ends_at)
--       - employee must be active and in a branch the caller can access
--       - ends > starts, length 15 min … 16 h
--       - not starting in the past (no back-dated shifts that would fabricate attendance %)
--       - no overlap with the employee's other scheduled/completed shifts (serialised per employee)
--   * cr360_hr_cancel_shift(shift, reason) — status 'cancelled'; history kept; past shifts can't be cancelled
-- Times are timestamptz; the UI converts Asia/Vientiane (UTC+7, no DST) wall-clock input.
-- =====================================================================================
begin;

create or replace function public.cr360_hr_create_shift(p_employee uuid, p_starts timestamptz, p_ends timestamptz)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_branch uuid; v_status text; v_id uuid;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_starts is null or p_ends is null or p_ends <= p_starts then raise exception 'invalid time range' using errcode = '22023'; end if;
  if p_ends - p_starts < interval '15 minutes' or p_ends - p_starts > interval '16 hours' then
    raise exception 'shift length must be 15 minutes to 16 hours' using errcode = '22023';
  end if;
  if p_starts < now() - interval '5 minutes' then raise exception 'shift starts in the past' using errcode = '22023'; end if;

  select branch_id, employment_status into v_branch, v_status from public.cr360_hr_employees where id = p_employee;
  if v_branch is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if (cr360_authz.can_access_branch(v_branch) and cr360_authz.has_role(array['ceo','hr','manager'])) is not true then
    raise exception 'access denied' using errcode = '42501';
  end if;
  if v_status <> 'active' then raise exception 'employee not active' using errcode = '22023'; end if;

  -- Serialise per employee so two managers can't create overlapping shifts concurrently.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cr360_shift:' || p_employee::text, 0));
  if exists (
    select 1 from public.cr360_hr_shifts s
    where s.employee_id = p_employee and s.status <> 'cancelled'
      and s.starts_at < p_ends and p_starts < s.ends_at
  ) then raise exception 'overlaps an existing shift' using errcode = '23P01'; end if;

  insert into public.cr360_hr_shifts (employee_id, branch_id, starts_at, ends_at)
  values (p_employee, v_branch, p_starts, p_ends) returning id into v_id;
  insert into cr360_vault.audit_events (actor, action, entity, entity_id, branch_id, after)
  values (v_user, 'shift.created', 'cr360_hr_shifts', v_id, v_branch,
          jsonb_build_object('employee_id', p_employee, 'starts_at', p_starts, 'ends_at', p_ends));
  return v_id;
end $$;

create or replace function public.cr360_hr_cancel_shift(p_shift uuid, p_reason text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_branch uuid; v_status text; v_starts timestamptz;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'reason required' using errcode = '22023'; end if;
  select branch_id, status, starts_at into v_branch, v_status, v_starts from public.cr360_hr_shifts where id = p_shift for update;
  if v_branch is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if (cr360_authz.can_access_branch(v_branch) and cr360_authz.has_role(array['ceo','hr','manager'])) is not true then
    raise exception 'access denied' using errcode = '42501';
  end if;
  if v_status = 'cancelled' then return; end if; -- idempotent
  if v_starts < now() then raise exception 'cannot cancel a shift that has started' using errcode = '22023'; end if;
  update public.cr360_hr_shifts set status = 'cancelled' where id = p_shift;
  insert into cr360_vault.audit_events (actor, action, entity, entity_id, branch_id, reason)
  values (v_user, 'shift.cancelled', 'cr360_hr_shifts', p_shift, v_branch, p_reason);
end $$;

revoke all on function public.cr360_hr_create_shift(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.cr360_hr_cancel_shift(uuid, text) from public, anon;
grant execute on function public.cr360_hr_create_shift(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.cr360_hr_cancel_shift(uuid, text) to authenticated;

commit;
