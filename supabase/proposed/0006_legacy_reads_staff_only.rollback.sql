-- Rollback for 0006: restores the previous 'any signed-in account' conditions (LEAKY once non-staff accounts exist).
begin;
-- restore original my_role() body (search_path pinning from 0001 kept)
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select role from users where id = auth.uid()
$$;
alter policy p_branches_read on public.branches using (auth.uid() is not null);
alter policy p_programs_read on public.programs using (auth.uid() is not null);
alter policy p_rates_read on public.exchange_rates using (auth.uid() is not null);
alter policy p_income_read on public.income_records using (auth.uid() is not null);
alter policy p_expense_read on public.expense_records using (auth.uid() is not null);
alter policy p_wa_read on public.whatsapp_logs using (auth.uid() is not null);
alter policy p_students_read on public.student_records using (auth.uid() is not null);
alter policy p_reports_read on public.daily_reports using (auth.uid() is not null);
alter policy p_wa_add on public.whatsapp_logs with check (auth.uid() is not null);
alter policy p_rem_read on public.reminder_logs using (auth.uid() is not null);
alter policy p_invoices_read on public.invoices using (auth.uid() is not null);
alter policy p_settings_read on public.settings using (auth.uid() is not null);
alter policy p_pkg_read on public.student_packages using (auth.uid() is not null);
alter policy p_att_read on public.attendance using (auth.uid() is not null);
alter policy p_closed_read on public.closed_months using (auth.uid() is not null);
alter policy p_classes_read on public.classes using (auth.uid() is not null);
alter policy p_bookings_read on public.class_bookings using (auth.uid() is not null);
alter policy p_delreq_read on public.deletion_requests using (auth.uid() is not null);
alter policy p_leads_read on public.leads using (auth.uid() is not null);
alter policy p_leads_write on public.leads with check (auth.uid() is not null);
alter policy p_leads_update on public.leads using (auth.uid() is not null);
alter policy p_leadact_read on public.lead_activities using (auth.uid() is not null);
alter policy p_leadact_write on public.lead_activities with check (auth.uid() is not null);
alter policy p_leave_read on public.leave_requests using (auth.uid() is not null);
-- Function kept (harmless); drop if desired:
-- drop function if exists cr360_authz.is_legacy_staff();
commit;
