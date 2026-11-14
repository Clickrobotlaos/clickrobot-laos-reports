-- 0022 budgets. CEO ...c0; manager A ...a1; staff A ...a2; finance ...f1; manager B ...b1.
\set QUIET on
begin;
select set_config('t.m', date_trunc('month', (now() at time zone 'Asia/Vientiane'))::date::text, true);
set local role authenticated;
select t.claims('00000000-0000-0000-0000-0000000000a1');
do $$ declare code text; begin
  begin perform public.cr360_budget_set('10000000-0000-0000-0000-00000000000a', current_setting('t.m')::date, 'Equipment', 9e6); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0022 only the CEO sets budgets');
end $$;
select t.claims('00000000-0000-0000-0000-0000000000c0');
select public.cr360_budget_set('10000000-0000-0000-0000-00000000000a', current_setting('t.m')::date, 'Equipment', 1000000);
select public.cr360_set_manager_expense_limit(5000000);
-- 500,000 already spent this month, then a 600,000 request
reset role;
insert into public.expense_records (date, branch_id, category, amount, currency, rate_to_lak, amount_lak, payment_method)
values ((now() at time zone 'Asia/Vientiane')::date, '10000000-0000-0000-0000-00000000000a', 'Equipment', 500000, 'LAK', 1, 500000, 'Cash');
set local role authenticated;
select t.claims('00000000-0000-0000-0000-0000000000a2');
select public.cr360_expense_request('10000000-0000-0000-0000-00000000000a', 'Equipment', 'Motors', null, 600000, 'LAK', null, null) as r1 \gset
select public.cr360_expense_request('10000000-0000-0000-0000-00000000000a', 'Equipment', 'Cables', null, 300000, 'LAK', null, null) as r2 \gset
select set_config('t.r1', :'r1', true), set_config('t.r2', :'r2', true);
select t.claims('00000000-0000-0000-0000-0000000000a1');
select t.ok(public.cr360_expense_decide(current_setting('t.r2')::uuid, 'approve') = 'approved', '0022 within budget: manager approves (500k + 300k <= 1M)');
do $$ declare code text; begin
  begin perform public.cr360_expense_decide(current_setting('t.r1')::uuid, 'approve'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0022 over budget (500k spent + 300k committed + 600k): manager cannot approve');
end $$;
select t.ok((select remaining_lak from public.cr360_budget_report('10000000-0000-0000-0000-00000000000a', current_setting('t.m')::date) where category = 'Equipment') = 200000,
  '0022 report: remaining = budget − actual − committed');
select t.ok((select budget_lak from public.cr360_budget_report('10000000-0000-0000-0000-00000000000a', current_setting('t.m')::date) where category = 'Rent') is null,
  '0022 categories without a budget show no limit');
select t.claims('00000000-0000-0000-0000-0000000000c0');
select t.ok(public.cr360_expense_decide(current_setting('t.r1')::uuid, 'approve') = 'approved', '0022 the CEO can still approve over budget');
select t.claims('00000000-0000-0000-0000-0000000000b1');
select t.ok((select count(*) from public.cr360_budget_report('10000000-0000-0000-0000-00000000000a', current_setting('t.m')::date)) = 0, '0022 other-branch manager sees nothing');
select t.claims('00000000-0000-0000-0000-0000000000a2');
select t.ok((select count(*) from public.cr360_budgets) = 0, '0022 plain staff do not see budgets');
reset role;
select t.ok((select count(*) from cr360_vault.audit_events where action = 'finance.budget.set') = 1, '0022 budget change audited');
rollback;
