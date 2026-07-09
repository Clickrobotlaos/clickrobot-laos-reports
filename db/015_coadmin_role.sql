-- =====================================================================
-- Co-Admin (Operations Manager+) role for Douangmany
-- Can do everything except: delete records, reset data, close months
-- Cannot see: net profit, monthly report, CEO salary
-- =====================================================================

-- Allow the new role name
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role in ('admin','co_admin','manager','finance','staff','viewer','contractor'));

-- ---------------------------------------------------------------------
-- RLS policies for co_admin (write + update, no delete)
-- ---------------------------------------------------------------------

drop policy if exists p_income_ins_coadmin on income_records;
create policy p_income_ins_coadmin on income_records for insert
  with check (my_role() = 'co_admin');
drop policy if exists p_income_upd_coadmin on income_records;
create policy p_income_upd_coadmin on income_records for update
  using (my_role() = 'co_admin');

drop policy if exists p_expense_ins_coadmin on expense_records;
create policy p_expense_ins_coadmin on expense_records for insert
  with check (my_role() = 'co_admin');
drop policy if exists p_expense_upd_coadmin on expense_records;
create policy p_expense_upd_coadmin on expense_records for update
  using (my_role() = 'co_admin');

drop policy if exists p_students_ins_coadmin on student_records;
create policy p_students_ins_coadmin on student_records for insert
  with check (my_role() = 'co_admin');
drop policy if exists p_students_upd_coadmin on student_records;
create policy p_students_upd_coadmin on student_records for update
  using (my_role() = 'co_admin');

drop policy if exists p_reports_all_coadmin on daily_reports;
create policy p_reports_all_coadmin on daily_reports for all
  using (my_role() = 'co_admin') with check (my_role() = 'co_admin');

drop policy if exists p_invoices_ins_coadmin on invoices;
create policy p_invoices_ins_coadmin on invoices for insert
  with check (my_role() = 'co_admin');
drop policy if exists p_invoices_upd_coadmin on invoices;
create policy p_invoices_upd_coadmin on invoices for update
  using (my_role() = 'co_admin');

drop policy if exists p_payroll_ins_coadmin on salary_payroll;
create policy p_payroll_ins_coadmin on salary_payroll for insert
  with check (my_role() = 'co_admin');
drop policy if exists p_payroll_upd_coadmin on salary_payroll;
create policy p_payroll_upd_coadmin on salary_payroll for update
  using (my_role() = 'co_admin');

drop policy if exists p_classes_all_coadmin on classes;
create policy p_classes_all_coadmin on classes for all
  using (my_role() = 'co_admin') with check (my_role() = 'co_admin');

drop policy if exists p_bookings_all_coadmin on class_bookings;
create policy p_bookings_all_coadmin on class_bookings for all
  using (my_role() = 'co_admin') with check (my_role() = 'co_admin');

drop policy if exists p_settings_all_coadmin on settings;
create policy p_settings_all_coadmin on settings for all
  using (my_role() = 'co_admin') with check (my_role() = 'co_admin');

drop policy if exists p_rates_all_coadmin on exchange_rates;
create policy p_rates_all_coadmin on exchange_rates for all
  using (my_role() = 'co_admin') with check (my_role() = 'co_admin');

drop policy if exists p_branches_all_coadmin on branches;
create policy p_branches_all_coadmin on branches for all
  using (my_role() = 'co_admin') with check (my_role() = 'co_admin');

drop policy if exists p_programs_all_coadmin on programs;
create policy p_programs_all_coadmin on programs for all
  using (my_role() = 'co_admin') with check (my_role() = 'co_admin');

drop policy if exists p_wa_all_coadmin on whatsapp_recipients;
create policy p_wa_all_coadmin on whatsapp_recipients for all
  using (my_role() = 'co_admin') with check (my_role() = 'co_admin');

drop policy if exists p_pkg_all_coadmin on student_packages;
create policy p_pkg_all_coadmin on student_packages for all
  using (my_role() = 'co_admin') with check (my_role() = 'co_admin');

drop policy if exists p_att_all_coadmin on attendance;
create policy p_att_all_coadmin on attendance for all
  using (my_role() = 'co_admin') with check (my_role() = 'co_admin');

-- Users: co_admin can INSERT and UPDATE but NOT delete
drop policy if exists p_users_ins_coadmin on users;
create policy p_users_ins_coadmin on users for insert
  with check (my_role() = 'co_admin');
drop policy if exists p_users_upd_coadmin on users;
create policy p_users_upd_coadmin on users for update
  using (my_role() = 'co_admin');
