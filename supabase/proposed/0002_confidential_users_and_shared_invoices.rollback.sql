-- Rollback for 0002 — restores the previous broad (LEAKY) policies. Emergency use only.
-- Keeps cr360_authz.payroll_grants (history is never deleted); the grants simply stop mattering.
begin;
drop trigger if exists users_guard_confidential_columns on public.users;
drop function if exists public.users_guard_confidential_columns();
drop policy if exists p_users_read on public.users;
create policy p_users_read on public.users for select using (auth.uid() is not null);
alter policy p_users_upd_coadmin on public.users using (public.my_role() = 'co_admin');
alter policy p_payroll_read on public.salary_payroll using (public.my_role() = any (array['finance', 'admin']));
alter policy p_payroll_write on public.salary_payroll
  using (public.my_role() = any (array['finance', 'admin'])) with check (public.my_role() = any (array['finance', 'admin']));
alter policy p_payroll_ins_coadmin on public.salary_payroll with check (public.my_role() = 'co_admin');
alter policy p_payroll_upd_coadmin on public.salary_payroll using (public.my_role() = 'co_admin');
drop policy if exists p_invoices_public on public.invoices;
create policy p_invoices_public on public.invoices for select using (share_token is not null);
-- The RPCs are harmless to keep (the app falls back automatically).
commit;
