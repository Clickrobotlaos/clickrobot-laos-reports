-- =====================================================================
-- Admin edit/delete permissions + deep and nuclear reset support
-- =====================================================================

-- Add DELETE policies for admin on all financial tables.
-- We keep the existing role-based INSERT/UPDATE policies untouched.

-- ---------------------------- income ---------------------------------
drop policy if exists p_income_delete_admin on income_records;
create policy p_income_delete_admin on income_records
  for delete using (my_role() = 'admin');

drop policy if exists p_income_update_admin on income_records;
create policy p_income_update_admin on income_records
  for update using (my_role() = 'admin');

-- ---------------------------- expenses -------------------------------
drop policy if exists p_expense_delete_admin on expense_records;
create policy p_expense_delete_admin on expense_records
  for delete using (my_role() = 'admin');

drop policy if exists p_expense_update_admin on expense_records;
create policy p_expense_update_admin on expense_records
  for update using (my_role() = 'admin');

-- ---------------------------- students -------------------------------
drop policy if exists p_students_delete_admin on student_records;
create policy p_students_delete_admin on student_records
  for delete using (my_role() = 'admin');

drop policy if exists p_students_update_admin on student_records;
create policy p_students_update_admin on student_records
  for update using (my_role() = 'admin');

-- ---------------------------- daily_reports --------------------------
drop policy if exists p_reports_delete_admin on daily_reports;
create policy p_reports_delete_admin on daily_reports
  for delete using (my_role() = 'admin');

-- ---------------------------- invoices -------------------------------
drop policy if exists p_invoices_delete_admin on invoices;
create policy p_invoices_delete_admin on invoices
  for delete using (my_role() = 'admin');

-- ---------------------------- payroll --------------------------------
drop policy if exists p_payroll_delete_admin on salary_payroll;
create policy p_payroll_delete_admin on salary_payroll
  for delete using (my_role() = 'admin');

-- ---------------------------- packages / attendance ------------------
drop policy if exists p_pkg_delete_admin on student_packages;
create policy p_pkg_delete_admin on student_packages
  for delete using (my_role() = 'admin');

drop policy if exists p_att_delete_admin on attendance;
create policy p_att_delete_admin on attendance
  for delete using (my_role() = 'admin');

-- ---------------------------------------------------------------------
-- One catch: the "prevent_edit_approved" trigger blocks even admin updates.
-- We want CEO to be able to fix approved reports if truly needed.
-- Update the trigger so admin CAN edit/delete approved reports.
-- ---------------------------------------------------------------------
create or replace function prevent_edit_approved()
returns trigger language plpgsql as $$
begin
  if old.status = 'Approved' and my_role() <> 'admin' then
    raise exception 'This report is approved and locked. Contact admin to unlock.';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Deep reset: financial data + branches/programs/rates/settings/recipients
-- Keep: users, closed_months (empty since we just deleted rows)
-- ---------------------------------------------------------------------
create or replace function admin_deep_reset() returns text
language plpgsql security definer as $$
begin
  if my_role() <> 'admin' then
    raise exception 'Only admin can perform a deep reset.';
  end if;

  -- financial first (respect FKs)
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

  -- lookup data
  delete from whatsapp_recipients where created_at is not null;
  delete from exchange_rates where created_at is not null;
  delete from programs where created_at is not null;
  delete from branches where created_at is not null;

  -- settings (company info, bank, terms)
  delete from settings;

  return 'Deep reset complete.';
end;
$$;

-- ---------------------------------------------------------------------
-- Nuclear reset: everything from deep reset + other users
-- Keeps: only the caller's own user record.
-- Also removes auth.users rows for other users? NO -- that requires
-- service_role. We just delete from the public.users table which cuts
-- their app access (their login exists but they'll have no role/name).
-- ---------------------------------------------------------------------
create or replace function admin_nuclear_reset() returns text
language plpgsql security definer as $$
declare
  me uuid := auth.uid();
begin
  if my_role() <> 'admin' then
    raise exception 'Only admin can perform a nuclear reset.';
  end if;
  -- do everything deep reset does
  perform admin_deep_reset();
  -- then remove other users (keep me)
  delete from users where id <> me;
  return 'Nuclear reset complete. Only your account remains.';
end;
$$;

grant execute on function admin_deep_reset() to authenticated;
grant execute on function admin_nuclear_reset() to authenticated;
