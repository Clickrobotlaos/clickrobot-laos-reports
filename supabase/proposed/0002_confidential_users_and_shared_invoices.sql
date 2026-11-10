-- =====================================================================================
-- PROPOSED — NOT APPLIED. Requires CEO approval. Apply AFTER 0001, on staging first.
-- Rollback: 0002_confidential_users_and_shared_invoices.rollback.sql
--
-- P0-3  p_users_read: any signed-in user can SELECT every column of every public.users row,
--       including base_salary, bank_account_no, id_card, address, date_of_birth.
-- P1-4  p_invoices_public (share_token IS NOT NULL): anon can list EVERY shared invoice
--       (names, phones, amounts) — the token is not actually checked against the request.
--
-- Compatibility (legacy app code already updated in this branch to prefer the new RPCs and
-- fall back to the old queries, so it works before AND after this migration):
--   app/classes/page.tsx  -> rpc staff_directory()        (managers listing teachers)
--   app/i/[token]/page.tsx -> rpc get_shared_invoice(token)
--   lib/app-context.tsx, app/profile -> read own row      (still allowed)
--   app/staff, app/payroll -> admin / co_admin / finance  (still allowed — OWNER DECISION:
--                             should finance keep full users read? see blockers doc)
-- =====================================================================================
begin;

-- ---- P0-3: scope reads of public.users ----------------------------------------------
drop policy if exists p_users_read on public.users;
create policy p_users_read on public.users for select
  using (
    id = auth.uid()
    or public.my_role() = any (array['admin', 'co_admin', 'finance'])
  );

-- Safe directory for everyone else who needs names (class teacher pickers, rosters).
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
-- Signed-in staff keep p_invoices_read. Anonymous access is now ONLY via get_shared_invoice.

commit;

-- Pre-flight on staging: confirm every existing share_token is >= 16 chars, else the
-- length guard above must be relaxed for legacy links:
--   select count(*) filter (where length(share_token) < 16) from public.invoices where share_token is not null;
-- Verification:
--   staff JWT:  select base_salary from public.users where id <> auth.uid();  -- expect 0 rows
--   staff JWT:  select * from public.staff_directory();                       -- names only
--   anon:       select * from public.invoices;                                -- expect 0 rows
--   anon:       select * from public.get_shared_invoice('<real token>');      -- 1 row
