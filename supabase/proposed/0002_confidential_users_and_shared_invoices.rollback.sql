-- Rollback for 0002 — restores the policies as they were in production on 2026-11-11 (before 0002).
-- p_invoices_public (anon lists every shared invoice) is LEAKY. Emergency use only.
-- Keeps cr360_authz.payroll_grants (history is never deleted); the grants simply stop mattering.
begin;
drop trigger if exists users_guard_confidential_columns on public.users;
drop function if exists public.users_guard_confidential_columns();
drop function if exists public.cr360_staff_confidential(uuid);
drop policy if exists p_users_read on public.users;
-- restore the PRODUCTION policy as of 2026-11-11 (staffos_phase3_legacy_personnel_privacy_guard),
-- not the older "any signed-in user" one; column grants from that migration are untouched by 0002.
create policy p_users_read on public.users for select to authenticated
  using ((select auth.uid()) = id or (public.my_role() in ('admin','co_admin')));
alter policy p_users_upd_coadmin on public.users using (public.my_role() = 'co_admin');
alter policy p_payroll_read on public.salary_payroll using (public.my_role() = any (array['finance', 'admin']));  -- anon revoked in prod 2026-11-11 (kept)
alter policy p_payroll_write on public.salary_payroll
  using (public.my_role() = any (array['finance', 'admin'])) with check (public.my_role() = any (array['finance', 'admin']));
alter policy p_payroll_ins_coadmin on public.salary_payroll with check (public.my_role() = 'co_admin');
alter policy p_payroll_upd_coadmin on public.salary_payroll using (public.my_role() = 'co_admin');
drop policy if exists p_invoices_public on public.invoices;
create policy p_invoices_public on public.invoices for select using (share_token is not null);
-- The RPCs are harmless to keep (the app falls back automatically).
commit;
