-- =====================================================================================
-- PROPOSED — NOT APPLIED. Requires CEO approval. Apply after 0001 (REQUIRED: pins search_path of the legacy
-- trigger functions this RPC fires; without it they cannot resolve my_role/is_month_closed), 0004 (audit
-- table) and 0006.
-- Rollback: 0007_atomic_invoice_payment.rollback.sql
--
-- P2-11 (found 2026-11-11): the Records app marks an invoice paid with THREE separate browser calls
-- (app/invoices/InvoiceView.tsx): insert income_records, insert student_records, update invoice to
-- 'Paid' (whose trigger creates the session package). Nothing is atomic and nothing is unique:
--   * a double click / retry inserts the same payment twice into income_records → revenue double-counted
--     (the package trigger de-duplicates; income does not);
--   * if a later step fails (e.g. invoice has no program → package insert fails), the income row stays
--     while the invoice remains unpaid.
-- Read-only check on production 2026-11-11: 0 income rows, 0 paid invoices → no damage yet, and the
-- unique index below can be created without touching data.
--
-- This migration:
--   1. UNIQUE income per invoice (backstop that also protects the legacy 3-call path);
--   2. public.cr360_mark_invoice_paid(invoice, method): the same three writes in ONE transaction under a
--      row lock, idempotent (already Paid → returns the existing income id, writes nothing), with the
--      legacy role rules checked explicitly (SECURITY DEFINER bypasses RLS), closed-month triggers still
--      enforced, and an audit event. Full payment only — the same semantics as the Records app today.
-- No existing rows are modified.
-- =====================================================================================

-- PRE-FLIGHT (must return 0 before applying):
--   select count(*) from (select invoice_id from public.income_records where invoice_id is not null
--                         group by invoice_id having count(*) > 1) d;

begin;

create unique index if not exists income_records_one_per_invoice
  on public.income_records (invoice_id) where invoice_id is not null;

create or replace function public.cr360_mark_invoice_paid(p_invoice uuid, p_method text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_role text := public.my_role();
  inv public.invoices%rowtype;
  v_income uuid;
  v_today date := (now() at time zone 'Asia/Vientiane')::date;
  v_type text;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '28000'; end if;
  -- Same roles the legacy policies allow to insert income and update invoices.
  if v_role is null or v_role not in ('admin', 'co_admin', 'finance', 'staff') then
    raise exception 'access denied' using errcode = '42501';
  end if;
  if p_method is null or p_method not in ('Cash', 'Bank Transfer', 'QR Payment', 'Other') then
    raise exception 'invalid payment method' using errcode = '22023';
  end if;

  select * into inv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;

  -- Idempotent: a second click / retry returns the original result and writes nothing.
  if inv.status = 'Paid' then
    return jsonb_build_object('invoice_id', inv.id, 'income_id', inv.income_id, 'status', 'Paid', 'already_paid', true);
  end if;
  if inv.status = 'Cancelled' then raise exception 'invoice cancelled' using errcode = '22023'; end if;

  -- 1. income (copies the invoice's own amount, currency and rate snapshot, exactly like the Records app)
  insert into public.income_records (
    date, receipt_no, branch_id, received_by, student_name, parent_name, phone, program_id, payment_type,
    package, amount, currency, rate_to_lak, amount_lak, unpaid_lak, payment_method, notes, invoice_id, created_by)
  values (
    v_today, inv.invoice_no, inv.branch_id, v_user, inv.student_name, inv.parent_name, inv.phone, inv.program_id,
    inv.payment_type, inv.package, inv.amount, inv.currency, inv.rate_to_lak, inv.amount_lak, 0, p_method,
    'Auto-created from invoice ' || inv.invoice_no, inv.id, v_user)
  returning id into v_income;

  -- 2. registration record, once per invoice
  if not exists (select 1 from public.student_records where invoice_id = inv.id) then
    v_type := case inv.payment_type when 'Extension' then 'Extension' when 'Trial Fee' then 'Trial' else 'New' end;
    insert into public.student_records (
      date, branch_id, student_name, parent_name, phone, program_id, student_type, package, quantity,
      trial_status, converted, amount, currency, rate_to_lak, amount_lak, notes, invoice_id, created_by)
    values (
      v_today, inv.branch_id, inv.student_name, inv.parent_name, inv.phone, inv.program_id, v_type, inv.package, 1,
      case when v_type = 'Trial' then 'Scheduled' else '-' end, false, inv.amount, inv.currency, inv.rate_to_lak,
      inv.amount_lak, 'Auto-created from invoice ' || inv.invoice_no, inv.id, v_user);
  end if;

  -- 3. mark paid → existing trigger invoice_paid_create_package credits the session package (once)
  update public.invoices
     set status = 'Paid', paid_at = now(), paid_by = v_user, payment_method = p_method, income_id = v_income
   where id = inv.id;

  insert into cr360_vault.audit_events (actor, action, entity, entity_id, branch_id, before, after)
  values (v_user, 'invoice.paid', 'invoices', inv.id, inv.branch_id,
          jsonb_build_object('status', inv.status),
          jsonb_build_object('status', 'Paid', 'income_id', v_income, 'method', p_method, 'amount_lak', inv.amount_lak));

  return jsonb_build_object('invoice_id', inv.id, 'income_id', v_income, 'status', 'Paid', 'already_paid', false);
end $$;

revoke all on function public.cr360_mark_invoice_paid(uuid, text) from public, anon;
grant execute on function public.cr360_mark_invoice_paid(uuid, text) to authenticated;

commit;
