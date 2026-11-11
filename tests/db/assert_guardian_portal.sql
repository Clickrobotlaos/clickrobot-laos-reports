-- 0014 parent schedule + invoices. G1 ...e1 verified for TST-001 (branch A); G2 ...e2 unrelated.
\set QUIET on
begin;
-- fixtures: package TST-001 bought via invoice TEST-1 (paid); regular class today; makeup in 3 days
update public.invoices set status = 'Paid' where id = '50000000-0000-0000-0000-000000000001';
update public.student_packages set invoice_id = '50000000-0000-0000-0000-000000000001' where id = '30000000-0000-0000-0000-000000000001';
update public.classes set day_of_week = extract(dow from (now() at time zone 'Asia/Vientiane')::date)::int, start_time = '10:00', end_time = '11:00', active = true
 where id = '40000000-0000-0000-0000-000000000001';
insert into public.class_bookings (class_id, package_id, kind, status) values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'regular', 'Confirmed');
insert into public.class_bookings (class_id, package_id, kind, makeup_date, status) values
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'makeup', (now() at time zone 'Asia/Vientiane')::date + 3, 'Confirmed'),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'regular', null, 'Confirmed');

set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a1');
select public.cr360_guardian_link('00000000-0000-0000-0000-0000000000e1', 'TST-001', 'mother') as l1 \gset
select public.cr360_guardian_verify(:'l1', 'consent-test-v1');

select t.claims('00000000-0000-0000-0000-0000000000e1');
select t.ok((select count(*) from public.cr360_guardian_schedule('TST-001') where kind = 'regular') = 2, '0014 parent sees the weekly class on both upcoming dates (14 days)');
select t.ok((select count(*) from public.cr360_guardian_schedule('TST-001') where kind = 'makeup') = 1, '0014 parent sees the makeup class');
select t.ok((select count(*) from public.cr360_guardian_invoices('TST-001')) = 1, '0014 parent sees the invoice linked to their child''s package');
select t.ok((select count(*) from public.cr360_guardian_invoices('TST-002')) = 0 and (select count(*) from public.cr360_guardian_schedule('TST-002')) = 0,
  '0014 parent sees nothing for another child (guessed code)');
select t.claims('00000000-0000-0000-0000-0000000000e2');
select t.ok((select count(*) from public.cr360_guardian_schedule('TST-001')) = 0 and (select count(*) from public.cr360_guardian_invoices('TST-001')) = 0,
  '0014 an unlinked account sees nothing');
select t.claims('00000000-0000-0000-0000-0000000000e1');
select t.claims('00000000-0000-0000-0000-0000000000a1');
select public.cr360_guardian_revoke(:'l1', 'test');
select t.claims('00000000-0000-0000-0000-0000000000e1');
select t.ok((select count(*) from public.cr360_guardian_invoices('TST-001')) = 0, '0014 access ends when the link is revoked');
reset role;
set local role anon; select t.claims(null);
do $$ declare code text; begin
  begin perform public.cr360_guardian_invoices('TST-001'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0014 anon cannot call the parent functions');
end $$;
rollback;
