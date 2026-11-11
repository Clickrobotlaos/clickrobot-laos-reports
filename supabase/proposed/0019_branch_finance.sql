-- =====================================================================================
-- PROPOSED — NOT APPLIED. Requires CEO approval. Apply AFTER 0001, 0004, 0006, 0012. Staging first.
-- Rollback: 0019_branch_finance.rollback.sql
--
-- Branch finance (owner priority 2026-11-11):
--  * Expense requests: a branch staff member or manager requests -> branch manager (up to the limit
--    the CEO sets; default 0 = CEO approves everything) or CEO approves/rejects -> a finance person
--    pays, which writes ONE legacy expense_records row (closed-month rules still apply). Nobody
--    approves their own request; the requester cannot pay it (CEO excepted). 'Salary' is not allowed
--    here (pay stays in confidential payroll). Everything audited; nothing deleted.
--  * Daily cash count per branch: counted cash per currency vs the day's cash in/out from the legacy
--    records. A recount is a new row with a reason (latest wins; history kept).
-- DATA IMPACT: three new tables; expense_records rows are added only when someone pays a request.
-- =====================================================================================
begin;

create table if not exists cr360_authz.finance_settings (key text primary key, value numeric not null, updated_by uuid, updated_at timestamptz default now());
revoke all on cr360_authz.finance_settings from public, anon, authenticated;
insert into cr360_authz.finance_settings (key, value) values ('manager_expense_limit_lak', 0) on conflict (key) do nothing;

create table if not exists public.cr360_expense_requests (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  requested_by uuid not null,
  category text not null check (category in ('Rent','Marketing','Equipment','Utilities','Transportation','Stationery','Event Cost','Maintenance','Other')),
  description text not null check (length(trim(description)) between 3 and 500),
  supplier text check (supplier is null or length(supplier) <= 120),
  amount numeric(15,2) not null check (amount > 0 and amount <= 1000000000),
  currency text not null check (currency in ('LAK','THB','USD')),
  rate_to_lak numeric(12,4) not null check (rate_to_lak > 0),
  amount_lak numeric(15,2) not null,
  needed_by date,
  status text not null default 'pending' check (status in ('pending','approved','rejected','paid','cancelled')),
  decided_by uuid, decided_at timestamptz, decision_note text,
  paid_by uuid, paid_at timestamptz, payment_method text, paid_expense_id uuid unique references public.expense_records(id),
  created_at timestamptz not null default now(),
  check (currency <> 'LAK' or rate_to_lak = 1)
);
create index if not exists cr360_expense_requests_branch on public.cr360_expense_requests (branch_id, status, created_at desc);

create table if not exists public.cr360_cash_counts (
  id bigint generated always as identity primary key,
  branch_id uuid not null references public.branches(id),
  count_date date not null,
  counted jsonb not null,                -- {"LAK": 1250000, "THB": 0, "USD": 20}
  system_cash jsonb not null,            -- cash in - cash out that day, per currency, from legacy records
  note text check (note is null or length(note) <= 300),
  counted_by uuid not null,
  counted_at timestamptz not null default now()
);
create index if not exists cr360_cash_counts_day on public.cr360_cash_counts (branch_id, count_date, id desc);

alter table public.cr360_expense_requests enable row level security;
alter table public.cr360_cash_counts enable row level security;
revoke all on public.cr360_expense_requests, public.cr360_cash_counts from anon, authenticated;
grant select on public.cr360_expense_requests, public.cr360_cash_counts to authenticated;

create or replace function public.cr360_finance_immutable() returns trigger
language plpgsql set search_path = '' as $$ begin raise exception 'finance history cannot be changed or deleted' using errcode = '42501'; end $$;
drop trigger if exists cr360_cash_counts_immutable on public.cr360_cash_counts;
create trigger cr360_cash_counts_immutable before update or delete on public.cr360_cash_counts for each row execute function public.cr360_finance_immutable();
drop trigger if exists cr360_expense_requests_nodelete on public.cr360_expense_requests;
create trigger cr360_expense_requests_nodelete before delete on public.cr360_expense_requests for each row execute function public.cr360_finance_immutable();

-- finance people: legacy finance / admin / co_admin role (employed) or the CEO
create or replace function cr360_authz.is_finance_payer() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() in ('finance','admin','co_admin') or cr360_authz.has_role(array['ceo']), false)
$$;
-- may see a branch's finance requests / counts: CEO, that branch's manager, finance payers; staff see their own requests
create or replace function cr360_authz.can_see_branch_finance(p_branch uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(cr360_authz.is_branch_manager(p_branch) or cr360_authz.is_finance_payer(), false)
$$;
revoke all on function cr360_authz.is_finance_payer() from public, anon;
revoke all on function cr360_authz.can_see_branch_finance(uuid) from public, anon;
grant execute on function cr360_authz.is_finance_payer() to authenticated;
grant execute on function cr360_authz.can_see_branch_finance(uuid) to authenticated;

drop policy if exists cr360_expense_requests_read on public.cr360_expense_requests;
create policy cr360_expense_requests_read on public.cr360_expense_requests for select to authenticated
  using (requested_by = (select auth.uid()) or cr360_authz.can_see_branch_finance(branch_id));
drop policy if exists cr360_cash_counts_read on public.cr360_cash_counts;
create policy cr360_cash_counts_read on public.cr360_cash_counts for select to authenticated
  using (cr360_authz.can_see_branch_finance(branch_id));

create or replace function public.cr360_expense_request(p_branch uuid, p_category text, p_description text, p_supplier text,
  p_amount numeric, p_currency text, p_rate numeric, p_needed_by date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_rate numeric := case when p_currency = 'LAK' then 1 else p_rate end;
begin
  if (cr360_authz.is_branch_manager(p_branch) or exists (
        select 1 from public.cr360_hr_employees e where e.auth_user_id = auth.uid() and e.branch_id = p_branch and e.employment_status = 'active')
      ) is not true or cr360_authz.active_member() is not true then
    raise exception 'access denied' using errcode = '42501';
  end if;
  if p_category = 'Salary' then raise exception 'salary is handled by payroll' using errcode = '22023'; end if;
  if v_rate is null or v_rate <= 0 then raise exception 'exchange rate required' using errcode = '22023'; end if;
  insert into public.cr360_expense_requests (branch_id, requested_by, category, description, supplier, amount, currency, rate_to_lak, amount_lak, needed_by)
  values (p_branch, auth.uid(), p_category, trim(p_description), nullif(trim(coalesce(p_supplier, '')), ''), p_amount, p_currency, v_rate, round(p_amount * v_rate, 2), p_needed_by)
  returning id into v_id;
  return v_id;
end $$;

-- p_action: approve | reject | cancel
create or replace function public.cr360_expense_decide(p_id uuid, p_action text, p_note text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare r public.cr360_expense_requests%rowtype; v_limit numeric; v_ceo boolean := coalesce(cr360_authz.has_role(array['ceo']), false);
begin
  select * into r from public.cr360_expense_requests where id = p_id for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if p_action = 'cancel' then
    if r.requested_by <> auth.uid() then raise exception 'access denied' using errcode = '42501'; end if;
    if r.status = 'cancelled' then return 'cancelled'; end if;
    if r.status <> 'pending' then raise exception 'only pending requests can be cancelled' using errcode = '22023'; end if;
    update public.cr360_expense_requests set status = 'cancelled' where id = p_id;
  elsif p_action in ('approve', 'reject') then
    if r.status = (case p_action when 'approve' then 'approved' else 'rejected' end) then return r.status; end if;
    if r.status <> 'pending' then raise exception 'already decided' using errcode = '22023'; end if;
    if r.requested_by = auth.uid() then raise exception 'you cannot decide your own request' using errcode = '42501'; end if;
    select value into v_limit from cr360_authz.finance_settings where key = 'manager_expense_limit_lak';
    if not (v_ceo or (cr360_authz.is_branch_manager(r.branch_id) and r.amount_lak <= coalesce(v_limit, 0))) then
      raise exception 'needs CEO approval' using errcode = '42501';
    end if;
    if p_action = 'reject' and (p_note is null or length(trim(p_note)) < 3) then raise exception 'reason required' using errcode = '22023'; end if;
    update public.cr360_expense_requests set status = case p_action when 'approve' then 'approved' else 'rejected' end,
      decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), '') where id = p_id;
  else raise exception 'invalid action' using errcode = '22023';
  end if;
  insert into cr360_vault.audit_events (actor, action, entity, entity_id, branch_id, before, after, reason)
  values (auth.uid(), 'finance.expense.' || p_action, 'cr360_expense_requests', p_id, r.branch_id,
          jsonb_build_object('status', r.status, 'amount_lak', r.amount_lak), jsonb_build_object('status', (select status from public.cr360_expense_requests where id = p_id)), p_note);
  return (select status from public.cr360_expense_requests where id = p_id);
end $$;

-- Pay an approved request: one legacy expense row, exactly once (row lock + unique paid_expense_id).
create or replace function public.cr360_expense_pay(p_id uuid, p_method text, p_date date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r public.cr360_expense_requests%rowtype; v_exp uuid; v_today date := (now() at time zone 'Asia/Vientiane')::date;
begin
  select * into r from public.cr360_expense_requests where id = p_id for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if cr360_authz.is_finance_payer() is not true then raise exception 'access denied' using errcode = '42501'; end if;
  if r.status = 'paid' then return r.paid_expense_id; end if;
  if r.status <> 'approved' then raise exception 'request is not approved' using errcode = '22023'; end if;
  if r.requested_by = auth.uid() and coalesce(cr360_authz.has_role(array['ceo']), false) is not true then
    raise exception 'the requester cannot pay their own request' using errcode = '42501';
  end if;
  if p_method not in ('Cash', 'Bank Transfer', 'QR Payment', 'Other') then raise exception 'invalid payment method' using errcode = '22023'; end if;
  if p_date is null or p_date > v_today or p_date < v_today - 31 then raise exception 'invalid payment date' using errcode = '22023'; end if;
  insert into public.expense_records (date, branch_id, paid_by, category, description, amount, currency, rate_to_lak, amount_lak, payment_method, supplier, notes, created_by)
  values (p_date, r.branch_id, auth.uid(), r.category, r.description, r.amount, r.currency, r.rate_to_lak, r.amount_lak, p_method, r.supplier,
          'ClickRobot 360 expense request ' || r.id, auth.uid())
  returning id into v_exp;    -- closed-month trigger on expense_records still applies
  update public.cr360_expense_requests set status = 'paid', paid_by = auth.uid(), paid_at = now(), payment_method = p_method, paid_expense_id = v_exp where id = p_id;
  insert into cr360_vault.audit_events (actor, action, entity, entity_id, branch_id, after)
  values (auth.uid(), 'finance.expense.pay', 'cr360_expense_requests', p_id, r.branch_id, jsonb_build_object('expense_id', v_exp, 'method', p_method, 'amount_lak', r.amount_lak));
  return v_exp;
end $$;

-- System cash for a branch/day: cash income minus cash expenses, per currency (legacy records).
create or replace function cr360_authz.system_cash(p_branch uuid, p_day date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(cur, total), '{}'::jsonb) from (
    select cur, sum(v) as total from (
      select currency as cur, amount as v from public.income_records where branch_id = p_branch and date = p_day and payment_method = 'Cash'
      union all
      select currency, -amount from public.expense_records where branch_id = p_branch and date = p_day and payment_method = 'Cash') x
    group by cur) y
$$;
revoke all on function cr360_authz.system_cash(uuid, date) from public, anon, authenticated;

create or replace function public.cr360_cash_count(p_branch uuid, p_day date, p_counted jsonb, p_note text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint; v_today date := (now() at time zone 'Asia/Vientiane')::date; k text;
begin
  if cr360_authz.can_see_branch_finance(p_branch) is not true then raise exception 'access denied' using errcode = '42501'; end if;
  if p_day is null or p_day > v_today or p_day < v_today - 7 then raise exception 'invalid date' using errcode = '22023'; end if;
  if p_counted is null or jsonb_typeof(p_counted) <> 'object' then raise exception 'counts required' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(p_counted) loop
    if k not in ('LAK','THB','USD') or jsonb_typeof(p_counted -> k) <> 'number' or (p_counted ->> k)::numeric < 0 then
      raise exception 'invalid count for %', k using errcode = '22023';
    end if;
  end loop;
  if exists (select 1 from public.cr360_cash_counts c where c.branch_id = p_branch and c.count_date = p_day)
     and (p_note is null or length(trim(p_note)) < 3) then
    raise exception 'a recount needs a reason' using errcode = '22023';
  end if;
  insert into public.cr360_cash_counts (branch_id, count_date, counted, system_cash, note, counted_by)
  values (p_branch, p_day, p_counted, cr360_authz.system_cash(p_branch, p_day), nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.cr360_set_manager_expense_limit(p_lak numeric) returns numeric
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(cr360_authz.has_role(array['ceo']), false) is not true then raise exception 'access denied' using errcode = '42501'; end if;
  if p_lak is null or p_lak < 0 or p_lak > 100000000 then raise exception 'invalid limit' using errcode = '22023'; end if;
  update cr360_authz.finance_settings set value = p_lak, updated_by = auth.uid(), updated_at = now() where key = 'manager_expense_limit_lak';
  insert into cr360_vault.audit_events (actor, action, entity, entity_id, after)
  values (auth.uid(), 'finance.settings.manager_expense_limit', 'finance_settings', auth.uid(), jsonb_build_object('lak', p_lak));
  return p_lak;
end $$;
create or replace function public.cr360_manager_expense_limit() returns numeric
language sql stable security definer set search_path = '' as $$
  select value from cr360_authz.finance_settings where key = 'manager_expense_limit_lak' and cr360_authz.active_member()
$$;

revoke all on function public.cr360_expense_request(uuid, text, text, text, numeric, text, numeric, date) from public, anon;
revoke all on function public.cr360_expense_decide(uuid, text, text) from public, anon;
revoke all on function public.cr360_expense_pay(uuid, text, date) from public, anon;
revoke all on function public.cr360_cash_count(uuid, date, jsonb, text) from public, anon;
revoke all on function public.cr360_set_manager_expense_limit(numeric) from public, anon;
revoke all on function public.cr360_manager_expense_limit() from public, anon;
grant execute on function public.cr360_expense_request(uuid, text, text, text, numeric, text, numeric, date) to authenticated;
grant execute on function public.cr360_expense_decide(uuid, text, text) to authenticated;
grant execute on function public.cr360_expense_pay(uuid, text, date) to authenticated;
grant execute on function public.cr360_cash_count(uuid, date, jsonb, text) to authenticated;
grant execute on function public.cr360_set_manager_expense_limit(numeric) to authenticated;
grant execute on function public.cr360_manager_expense_limit() to authenticated;
commit;
