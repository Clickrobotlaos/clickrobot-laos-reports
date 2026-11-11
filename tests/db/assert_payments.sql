-- 0007 atomic, idempotent invoice payment. Run after all proposed migrations.
\set QUIET on
-- staff A ...a2 (legacy role staff), CEO ...c0 (admin), guardian ...e1 (no legacy row), former ...d9 (Terminated)

begin;
-- FICTIONAL invoice that can create a package (program + sessions set)
insert into public.invoices (id, invoice_no, date, branch_id, student_name, program_id, package, sessions, payment_type, amount, currency, rate_to_lak, amount_lak, status)
values ('51000000-0000-0000-0000-000000000001', 'TEST-PAY-1', current_date, '10000000-0000-0000-0000-00000000000a', 'TEST Payer Child',
        '70000000-0000-0000-0000-000000000001', '8 sessions', 8, 'New Registration', 50, 'USD', 21950, 1097500, 'Sent');

set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a2');
select (public.cr360_mark_invoice_paid('51000000-0000-0000-0000-000000000001', 'Bank Transfer') ->> 'already_paid')::boolean as first_already \gset
select t.ok(not :'first_already'::boolean, '0007 first payment is processed');
reset role;
select t.ok((select status from public.invoices where id = '51000000-0000-0000-0000-000000000001') = 'Paid', '0007 invoice marked Paid');
select t.ok((select count(*) from public.income_records where invoice_id = '51000000-0000-0000-0000-000000000001') = 1, '0007 exactly one income row');
select t.ok((select amount_lak = 1097500 and currency = 'USD' and rate_to_lak = 21950 from public.income_records where invoice_id = '51000000-0000-0000-0000-000000000001'), '0007 income keeps the invoice amount, currency and rate snapshot');
select t.ok((select count(*) from public.student_records where invoice_id = '51000000-0000-0000-0000-000000000001') = 1, '0007 exactly one registration record');
select t.ok((select count(*) from public.student_packages where invoice_id = '51000000-0000-0000-0000-000000000001' and sessions_total = 8) = 1, '0007 exactly one 8-session package credited');
select t.ok((select income_id is not null and paid_by = '00000000-0000-0000-0000-0000000000a2' from public.invoices where id = '51000000-0000-0000-0000-000000000001'), '0007 invoice links income and records who was paid');

-- retry / double click
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a2');
select t.ok((public.cr360_mark_invoice_paid('51000000-0000-0000-0000-000000000001', 'Cash') ->> 'already_paid')::boolean, '0007 second call is a no-op (already_paid)');
reset role;
select t.ok((select count(*) from public.income_records where invoice_id = '51000000-0000-0000-0000-000000000001') = 1, '0007 still one income row after retry');
select t.ok((select count(*) from public.student_packages where invoice_id = '51000000-0000-0000-0000-000000000001') = 1, '0007 still one package after retry');
select t.ok((select payment_method from public.invoices where id = '51000000-0000-0000-0000-000000000001') = 'Bank Transfer', '0007 retry does not change the recorded method');
select t.ok((select count(*) from cr360_vault.audit_events where action = 'invoice.paid' and entity_id = '51000000-0000-0000-0000-000000000001') = 1, '0007 one audit event');
rollback;

-- atomicity: a failing step leaves NOTHING behind (legacy 3-call flow would leave a stray income row)
begin;
insert into public.invoices (id, invoice_no, date, branch_id, student_name, sessions, amount, currency, rate_to_lak, amount_lak, status)
values ('51000000-0000-0000-0000-000000000002', 'TEST-PAY-2', current_date, '10000000-0000-0000-0000-00000000000a', 'TEST No Program', 8, 100, 'LAK', 1, 100, 'Sent');
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a2');
do $$ declare failed boolean; begin
  begin perform public.cr360_mark_invoice_paid('51000000-0000-0000-0000-000000000002', 'Cash'); failed := false;
  exception when others then failed := true; end;
  perform t.ok(failed, '0007 invoice whose package cannot be created is refused');
end $$;
reset role;
select t.ok((select count(*) from public.income_records where invoice_id = '51000000-0000-0000-0000-000000000002') = 0, '0007 ...and no income row is left behind');
select t.ok((select count(*) from public.student_records where invoice_id = '51000000-0000-0000-0000-000000000002') = 0, '0007 ...and no registration row is left behind');
select t.ok((select status from public.invoices where id = '51000000-0000-0000-0000-000000000002') = 'Sent', '0007 ...and the invoice is unchanged');
rollback;

-- closed month is still enforced for non-admins (legacy trigger fires inside the RPC)
begin;
insert into public.closed_months (month) values (to_char((now() at time zone 'Asia/Vientiane')::date, 'YYYY-MM'));
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a2');
do $$ declare failed boolean; begin
  begin perform public.cr360_mark_invoice_paid('50000000-0000-0000-0000-000000000001', 'Cash'); failed := false;
  exception when others then failed := true; end;
  perform t.ok(failed, '0007 staff cannot record a payment in a closed month');
end $$;
rollback;

-- validation and authorisation
begin;
update public.invoices set status = 'Cancelled' where id = '50000000-0000-0000-0000-000000000002';
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a2');
do $$ declare code text; begin
  begin perform public.cr360_mark_invoice_paid('50000000-0000-0000-0000-000000000002', 'Cash'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', '0007 cancelled invoice cannot be paid');
  begin perform public.cr360_mark_invoice_paid('50000000-0000-0000-0000-000000000001', 'Bitcoin'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', '0007 unknown payment method rejected');
  begin perform public.cr360_mark_invoice_paid('59999999-0000-0000-0000-000000000000', 'Cash'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = 'P0002', '0007 unknown invoice → not found');
end $$;
select t.claims('00000000-0000-0000-0000-0000000000e1');
do $$ declare code text; begin
  begin perform public.cr360_mark_invoice_paid('50000000-0000-0000-0000-000000000001', 'Cash'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0007 non-staff account (parent) cannot record payments');
end $$;
select t.claims('00000000-0000-0000-0000-0000000000d9');
do $$ declare code text; begin
  begin perform public.cr360_mark_invoice_paid('50000000-0000-0000-0000-000000000001', 'Cash'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0007 Terminated former staff cannot record payments');
end $$;
rollback;

begin;
set local role anon; select t.claims(null);
do $$ declare denied boolean; begin
  begin perform public.cr360_mark_invoice_paid('50000000-0000-0000-0000-000000000001', 'Cash'); denied := false;
  exception when insufficient_privilege then denied := true; end;
  perform t.ok(denied, '0007 anon cannot execute payment RPC');
end $$;
rollback;
