-- Rollback for 0022: restores 0019's "never over budget" hook; budgets table kept.
begin;
create or replace function cr360_authz.over_budget(p_branch uuid, p_category text, p_month date, p_extra_lak numeric) returns boolean
language sql stable security definer set search_path = '' as $$ select false $$;
drop function if exists public.cr360_budget_report(uuid, date);
drop function if exists cr360_authz.month_spend(uuid, text, date);
drop function if exists public.cr360_budget_set(uuid, date, text, numeric);
drop policy if exists cr360_budgets_read on public.cr360_budgets;
commit;
