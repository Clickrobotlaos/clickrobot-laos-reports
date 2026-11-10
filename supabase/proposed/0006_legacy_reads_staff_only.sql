-- =====================================================================================
-- PROPOSED — NOT APPLIED. Requires CEO approval. Apply after 0001–0002 and BEFORE any
-- guardian, partner or school account exists in Supabase Auth. Rollback: 0006_legacy_reads_staff_only.rollback.sql
--
-- P1-6: 24 legacy policies authorise with `auth.uid() IS NOT NULL` — i.e. ANY signed-in account.
-- Today every account is staff, so nothing leaks yet; but the first parent/partner/school login
-- would be able to read every child's packages, attendance, invoices, leads and finance records.
--
-- Change: those policies now require an ACTIVE legacy staff record (a public.users row that is
-- not deactivated / Terminated). Policy names, commands and roles are unchanged (ALTER POLICY).
-- Also: public.my_role() now returns NULL for deactivated / 'Terminated' users. Legacy role-based
-- policies (incl. FOR ALL write policies such as p_pkg_write, which also grant SELECT) all go through
-- my_role(), so a former employee's login loses every legacy permission, not just the reads above.
-- Effect on the existing Records app: none for active staff. BEHAVIOUR CHANGE (intended, owner to
-- confirm): users marked inactive or 'Terminated' lose all access to legacy data.
-- Branch-level scoping for legacy tables is a later step (needs branch memberships for legacy staff).
-- Verified by tests/db harness (baseline leak reproduced; fixed; legacy staff regressions pass).
-- =====================================================================================
begin;

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select role from public.users
  where id = auth.uid() and coalesce(active, true) and coalesce(status, 'Active') <> 'Terminated'
$$;

create or replace function cr360_authz.is_legacy_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and coalesce(u.active, true)
      and coalesce(u.status, 'Active') <> 'Terminated'
  )
$$;
revoke all on function cr360_authz.is_legacy_staff() from public;
-- anon must be able to EXECUTE (returns false): legacy policies target role "public", so anon
-- queries evaluate them; without EXECUTE, anon reads would error instead of returning no rows.
grant usage on schema cr360_authz to anon;
grant execute on function cr360_authz.is_legacy_staff() to anon, authenticated;

alter policy p_branches_read on public.branches using ((select cr360_authz.is_legacy_staff()));
alter policy p_programs_read on public.programs using ((select cr360_authz.is_legacy_staff()));
alter policy p_rates_read on public.exchange_rates using ((select cr360_authz.is_legacy_staff()));
alter policy p_income_read on public.income_records using ((select cr360_authz.is_legacy_staff()));
alter policy p_expense_read on public.expense_records using ((select cr360_authz.is_legacy_staff()));
alter policy p_wa_read on public.whatsapp_logs using ((select cr360_authz.is_legacy_staff()));
alter policy p_students_read on public.student_records using ((select cr360_authz.is_legacy_staff()));
alter policy p_reports_read on public.daily_reports using ((select cr360_authz.is_legacy_staff()));
alter policy p_wa_add on public.whatsapp_logs with check ((select cr360_authz.is_legacy_staff()));
alter policy p_rem_read on public.reminder_logs using ((select cr360_authz.is_legacy_staff()));
alter policy p_invoices_read on public.invoices using ((select cr360_authz.is_legacy_staff()));
alter policy p_settings_read on public.settings using ((select cr360_authz.is_legacy_staff()));
alter policy p_pkg_read on public.student_packages using ((select cr360_authz.is_legacy_staff()));
alter policy p_att_read on public.attendance using ((select cr360_authz.is_legacy_staff()));
alter policy p_closed_read on public.closed_months using ((select cr360_authz.is_legacy_staff()));
alter policy p_classes_read on public.classes using ((select cr360_authz.is_legacy_staff()));
alter policy p_bookings_read on public.class_bookings using ((select cr360_authz.is_legacy_staff()));
alter policy p_delreq_read on public.deletion_requests using ((select cr360_authz.is_legacy_staff()));
alter policy p_leads_read on public.leads using ((select cr360_authz.is_legacy_staff()));
alter policy p_leads_write on public.leads with check ((select cr360_authz.is_legacy_staff()));
alter policy p_leads_update on public.leads using ((select cr360_authz.is_legacy_staff()));
alter policy p_leadact_read on public.lead_activities using ((select cr360_authz.is_legacy_staff()));
alter policy p_leadact_write on public.lead_activities with check ((select cr360_authz.is_legacy_staff()));
alter policy p_leave_read on public.leave_requests using ((select cr360_authz.is_legacy_staff()));

commit;
