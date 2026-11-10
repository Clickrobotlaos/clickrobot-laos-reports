-- Copy of the ALREADY-DEPLOYED v0.4 foundation (migration 20261109184450), for the local harness ONLY.
-- NEVER run against production.
-- ClickRobot StaffOS v0.4: isolated, deny-by-default foundation.
-- LIVE DEPLOYED in Supabase clickrobot-records as migration 20261109184450
-- Reference SQL: do NOT re-run in live database; tracked migration already exists.
-- Does NOT modify legacy public.users, public.salary_payroll or any existing rows.
-- No employee profiles, geofence coordinates, compensation or auth users seeded.
-- Admin bootstrap must be separately performed by an authorized server operator.
-- This migration assumes public.branches(id uuid) exists.

create schema if not exists cr360_authz;
create schema if not exists cr360_vault;
revoke all on schema cr360_authz from public, anon, authenticated;
revoke all on schema cr360_vault from public, anon, authenticated;
grant usage on schema cr360_authz to authenticated;

create table if not exists public.cr360_hr_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('ceo','hr','manager','staff')),
  branch_id uuid references public.branches(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint hr_manager_branch_required check (role <> 'manager' or branch_id is not null)
);
alter table public.cr360_hr_memberships enable row level security;
revoke all on public.cr360_hr_memberships from anon, authenticated;
grant select on public.cr360_hr_memberships to authenticated;

create or replace function cr360_authz.has_role(p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.cr360_hr_memberships m
    where m.user_id = (select auth.uid()) and m.active and m.role = any(p_roles)
  );
$$;
create or replace function cr360_authz.can_access_branch(p_branch uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.cr360_hr_memberships m
    where m.user_id = (select auth.uid()) and m.active
      and (m.role in ('ceo','hr') or (m.role = 'manager' and m.branch_id = p_branch))
  );
$$;
create or replace function cr360_authz.active_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.cr360_hr_memberships m where m.user_id = (select auth.uid()) and m.active
  );
$$;
revoke all on function cr360_authz.has_role(text[]) from public, anon;
revoke all on function cr360_authz.can_access_branch(uuid) from public, anon;
revoke all on function cr360_authz.active_member() from public, anon;
grant execute on function cr360_authz.has_role(text[]) to authenticated;
grant execute on function cr360_authz.can_access_branch(uuid) to authenticated;
grant execute on function cr360_authz.active_member() to authenticated;

create policy cr360_member_read on public.cr360_hr_memberships for select to authenticated
using (user_id = (select auth.uid()) or cr360_authz.has_role(array['ceo','hr']));
-- No client INSERT / UPDATE / DELETE policy on memberships: server provisioning only.

create table if not exists public.cr360_hr_employees (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  branch_id uuid not null references public.branches(id),
  employee_code text unique,
  display_name text not null check (length(trim(display_name)) between 2 and 120),
  position text not null default 'Teacher',
  employment_status text not null default 'active' check (employment_status in ('active','on_leave','suspended','departed')),
  start_date date,
  created_at timestamptz not null default now(),
  unique (id, branch_id)
);
alter table public.cr360_hr_employees enable row level security;
revoke all on public.cr360_hr_employees from anon, authenticated;
grant select on public.cr360_hr_employees to authenticated;
create policy cr360_employees_read on public.cr360_hr_employees for select to authenticated
using ((auth_user_id = (select auth.uid()) and cr360_authz.active_member()) or cr360_authz.can_access_branch(branch_id));
-- Employee provisioning/update stays on audited server endpoints, not browser DML.

create table if not exists public.cr360_hr_shifts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null,
  branch_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','cancelled','completed')),
  created_at timestamptz not null default now(),
  constraint cr360_shift_time_valid check (ends_at > starts_at),
  foreign key (employee_id,branch_id) references public.cr360_hr_employees(id,branch_id)
);
create index if not exists cr360_shifts_employee_date on public.cr360_hr_shifts(employee_id,starts_at);
alter table public.cr360_hr_shifts enable row level security;
revoke all on public.cr360_hr_shifts from anon, authenticated;
grant select on public.cr360_hr_shifts to authenticated;
create policy cr360_shifts_read on public.cr360_hr_shifts for select to authenticated
using (cr360_authz.can_access_branch(branch_id) or exists (
  select 1 from public.cr360_hr_employees e where e.id = employee_id
    and e.auth_user_id = (select auth.uid()) and cr360_authz.active_member()
));
-- Scheduling modifications require an authorized service endpoint with audit.

create table if not exists public.cr360_hr_sites (
  branch_id uuid primary key references public.branches(id),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  radius_m smallint not null default 10 check (radius_m between 1 and 10),
  enabled boolean not null default false,
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.cr360_hr_sites enable row level security;
revoke all on public.cr360_hr_sites from anon, authenticated;
grant select on public.cr360_hr_sites to authenticated;
create policy cr360_sites_managers_read on public.cr360_hr_sites for select to authenticated
using (cr360_authz.can_access_branch(branch_id));
-- Coordinates are never guessed or seeded. Site approval by authenticated admin backend only.

create table if not exists public.cr360_hr_attendance_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null,
  branch_id uuid not null,
  kind text not null check (kind in ('in','out')),
  occurred_at timestamptz not null default now(),
  distance_m numeric(8,2) not null check (distance_m between 0 and 100000),
  reported_accuracy_m numeric(8,2) not null check (reported_accuracy_m between 0 and 100000),
  source text not null default 'browser_gps' check (source in ('browser_gps','reviewed_exception')),
  foreign key(employee_id, branch_id) references public.cr360_hr_employees(id, branch_id)
);
create index if not exists cr360_hr_punch_recent on public.cr360_hr_attendance_events(employee_id,occurred_at desc);
alter table public.cr360_hr_attendance_events enable row level security;
revoke all on public.cr360_hr_attendance_events from anon, authenticated;
grant select on public.cr360_hr_attendance_events to authenticated;
create policy cr360_punches_read on public.cr360_hr_attendance_events for select to authenticated
using (cr360_authz.can_access_branch(branch_id) or exists (
 select 1 from public.cr360_hr_employees e where e.id=employee_id and e.auth_user_id=(select auth.uid()) and cr360_authz.active_member()
));
-- No direct client INSERT or UPDATE: all punches are server timestamped and append-only.

create table if not exists public.cr360_hr_leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null,
  branch_id uuid not null,
  leave_type text not null check (leave_type in ('annual','sick','personal','unpaid','other')),
  start_date date not null,
  end_date date not null,
  reason text not null check (length(trim(reason)) between 3 and 1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  foreign key(employee_id,branch_id) references public.cr360_hr_employees(id,branch_id)
);
alter table public.cr360_hr_leave_requests enable row level security;
revoke all on public.cr360_hr_leave_requests from anon, authenticated;
grant select,insert on public.cr360_hr_leave_requests to authenticated;
create policy cr360_leave_select on public.cr360_hr_leave_requests for select to authenticated
using (cr360_authz.can_access_branch(branch_id) or exists (
 select 1 from public.cr360_hr_employees e where e.id=employee_id and e.auth_user_id=(select auth.uid()) and cr360_authz.active_member()
));
create policy cr360_leave_self_insert on public.cr360_hr_leave_requests for insert to authenticated
with check (status='pending' and reviewed_by is null and reviewed_at is null and exists (
 select 1 from public.cr360_hr_employees e where e.id=employee_id and e.branch_id=branch_id
 and e.auth_user_id=(select auth.uid()) and e.employment_status='active' and cr360_authz.active_member()
));
-- No client UPDATE approval: must go through audited backend.

create table if not exists public.cr360_hr_ot_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null,
  branch_id uuid not null,
  work_date date not null,
  minutes integer not null check (minutes between 15 and 720 and minutes % 15 = 0),
  reason text not null check (length(trim(reason)) between 3 and 1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(employee_id,branch_id) references public.cr360_hr_employees(id,branch_id)
);
alter table public.cr360_hr_ot_requests enable row level security;
revoke all on public.cr360_hr_ot_requests from anon, authenticated;
grant select,insert on public.cr360_hr_ot_requests to authenticated;
create policy cr360_ot_select on public.cr360_hr_ot_requests for select to authenticated
using (cr360_authz.can_access_branch(branch_id) or exists (
 select 1 from public.cr360_hr_employees e where e.id=employee_id and e.auth_user_id=(select auth.uid()) and cr360_authz.active_member()
));
create policy cr360_ot_self_insert on public.cr360_hr_ot_requests for insert to authenticated
with check (status='pending' and reviewed_by is null and reviewed_at is null and exists (
 select 1 from public.cr360_hr_employees e where e.id=employee_id and e.branch_id=branch_id
 and e.auth_user_id=(select auth.uid()) and e.employment_status='active' and cr360_authz.active_member()
));

create table if not exists public.cr360_hr_correction_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null,
  branch_id uuid not null,
  work_date date not null,
  correction_type text not null check (correction_type in ('missed_in','missed_out','gps_unavailable','shift_mismatch','other')),
  reason text not null check (length(trim(reason)) between 3 and 1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(employee_id,branch_id) references public.cr360_hr_employees(id,branch_id)
);
alter table public.cr360_hr_correction_requests enable row level security;
revoke all on public.cr360_hr_correction_requests from anon, authenticated;
grant select,insert on public.cr360_hr_correction_requests to authenticated;
create policy cr360_corrections_select on public.cr360_hr_correction_requests for select to authenticated
using (cr360_authz.can_access_branch(branch_id) or exists (
 select 1 from public.cr360_hr_employees e where e.id=employee_id and e.auth_user_id=(select auth.uid()) and cr360_authz.active_member()
));
create policy cr360_corrections_self_insert on public.cr360_hr_correction_requests for insert to authenticated
with check (status='pending' and reviewed_by is null and reviewed_at is null and exists (
 select 1 from public.cr360_hr_employees e where e.id=employee_id and e.branch_id=branch_id
 and e.auth_user_id=(select auth.uid()) and e.employment_status='active' and cr360_authz.active_member()
));

create table if not exists cr360_vault.contracts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.cr360_hr_employees(id),
  version integer not null default 1 check (version >= 1),
  signed_status text not null default 'draft' check (signed_status in ('draft','pending_signature','signed','ended')),
  starts_on date not null,
  ends_on date,
  monthly_base_lak numeric(15,2) not null default 0 check (monthly_base_lak >= 0),
  overtime_multiplier numeric(5,2) not null default 1.5 check (overtime_multiplier between 1 and 5),
  duties text not null default '',
  created_at timestamptz not null default now(),
  unique(employee_id,version)
);
create table if not exists cr360_vault.payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.cr360_hr_employees(id),
  effective_month date not null,
  adjustment_type text not null check (adjustment_type in ('bonus','allowance','deduction')),
  amount_lak numeric(15,2) not null check (amount_lak > 0),
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','posted')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists cr360_vault.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  payroll_month date not null,
  status text not null default 'draft' check (status in ('draft','review','approved','paid')),
  calculated_at timestamptz,
  reviewed_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  unique(payroll_month)
);
alter table cr360_vault.contracts enable row level security;
alter table cr360_vault.payroll_adjustments enable row level security;
alter table cr360_vault.payroll_runs enable row level security;
revoke all on all tables in schema cr360_vault from public, anon, authenticated;
-- No user-facing RLS policies for private tables. Only audited server-side operations may access them.

-- Narrow authenticated RPC for voluntary check in/out. HTTPS, GPS permission, device attestation,
-- site verification, and manager exception workflows are required before any live use.
create or replace function public.cr360_hr_clock(
 p_employee uuid, p_kind text, p_lat double precision, p_lon double precision, p_accuracy double precision
) returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
 v_user uuid := auth.uid();
 v_branch uuid;
 v_lat double precision;
 v_lon double precision;
 v_radius smallint;
 v_dist double precision;
 v_a double precision;
 v_previous text;
 v_id uuid;
begin
 if v_user is null then raise exception 'authentication required' using errcode='28000'; end if;
 if p_kind not in ('in','out') or p_kind is null then raise exception 'invalid event' using errcode='22023'; end if;
 if not (p_lat between -90 and 90 and p_lon between -180 and 180 and p_accuracy between 0.01 and 10) then
  raise exception 'invalid or insufficient GPS accuracy' using errcode='22023';
 end if;
 select e.branch_id into v_branch from public.cr360_hr_employees e
 join public.cr360_hr_memberships m on m.user_id=v_user and m.active
 and (m.branch_id=e.branch_id or m.role in ('ceo','hr'))
 where e.id=p_employee and e.auth_user_id=v_user and e.employment_status='active';
 if v_branch is null then raise exception 'staff or branch access denied' using errcode='42501'; end if;
 select latitude,longitude,radius_m into v_lat,v_lon,v_radius from public.cr360_hr_sites s
 where s.branch_id=v_branch and s.enabled and s.approved_at is not null;
 if not found then raise exception 'site not approved' using errcode='42501'; end if;
 v_a=power(sin(radians(p_lat-v_lat)/2),2) + cos(radians(v_lat))*cos(radians(p_lat))*power(sin(radians(p_lon-v_lon)/2),2);
 v_dist=2*6371000*atan2(sqrt(least(1,greatest(0,v_a))),sqrt(greatest(0,1-v_a)));
 if v_dist>v_radius then raise exception 'outside designated zone' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cr360_clock:'||p_employee::text,0));
 select kind into v_previous from public.cr360_hr_attendance_events
 where employee_id=p_employee order by occurred_at desc,id desc limit 1;
 if (p_kind='in' and v_previous='in') or (p_kind='out' and (v_previous is distinct from 'in')) then
  raise exception 'check-in/check-out sequence invalid' using errcode='22023';
 end if;
 insert into public.cr360_hr_attendance_events(employee_id,branch_id,kind,distance_m,reported_accuracy_m)
 values (p_employee,v_branch,p_kind,round(v_dist::numeric,2),round(p_accuracy::numeric,2)) returning id into v_id;
 return v_id;
end;
$$;
revoke all on function public.cr360_hr_clock(uuid,text,double precision,double precision,double precision) from public, anon;
grant execute on function public.cr360_hr_clock(uuid,text,double precision,double precision,double precision) to authenticated;
