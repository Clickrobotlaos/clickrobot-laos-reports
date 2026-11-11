-- Replica of the four StaffOS "phase 3" migrations applied to PRODUCTION on 2026-11-11 05:05–05:16 UTC
-- (versions 20261111050537, …050714, …050831, …051619), NOT by this repository. Read from
-- supabase_migrations.schema_migrations (read-only). Structure, policies and grants are reproduced
-- verbatim; DATA inserts are omitted (they select real staff by name and real branches), so the
-- harness stays fictional. Keep this file in sync if production changes again.

-- 20261111050537 staffos_phase3_legacy_personnel_privacy_guard
alter table public.users enable row level security;
revoke all on table public.users from anon;
revoke select on table public.users from authenticated;
grant select (id,name,role,branch_id,position,photo_url,status,active,employment_type,workplace) on table public.users to authenticated;
drop policy if exists p_users_read on public.users;
create policy p_users_read on public.users for select to authenticated
  using ((select auth.uid())=id or (public.my_role() in ('admin','co_admin')));
drop policy if exists p_users_self_update on public.users;
revoke all on table public.salary_payroll from anon;

-- 20261111050714 staffos_phase3_all_branch_pilot_readiness (structure only)
create table if not exists public.staffos_branch_shift_templates(
 branch_id uuid primary key references public.branches(id),
 start_local time not null, end_local time not null,
 break_minutes smallint not null default 60 check(break_minutes between 0 and 180),
 late_grace_minutes smallint not null default 5 check(late_grace_minutes between 0 and 60),
 monday_off boolean not null default true, provisional boolean not null default false,
 shift_compliance_review_required boolean not null default true,
 timezone text not null default 'Asia/Vientiane', updated_at timestamptz not null default now());
alter table public.staffos_branch_shift_templates enable row level security;
revoke all on public.staffos_branch_shift_templates from public, anon, authenticated;
grant select on public.staffos_branch_shift_templates to authenticated;
create policy staffos_shift_templates_read on public.staffos_branch_shift_templates for select to authenticated
using (cr360_authz.can_access_branch(branch_id)
 or exists(select 1 from public.cr360_hr_employees e where e.branch_id=staffos_branch_shift_templates.branch_id and e.auth_user_id=(select auth.uid()) and cr360_authz.active_member()));

create table if not exists public.staffos_checkin_attempts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id), employee_id uuid not null,
 branch_id uuid not null references public.branches(id),
 event_kind text not null check(event_kind in('in','out')),
 latitude double precision not null check(latitude between -90 and 90),
 longitude double precision not null check(longitude between -180 and 180),
 accuracy_m numeric(9,2) not null check(accuracy_m between 0 and 100000),
 distance_m numeric(9,2) not null check(distance_m between 0 and 100000),
 gps_within_radius boolean not null default false,
 wifi_status text not null default 'unverified' check(wifi_status in('unverified','verified','unavailable')),
 verification_status text not null default 'needs_review' check(verification_status in('needs_review','approved','rejected')),
 submitted_at timestamptz not null default now(), reviewed_by uuid references auth.users(id), reviewed_at timestamptz, review_note text,
 confirmed_event_id uuid unique references public.cr360_hr_attendance_events(id),
 constraint staffos_attempt_employee_branch foreign key(employee_id,branch_id) references public.cr360_hr_employees(id,branch_id));
alter table public.staffos_checkin_attempts enable row level security;
revoke all on public.staffos_checkin_attempts from public, anon, authenticated;
grant select on public.staffos_checkin_attempts to authenticated;
grant select, insert, update on public.staffos_checkin_attempts to service_role;
create policy staffos_attempts_read on public.staffos_checkin_attempts for select to authenticated
using ((user_id=(select auth.uid()) and cr360_authz.active_member()) or cr360_authz.can_access_branch(branch_id));

drop policy if exists cr360_corrections_self_insert on public.cr360_hr_correction_requests;
create policy cr360_corrections_self_insert on public.cr360_hr_correction_requests for insert to authenticated with check (
 status='pending' and reviewed_by is null and reviewed_at is null and cr360_authz.active_member()
 and exists (select 1 from public.cr360_hr_employees e where e.id=cr360_hr_correction_requests.employee_id
 and e.branch_id=cr360_hr_correction_requests.branch_id and e.auth_user_id=(select auth.uid()) and e.employment_status='active'));
drop policy if exists cr360_leave_self_insert on public.cr360_hr_leave_requests;
create policy cr360_leave_self_insert on public.cr360_hr_leave_requests for insert to authenticated with check (
 status='pending' and reviewed_by is null and reviewed_at is null and cr360_authz.active_member()
 and exists (select 1 from public.cr360_hr_employees e where e.id=cr360_hr_leave_requests.employee_id
 and e.branch_id=cr360_hr_leave_requests.branch_id and e.auth_user_id=(select auth.uid()) and e.employment_status='active'));
drop policy if exists cr360_ot_self_insert on public.cr360_hr_ot_requests;
create policy cr360_ot_self_insert on public.cr360_hr_ot_requests for insert to authenticated with check (
 status='pending' and reviewed_by is null and reviewed_at is null and cr360_authz.active_member()
 and exists (select 1 from public.cr360_hr_employees e where e.id=cr360_hr_ot_requests.employee_id
 and e.branch_id=cr360_hr_ot_requests.branch_id and e.auth_user_id=(select auth.uid()) and e.employment_status='active'));

-- 20261111050831 staffos_phase3_private_pay_and_review_gateway (vault tables + service-role-only RPCs)
create table if not exists cr360_vault.staffos_pay_policy (
 branch_id uuid primary key references public.branches(id),
 cutoff_day smallint not null default 28 check(cutoff_day=28),
 late_grace_min smallint not null default 5 check(late_grace_min between 0 and 60),
 repeated_late_threshold smallint not null default 2 check(repeated_late_threshold=2),
 missed_checkin_threshold smallint not null default 2 check(missed_checkin_threshold=2),
 bonus_punctuality_pct numeric(6,4) not null default 0.03, bonus_punctuality_cap_lak numeric(14,0) not null default 250000,
 bonus_performance_pct numeric(6,4) not null default 0.05, bonus_performance_cap_lak numeric(14,0) not null default 500000,
 policy_approved boolean not null default false, signed_off_by uuid references auth.users(id), signed_off_at timestamptz);
alter table cr360_vault.staffos_pay_policy enable row level security;
revoke all on cr360_vault.staffos_pay_policy from public, anon, authenticated;
create table if not exists cr360_vault.staffos_audit (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null references auth.users(id),
 employee_id uuid not null references public.cr360_hr_employees(id), event_type text not null, amount_lak numeric(14,0),
 reason text not null, created_at timestamptz not null default now());
alter table cr360_vault.staffos_audit enable row level security;
revoke all on cr360_vault.staffos_audit from public, anon, authenticated;
create table if not exists cr360_vault.staffos_verified_bank_days (
 calendar_code text not null default 'LA_STANDARD', day date not null, is_open boolean not null,
 verified_source text not null check(length(trim(verified_source))>0), verified_by uuid references auth.users(id),
 verified_at timestamptz not null default now(), primary key(calendar_code,day));
alter table cr360_vault.staffos_verified_bank_days enable row level security;
revoke all on cr360_vault.staffos_verified_bank_days from public, anon, authenticated;

create or replace function public.staffos_payroll_report(p_branch_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if coalesce((select auth.jwt()->>'role'),'') <> 'service_role' then raise exception 'Private server role required' using errcode='42501'; end if;
 return '[]'::jsonb;  -- body abbreviated in the replica (reads vault contracts/adjustments)
end;$$;
revoke all on function public.staffos_payroll_report(uuid) from public, anon, authenticated;
grant execute on function public.staffos_payroll_report(uuid) to service_role;

-- 20261111051619 staffos_phase3_private_bonus_proposals: service-role-only RPC (signature stub)
create or replace function public.staffos_propose_payroll_adjustment(
 p_actor_id uuid,p_employee_id uuid,p_month date,p_kind text,p_amount numeric,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 if coalesce((select auth.jwt()->>'role'),'') <> 'service_role' then raise exception 'Private server role required' using errcode='42501'; end if;
 return null;
end;$$;
revoke all on function public.staffos_propose_payroll_adjustment(uuid,uuid,date,text,numeric,text) from public, anon, authenticated;
grant execute on function public.staffos_propose_payroll_adjustment(uuid,uuid,date,text,numeric,text) to service_role;
