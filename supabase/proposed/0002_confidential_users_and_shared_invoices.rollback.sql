-- Rollback for 0002 — restores the previous broad (LEAKY) policies. Emergency use only.
begin;
drop policy if exists p_users_read on public.users;
create policy p_users_read on public.users for select using (auth.uid() is not null);
drop policy if exists p_invoices_public on public.invoices;
create policy p_invoices_public on public.invoices for select using (share_token is not null);
-- The RPCs are harmless to keep (the app falls back automatically); drop if desired:
-- drop function if exists public.staff_directory();
-- drop function if exists public.get_shared_invoice(text);
commit;
