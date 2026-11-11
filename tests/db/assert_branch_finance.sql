-- 0019 branch finance. Staff A ...a2 (employee, branch A); staff A2 ...a3; manager A ...a1 (360 only);
-- finance ...f1 (legacy finance role); CEO ...c0 (legacy admin + 360 ceo).
\set QUIET on
begin;
select set_config('t.d', ((now() at time zone 'Asia/Vientiane')::date)::text, true);
insert into public.income_records (date, branch_id, amount, currency, rate_to_lak, amount_lak, payment_method)
values (current_setting('t.d')::date, '10000000-0000-0000-0000-00000000000a', 1000000, 'LAK', 1, 1000000, 'Cash');
set local role authenticated;

select t.claims('00000000-0000-0000-0000-0000000000a2');
select public.cr360_expense_request('10000000-0000-0000-0000-00000000000a', 'Equipment', 'Spare motors', 'Shop X', 500000, 'LAK', null, null) as r1 \gset
select set_config('t.r1', :'r1', true);
do $$ declare code text; begin
  begin perform public.cr360_expense_request('10000000-0000-0000-0000-00000000000a', 'Salary', 'x pay', null, 1, 'LAK', null, null); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', '0019 salary cannot go through expense requests');
  begin perform public.cr360_expense_request('10000000-0000-0000-0000-00000000000b', 'Rent', 'other branch', null, 1, 'LAK', null, null); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0019 staff cannot request for another branch');
end $$;
select t.claims('00000000-0000-0000-0000-0000000000a3');
select t.ok((select count(*) from public.cr360_expense_requests) = 0, '0019 colleagues do not see someone else''s request');

select t.claims('00000000-0000-0000-0000-0000000000a1');
select t.ok((select count(*) from public.cr360_expense_requests) = 1, '0019 branch manager sees branch requests');
do $$ declare code text; begin
  begin perform public.cr360_expense_decide(current_setting('t.r1')::uuid, 'approve'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0019 with the default limit (0) only the CEO can approve');
end $$;
select t.claims('00000000-0000-0000-0000-0000000000a2');
do $$ declare code text; begin
  begin perform public.cr360_set_manager_expense_limit(9999999); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0019 only the CEO sets the manager limit');
end $$;
select t.claims('00000000-0000-0000-0000-0000000000c0');
select public.cr360_set_manager_expense_limit(1000000);
select t.claims('00000000-0000-0000-0000-0000000000a1');
select t.ok(public.cr360_expense_decide(current_setting('t.r1')::uuid, 'approve') = 'approved', '0019 manager approves within the limit');
select public.cr360_expense_request('10000000-0000-0000-0000-00000000000a', 'Marketing', 'Flyers', null, 200000, 'LAK', null, null) as r2 \gset
select set_config('t.r2', :'r2', true);
do $$ declare code text; begin
  begin perform public.cr360_expense_decide(current_setting('t.r2')::uuid, 'approve'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0019 nobody approves their own request');
end $$;
select public.cr360_expense_request('10000000-0000-0000-0000-00000000000a', 'Rent', 'Big rent', null, 2000000, 'LAK', null, null) as r3 \gset
select t.claims('00000000-0000-0000-0000-0000000000a2');
select public.cr360_expense_request('10000000-0000-0000-0000-00000000000a', 'Equipment', 'Laptop', null, 300, 'USD', 21000, null) as r4 \gset
select set_config('t.r4', :'r4', true);
select t.ok((select amount_lak from public.cr360_expense_requests where id = :'r4') = 6300000, '0019 foreign currency converted with the recorded rate');
select t.claims('00000000-0000-0000-0000-0000000000a1');
do $$ declare code text; begin
  begin perform public.cr360_expense_decide(current_setting('t.r4')::uuid, 'approve'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0019 above the limit needs the CEO');
  begin perform public.cr360_expense_decide(current_setting('t.r4')::uuid, 'reject', ''); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501' or code = '22023', '0019 rejecting needs a reason (and authority)');
end $$;

-- pay
do $$ declare code text; begin
  begin perform public.cr360_expense_pay(current_setting('t.r1')::uuid, 'Cash', current_setting('t.d')::date); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0019 a 360-only manager is not a finance payer');
end $$;
select t.claims('00000000-0000-0000-0000-0000000000f1');
select public.cr360_expense_pay(current_setting('t.r1')::uuid, 'Cash', current_setting('t.d')::date) as e1 \gset
select public.cr360_expense_pay(current_setting('t.r1')::uuid, 'Cash', current_setting('t.d')::date) as e2 \gset
select t.ok(:'e1' = :'e2', '0019 paying twice returns the same expense (exactly once)');
reset role;
select t.ok((select count(*) from public.expense_records where notes like 'ClickRobot 360 expense request%') = 1, '0019 exactly one legacy expense row');
select t.ok((select status from public.cr360_expense_requests where id = current_setting('t.r1')::uuid) = 'paid', '0019 request marked paid');
do $$ declare code text; begin
  begin delete from public.cr360_expense_requests; code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0019 requests cannot be deleted');
end $$;
set local role authenticated;

-- cash count: 1,000,000 cash in - 500,000 cash out = 500,000 LAK system cash
select t.claims('00000000-0000-0000-0000-0000000000a2');
do $$ declare code text; begin
  begin perform public.cr360_cash_count('10000000-0000-0000-0000-00000000000a', current_setting('t.d')::date, '{"LAK": 480000}', null); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0019 plain staff cannot record the cash count');
end $$;
select t.claims('00000000-0000-0000-0000-0000000000a1');
select public.cr360_cash_count('10000000-0000-0000-0000-00000000000a', current_setting('t.d')::date, '{"LAK": 480000}', null);
select t.ok((select (system_cash ->> 'LAK')::numeric from public.cr360_cash_counts order by id desc limit 1) = 500000, '0019 cash count stores the system cash (in - out) for comparison');
do $$ declare code text; begin
  begin perform public.cr360_cash_count('10000000-0000-0000-0000-00000000000a', current_setting('t.d')::date, '{"LAK": 500000}', null); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', '0019 a recount needs a reason');
  begin perform public.cr360_cash_count('10000000-0000-0000-0000-00000000000a', current_setting('t.d')::date, '{"EUR": 5}', 'x y z'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', '0019 only LAK/THB/USD amounts are accepted');
end $$;
select public.cr360_cash_count('10000000-0000-0000-0000-00000000000a', current_setting('t.d')::date, '{"LAK": 500000}', 'found 20,000 in drawer 2');
select t.ok((select count(*) from public.cr360_cash_counts) = 2, '0019 recount kept as history');
select t.claims('00000000-0000-0000-0000-0000000000b1');
select t.ok((select count(*) from public.cr360_cash_counts) = 0 and (select count(*) from public.cr360_expense_requests) = 0, '0019 other-branch manager sees nothing');
rollback;
