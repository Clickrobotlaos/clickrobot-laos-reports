-- =====================================================================================
-- PROPOSED — NOT APPLIED. Requires CEO approval. Staging first.
-- Rollback: 0004_hr_decisions_and_audit.rollback.sql
--
-- Adds the audited approve/reject path for the deployed v0.4 HR request tables
-- (leave / OT / correction), which currently have NO update path at all.
--  - Reviewer must be CEO/HR (org-wide) or the manager of the request's branch.
--  - Self-approval is impossible (reviewer's own employee row is rejected).
--  - Only pending -> approved|rejected; optimistic concurrency via expected status.
--  - Every decision writes an append-only audit event.
--  - Approving OT/leave never touches money; payroll reads approved rows later.
-- =====================================================================================
begin;

create table if not exists cr360_vault.audit_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid not null,
  action text not null,
  entity text not null,
  entity_id uuid not null,
  branch_id uuid,
  before jsonb,
  after jsonb,
  reason text
);
alter table cr360_vault.audit_events enable row level security;
revoke all on cr360_vault.audit_events from public, anon, authenticated;

create or replace function cr360_vault.audit_no_mutation() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'audit log is append-only' using errcode = '42501'; end; $$;
drop trigger if exists audit_events_immutable on cr360_vault.audit_events;
create trigger audit_events_immutable before update or delete on cr360_vault.audit_events
  for each row execute function cr360_vault.audit_no_mutation();

create or replace function public.cr360_hr_decide_request(
  p_kind text, p_id uuid, p_action text, p_reason text default null
) returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_tbl text;
  v_emp uuid; v_branch uuid; v_status text; v_owner uuid;
  v_new text;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_action not in ('approve', 'reject') then raise exception 'invalid action' using errcode = '22023'; end if;
  if p_action = 'reject' and (p_reason is null or length(trim(p_reason)) < 3) then
    raise exception 'reason required' using errcode = '22023';
  end if;
  v_tbl := case p_kind when 'leave' then 'cr360_hr_leave_requests' when 'ot' then 'cr360_hr_ot_requests'
                       when 'correction' then 'cr360_hr_correction_requests' end;
  if v_tbl is null then raise exception 'invalid kind' using errcode = '22023'; end if;

  execute format('select employee_id, branch_id, status from public.%I where id = $1 for update', v_tbl)
    into v_emp, v_branch, v_status using p_id;
  if v_emp is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if cr360_authz.can_access_branch(v_branch) is not true then raise exception 'access denied' using errcode = '42501'; end if;

  select auth_user_id into v_owner from public.cr360_hr_employees where id = v_emp;
  if v_owner = v_user then raise exception 'cannot decide own request' using errcode = '42501'; end if;
  if v_status <> 'pending' then raise exception 'already decided' using errcode = '40001'; end if;

  v_new := case p_action when 'approve' then 'approved' else 'rejected' end;
  execute format('update public.%I set status = $1, reviewed_by = $2, reviewed_at = now() where id = $3', v_tbl)
    using v_new, v_user, p_id;

  insert into cr360_vault.audit_events (actor, action, entity, entity_id, branch_id, before, after, reason)
  values (v_user, 'hr.request.' || p_action, v_tbl, p_id, v_branch,
          jsonb_build_object('status', v_status), jsonb_build_object('status', v_new), p_reason);
  return v_new;
end;
$$;
revoke all on function public.cr360_hr_decide_request(text, uuid, text, text) from public, anon;
grant execute on function public.cr360_hr_decide_request(text, uuid, text, text) to authenticated;

commit;
