-- =====================================================================================
-- PROPOSED — NOT APPLIED. Requires CEO approval. Apply AFTER 0019. Staging first.
-- Rollback: 0022_budgets.rollback.sql
--
-- Monthly budgets per branch and expense category (CEO sets; managers view their branch).
--  * Report: budget vs actual (legacy expense_records, LAK) vs committed (approved, unpaid requests).
--  * Control: replaces 0019's over_budget hook, so a branch manager cannot approve a request that would
--    take a category over its budget for that month; the CEO still can. No budget set = no control.
--  * Every change is audited (before/after). Salary is excluded (payroll is confidential).
-- DATA IMPACT: one new table; no existing rows change.
-- =====================================================================================
begin;

create table if not exists public.cr360_budgets (
  branch_id uuid not null references public.branches(id),
  month date not null check (extract(day from month) = 1),
  category text not null check (category in ('Rent','Marketing','Equipment','Utilities','Transportation','Stationery','Event Cost','Maintenance','Other')),
  amount_lak numeric(15,2) not null check (amount_lak >= 0),
  set_by uuid not null, set_at timestamptz not null default now(),
  primary key (branch_id, month, category)
);
alter table public.cr360_budgets enable row level security;
revoke all on public.cr360_budgets from anon, authenticated;
grant select on public.cr360_budgets to authenticated;
drop policy if exists cr360_budgets_read on public.cr360_budgets;
create policy cr360_budgets_read on public.cr360_budgets for select to authenticated using (cr360_authz.can_see_branch_finance(branch_id));

create or replace function public.cr360_budget_set(p_branch uuid, p_month date, p_category text, p_amount numeric) returns numeric
language plpgsql security definer set search_path = '' as $$
declare v_before numeric; v_month date := date_trunc('month', p_month)::date;
begin
  if coalesce(cr360_authz.has_role(array['ceo']), false) is not true then raise exception 'access denied' using errcode = '42501'; end if;
  if p_amount is null or p_amount < 0 or p_amount > 10000000000 then raise exception 'invalid amount' using errcode = '22023'; end if;
  select amount_lak into v_before from public.cr360_budgets where branch_id = p_branch and month = v_month and category = p_category;
  insert into public.cr360_budgets (branch_id, month, category, amount_lak, set_by) values (p_branch, v_month, p_category, p_amount, auth.uid())
  on conflict (branch_id, month, category) do update set amount_lak = excluded.amount_lak, set_by = excluded.set_by, set_at = now();
  insert into cr360_vault.audit_events (actor, action, entity, entity_id, branch_id, before, after)
  values (auth.uid(), 'finance.budget.set', 'cr360_budgets', p_branch, p_branch,
          jsonb_build_object('month', v_month, 'category', p_category, 'amount_lak', v_before),
          jsonb_build_object('month', v_month, 'category', p_category, 'amount_lak', p_amount));
  return p_amount;
end $$;

create or replace function cr360_authz.month_spend(p_branch uuid, p_category text, p_month date) returns table (actual numeric, committed numeric)
language sql stable security definer set search_path = '' as $$
  select
    coalesce((select sum(e.amount_lak) from public.expense_records e
              where e.branch_id = p_branch and e.category = p_category and date_trunc('month', e.date)::date = p_month), 0),
    coalesce((select sum(r.amount_lak) from public.cr360_expense_requests r
              where r.branch_id = p_branch and r.category = p_category and r.status = 'approved'
                and date_trunc('month', r.created_at at time zone 'Asia/Vientiane')::date = p_month), 0)
$$;
revoke all on function cr360_authz.month_spend(uuid, text, date) from public, anon, authenticated;

-- The real check behind 0019's hook.
create or replace function cr360_authz.over_budget(p_branch uuid, p_category text, p_month date, p_extra_lak numeric) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select s.actual + s.committed + p_extra_lak > b.amount_lak
      from public.cr360_budgets b, cr360_authz.month_spend(p_branch, p_category, p_month) s
     where b.branch_id = p_branch and b.month = p_month and b.category = p_category), false)
$$;

create or replace function public.cr360_budget_report(p_branch uuid, p_month date)
returns table (category text, budget_lak numeric, actual_lak numeric, committed_lak numeric, remaining_lak numeric)
language sql stable security definer set search_path = '' as $$
  select c.cat, b.amount_lak, s.actual, s.committed, case when b.amount_lak is null then null else b.amount_lak - s.actual - s.committed end
    from unnest(array['Rent','Marketing','Equipment','Utilities','Transportation','Stationery','Event Cost','Maintenance','Other']) as c(cat)
    left join public.cr360_budgets b on b.branch_id = p_branch and b.month = date_trunc('month', p_month)::date and b.category = c.cat
    cross join lateral cr360_authz.month_spend(p_branch, c.cat, date_trunc('month', p_month)::date) s
   where cr360_authz.can_see_branch_finance(p_branch)
$$;

revoke all on function public.cr360_budget_set(uuid, date, text, numeric) from public, anon;
revoke all on function public.cr360_budget_report(uuid, date) from public, anon;
grant execute on function public.cr360_budget_set(uuid, date, text, numeric) to authenticated;
grant execute on function public.cr360_budget_report(uuid, date) to authenticated;
commit;
