-- Rollback for 0019: drops functions and policies. Requests, cash counts and any expense_records
-- rows created by payments are KEPT (financial records).
begin;
drop function if exists public.cr360_manager_expense_limit();
drop function if exists public.cr360_set_manager_expense_limit(numeric);
drop function if exists public.cr360_cash_count(uuid, date, jsonb, text);
drop function if exists cr360_authz.system_cash(uuid, date);
drop function if exists public.cr360_expense_pay(uuid, text, date);
drop function if exists public.cr360_expense_decide(uuid, text, text);
drop function if exists cr360_authz.over_budget(uuid, text, date, numeric);
drop function if exists public.cr360_expense_request(uuid, text, text, text, numeric, text, numeric, date);
drop policy if exists cr360_cash_counts_read on public.cr360_cash_counts;
drop policy if exists cr360_expense_requests_read on public.cr360_expense_requests;
drop function if exists cr360_authz.can_see_branch_finance(uuid);
drop function if exists cr360_authz.is_finance_payer();
commit;
