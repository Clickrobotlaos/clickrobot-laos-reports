-- =====================================================================================
-- PROPOSED — NOT APPLIED. Requires CEO approval. Apply AFTER 0001, on staging first.
-- Rollback: 0002_confidential_users_and_shared_invoices.rollback.sql
--
-- P0-3  p_users_read: any signed-in user can SELECT every column of every public.users row,
--       including base_salary, bank_account_no, id_card, address, date_of_birth.
-- P1-4  p_invoices_public (share_token IS NOT NULL): anon can list EVERY shared invoice.
--
-- OWNER DECISION B (2026-11-11) — confidential pay is need-to-know, enforced HERE (not in the UI):
--   CEO (legacy role 'admin')               full payroll + compensation access
--   authorised payroll/HR administrator     only with an explicit, CEO-granted, revocable grant
--                                           (cr360_authz.payroll_grants; full history kept)
--   finance / co_admin / branch manager     NO salary, bank or ID data by default
--   staff                                    own users row + own payslips (salary_payroll) only
--   partners                                 nothing here (separate CEO-authorised finance)
--
-- DATA IMPACT: no rows are changed or deleted. Only who can READ / WRITE changes.
-- BEHAVIOUR CHANGES for the legacy Records app (intended by decision B):
--   * app/staff (list/edit), app/staff/[id], app/payroll: show/edit only what the caller may see.
--     Today's co_admin and finance users lose colleagues' salary rows until the CEO grants them:
--       select public.cr360_grant_payroll_access('<user uuid>', 'payroll processing');   -- as CEO
--   * Dashboards that total salary_payroll (app/page.tsx, reports, monthly-report) show only
--     rows the caller may read (CEO / payroll grant holders see full totals).
--   * Staff now SEE their own payslips in Profile (previously blocked by RLS).
--   Names for pickers keep working through staff_directory() (no pay columns).
-- =====================================================================================
begin;

create schema if not exists cr360_authz;

-- ---- explicit payroll grants (append-only history) ----------------------------------
create table if not exists cr360_authz.payroll_grants (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id),
  reason      text not null check (length(trim(reason)) between 3 and 300),
  granted_by  uuid not null,
  granted_at  timestamptz not null default now(),
  revoked_by  uuid,
  revoked_at  timestamptz,
  revoke_reason text,
  check ((revoked_at is null) = (revoked_by is null))
);
create unique index if not exists payroll_grants_one_active
  on cr360_authz.payroll_grants (user_id) where revoked_at is null;
alter table cr360_authz.payroll_grants enable row level security;
revoke all on cr360_authz.payroll_grants from public, anon, authenticated;

-- Grants are never deleted; only revoked_* may be filled in, once.
create or replace function cr360_authz.payroll_grants_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'payroll grant history is append-only' using errcode = '42501'; end if;
  if old.revoked_at is not null
     or new.user_id <> old.user_id or new.reason <> old.reason
     or new.granted_by <> old.granted_by or new.granted_at <> old.granted_at then
    raise exception 'payroll grant history is append-only' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists payroll_grants_immutable on cr360_authz.payroll_grants;
create trigger payroll_grants_immutable before update or delete on cr360_authz.payroll_grants
  for each row execute function cr360_authz.payroll_grants_immutable();

-- CEO = legacy admin. (0006 later makes my_role() NULL for departed / suspended staff.)
create or replace function cr360_authz.is_ceo() returns boolean
language sql stable security definer set search_path = '' as $$
  -- coalesce: my_role() is NULL for accounts without a legacy row; a NULL here must mean "no",
  -- never "unknown" (the same NULL-guard mistake as P0-1).
  select coalesce((select auth.uid()) is not null and public.my_role() = 'admin', false)
$$;

create or replace function cr360_authz.can_read_confidential_hr() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.uid()) is not null and public.my_role() is not null and (
    public.my_role() = 'admin'
    or exists (select 1 from cr360_authz.payroll_grants g
               where g.user_id = (select auth.uid()) and g.revoked_at is null)
  ), false)
$$;
revoke all on function cr360_authz.is_ceo() from public;
revoke all on function cr360_authz.can_read_confidential_hr() from public;
-- legacy policies target role "public": anon must be able to evaluate (returns false)
grant usage on schema cr360_authz to anon, authenticated;
grant execute on function cr360_authz.is_ceo() to anon, authenticated;
grant execute on function cr360_authz.can_read_confidential_hr() to anon, authenticated;

create or replace function public.cr360_grant_payroll_access(p_user uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if cr360_authz.is_ceo() is not true then raise exception 'only the CEO can grant payroll access' using errcode = '42501'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'reason required' using errcode = '22023'; end if;
  if not exists (select 1 from public.users u where u.id = p_user and coalesce(u.status,'Active') in ('Active','On leave')) then
    raise exception 'user not found or not active' using errcode = 'P0002';
  end if;
  select id into v_id from cr360_authz.payroll_grants where user_id = p_user and revoked_at is null;
  if v_id is not null then return v_id; end if;  -- idempotent
  insert into cr360_authz.payroll_grants (user_id, reason, granted_by)
  values (p_user, trim(p_reason), auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.cr360_revoke_payroll_access(p_user uuid, p_reason text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if cr360_authz.is_ceo() is not true then raise exception 'only the CEO can revoke payroll access' using errcode = '42501'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'reason required' using errcode = '22023'; end if;
  update cr360_authz.payroll_grants set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = trim(p_reason)
   where user_id = p_user and revoked_at is null;
  return found;
end $$;

create or replace function public.cr360_payroll_grants() returns table (
  user_id uuid, name text, reason text, granted_at timestamptz, revoked_at timestamptz, revoke_reason text)
language sql stable security definer set search_path = '' as $$
  select g.user_id, u.name, g.reason, g.granted_at, g.revoked_at, g.revoke_reason
  from cr360_authz.payroll_grants g join public.users u on u.id = g.user_id
  where cr360_authz.is_ceo() order by g.granted_at desc
$$;
revoke all on function public.cr360_grant_payroll_access(uuid, text) from public, anon;
revoke all on function public.cr360_revoke_payroll_access(uuid, text) from public, anon;
revoke all on function public.cr360_payroll_grants() from public, anon;
grant execute on function public.cr360_grant_payroll_access(uuid, text) to authenticated;
grant execute on function public.cr360_revoke_payroll_access(uuid, text) to authenticated;
grant execute on function public.cr360_payroll_grants() to authenticated;

-- ---- P0-3: public.users rows ---------------------------------------------------------
drop policy if exists p_users_read on public.users;
create policy p_users_read on public.users for select to authenticated
  using (id = (select auth.uid()) or (select cr360_authz.can_read_confidential_hr()));

-- Production 2026-11-11 (staffos_phase3_legacy_personnel_privacy_guard) already limits column access:
-- authenticated may SELECT only directory columns of public.users, so NOBODY (not even the CEO) can read
-- salary / bank / ID columns through the API. Decision B still needs CEO, payroll grant holders and the
-- person themselves to read them: this function is that single, audited-by-design path.
create or replace function public.cr360_staff_confidential(p_user uuid default null)
returns setof public.users     -- the full record (pay, bank, ID, contact, contract) for permitted rows only
language sql stable security definer set search_path = '' as $$
  select u.* from public.users u
   where (p_user is null or u.id = p_user)
     and public.my_role() is not null
     and (u.id = (select auth.uid()) or cr360_authz.can_read_confidential_hr())
   order by u.name
$$;
revoke all on function public.cr360_staff_confidential(uuid) from public, anon;
grant execute on function public.cr360_staff_confidential(uuid) to authenticated;

-- co_admin keeps creating/editing staff records but only for rows it may read
-- (UPDATE needs the row to be visible); pay fields are guarded by the trigger below.
alter policy p_users_upd_coadmin on public.users
  using (public.my_role() = 'co_admin' and (select cr360_authz.can_read_confidential_hr()));

-- Confidential columns may only be written by the CEO or a payroll grant holder
-- (self-edits of pay are already blocked by 0001's users_guard_protected_columns).
create or replace function public.users_guard_confidential_columns() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;                 -- SQL editor / maintenance
  if cr360_authz.can_read_confidential_hr() then return new; end if;
  if tg_op = 'INSERT' then
    if new.base_salary is not null or new.bank_account_no is not null or new.bank_name is not null
       or new.id_card is not null then
      raise exception 'salary, bank and ID details need payroll access' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.id <> auth.uid() and (
       new.base_salary is distinct from old.base_salary or new.salary_currency is distinct from old.salary_currency
    or new.bank_account_no is distinct from old.bank_account_no or new.bank_name is distinct from old.bank_name
    or new.id_card is distinct from old.id_card) then
    raise exception 'salary, bank and ID details need payroll access' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.users_guard_confidential_columns() from public, anon, authenticated;
drop trigger if exists users_guard_confidential_columns on public.users;
create trigger users_guard_confidential_columns before insert or update on public.users
  for each row execute function public.users_guard_confidential_columns();

-- Safe directory for everyone who needs names (class teacher pickers, rosters). No pay/ID.
create or replace function public.staff_directory()
returns table (id uuid, name text, "position" text, role text, branch_id uuid, status text, photo_url text)
language sql stable security definer set search_path = public, pg_temp as $$
  select u.id, u.name, u.position, u.role, u.branch_id, u.status, u.photo_url
  from public.users u
  where auth.uid() is not null
    and public.my_role() is not null
    and coalesce(u.status, 'Active') = 'Active'
  order by u.name;
$$;
revoke all on function public.staff_directory() from public, anon;
grant execute on function public.staff_directory() to authenticated;

-- ---- salary_payroll: own payslips + CEO / payroll grant holders ----------------------
alter policy p_payroll_read on public.salary_payroll
  using ((select cr360_authz.can_read_confidential_hr())
         or (public.my_role() is not null and (user_id = auth.uid() or staff_id = auth.uid())));
alter policy p_payroll_write on public.salary_payroll
  using ((select cr360_authz.can_read_confidential_hr()))
  with check ((select cr360_authz.can_read_confidential_hr()));
alter policy p_payroll_ins_coadmin on public.salary_payroll
  with check (public.my_role() = 'co_admin' and (select cr360_authz.can_read_confidential_hr()));
alter policy p_payroll_upd_coadmin on public.salary_payroll
  using (public.my_role() = 'co_admin' and (select cr360_authz.can_read_confidential_hr()));

-- ---- P1-4: exact-token invoice share ------------------------------------------------
create or replace function public.get_shared_invoice(p_token text)
returns setof public.invoices
language sql stable security definer set search_path = public, pg_temp as $$
  select * from public.invoices
  where p_token is not null and length(p_token) >= 16 and share_token = p_token
  limit 1;
$$;
revoke all on function public.get_shared_invoice(text) from public;
grant execute on function public.get_shared_invoice(text) to anon, authenticated;

drop policy if exists p_invoices_public on public.invoices;

commit;

-- Pre-flight (read-only):
--   select count(*) filter (where length(share_token) < 16) from public.invoices where share_token is not null;  -- expect 0
--   select role, count(*) from public.users group by 1;   -- who loses salary visibility (co_admin, finance)
-- Verification (staging):
--   staff JWT:    select base_salary from public.users where id <> auth.uid();      -- 0 rows
--   staff JWT:    select * from public.salary_payroll;                              -- own payslips only
--   finance JWT:  select * from public.salary_payroll;                              -- own payslips only (no grant)
--   CEO JWT:      select public.cr360_grant_payroll_access('<uid>','payroll');      -- then that user sees all
--   anon:         select * from public.invoices;                                    -- 0 rows
