-- =====================================================================================
-- PROPOSED — NOT APPLIED. Requires explicit CEO approval before running on production
-- (project eqafpmxohburlfuysfdv). Run on a staging copy first; take a backup first.
-- Rollback: 0001_p0_hotfix_reset_and_role_escalation.rollback.sql
--
-- Fixes (found by read-only audit 2026-11-10, see docs/cr360/00_AUDIT_AND_BLOCKERS.md):
--  P0-1  public.admin_deep_reset / admin_nuclear_reset are SECURITY DEFINER, EXECUTE granted
--        to anon, and guarded by `if my_role() <> 'admin'`. For anon my_role() is NULL, so the
--        guard is NULL -> not raised -> data wiped. Any holder of the public anon key can call
--        POST /rest/v1/rpc/admin_deep_reset.
--  P0-2  p_users_self_update lets any signed-in user UPDATE their own public.users row with no
--        column restriction -> a staff user can set role='admin' (privilege escalation) or edit
--        their own salary. The "self-edit lock" in app/staff/page.tsx is client-side only.
--  P1    11 functions with mutable search_path (my_role + trigger functions).
--
-- Idempotent. Changes NO rows. Does not alter legacy app behaviour for legitimate admins.
-- =====================================================================================
begin;

-- ---- P0-1: reset RPCs ---------------------------------------------------------------
create or replace function public.admin_deep_reset()
returns text language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or coalesce(public.my_role(), '') <> 'admin' then
    raise exception 'Only admin can perform a deep reset.' using errcode = '42501';
  end if;
  delete from attendance where created_at is not null;
  delete from student_packages where created_at is not null;
  delete from student_records where created_at is not null;
  delete from income_records where created_at is not null;
  delete from invoices where created_at is not null;
  delete from expense_records where created_at is not null;
  delete from salary_payroll where created_at is not null;
  delete from daily_reports where created_at is not null;
  delete from whatsapp_logs where created_at is not null;
  delete from reminder_logs where created_at is not null;
  delete from closed_months where created_at is not null;
  delete from whatsapp_recipients where created_at is not null;
  delete from exchange_rates where created_at is not null;
  delete from programs where created_at is not null;
  delete from branches where created_at is not null;
  delete from settings;
  return 'Deep reset complete.';
end;
$$;

create or replace function public.admin_nuclear_reset()
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid();
begin
  if me is null or coalesce(public.my_role(), '') <> 'admin' then
    raise exception 'Only admin can perform a nuclear reset.' using errcode = '42501';
  end if;
  perform public.admin_deep_reset();
  delete from users where id <> me;
  return 'Nuclear reset complete. Only your account remains.';
end;
$$;

revoke all on function public.admin_deep_reset() from public, anon;
revoke all on function public.admin_nuclear_reset() from public, anon;
grant execute on function public.admin_deep_reset() to authenticated;
grant execute on function public.admin_nuclear_reset() to authenticated;
-- RECOMMENDED follow-up (owner decision): remove these destructive RPCs entirely, or require
-- a second approver + backup confirmation. They are kept here only to avoid breaking Settings.

-- ---- P1: pin search_path (no behaviour change) --------------------------------------
-- my_role() must stay executable by anon: legacy RLS policies (role "public") call it, and
-- revoking would make anon queries such as the invoice share page error out. It returns NULL for anon.
alter function public.my_role() set search_path = public, pg_temp;
alter function public.prevent_edit_approved() set search_path = public, pg_temp;
alter function public.next_invoice_no() set search_path = public, pg_temp;
alter function public.attendance_apply_change() set search_path = public, pg_temp;
alter function public.invoice_paid_create_package() set search_path = public, pg_temp;
alter function public.is_month_closed(date) set search_path = public, pg_temp;
alter function public.prevent_edit_closed_month() set search_path = public, pg_temp;
alter function public.prevent_insert_closed_month() set search_path = public, pg_temp;
alter function public.check_class_capacity() set search_path = public, pg_temp;
-- Signatures verified read-only against production on 2026-11-10 (only is_month_closed takes an argument).

-- ---- P0-2: column guard on public.users ---------------------------------------------
create or replace function public.users_guard_protected_columns()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare caller text := public.my_role();
begin
  -- Server/SQL-editor maintenance (no JWT) is allowed.
  if auth.uid() is null then return new; end if;
  if caller = 'admin' then return new; end if;

  -- Nobody but admin may grant the admin role.
  if new.role = 'admin' and old.role is distinct from 'admin' then
    raise exception 'Only admin can grant the admin role' using errcode = '42501';
  end if;

  -- Self-edits (any non-admin) may not touch role / pay / employment status / branch.
  if old.id = auth.uid() and (
       new.role            is distinct from old.role
    or new.base_salary     is distinct from old.base_salary
    or new.salary_currency is distinct from old.salary_currency
    or new.active          is distinct from old.active
    or new.status          is distinct from old.status
    or new.branch_id       is distinct from old.branch_id
  ) then
    raise exception 'Protected profile fields can only be changed by an administrator' using errcode = '42501';
  end if;

  -- Non-admin, non-co_admin editing someone else is already blocked by RLS; co_admin may edit
  -- others (owner's documented "self-edit lock" behaviour) except granting admin (above).
  return new;
end;
$$;
revoke all on function public.users_guard_protected_columns() from public, anon, authenticated;

drop trigger if exists users_guard_protected_columns on public.users;
create trigger users_guard_protected_columns
  before update on public.users
  for each row execute function public.users_guard_protected_columns();

commit;

-- ---- Verification (run as each test user on STAGING) --------------------------------
-- anon:   select public.admin_deep_reset();                      -- expect: permission denied
-- staff:  update public.users set role='admin' where id=auth.uid();   -- expect: 42501
-- staff:  update public.users set phone='020...' where id=auth.uid(); -- expect: ok (still allowed)
-- admin:  update public.users set role='staff' where id='<other>';    -- expect: ok
