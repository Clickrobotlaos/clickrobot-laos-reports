-- FICTIONAL fixtures for the local harness. No real people, branches or amounts.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c0', 'ceo@test.invalid'),
  ('00000000-0000-0000-0000-0000000000c1', 'coadmin@test.invalid'),
  ('00000000-0000-0000-0000-0000000000f1', 'finance@test.invalid'),
  ('00000000-0000-0000-0000-0000000000a1', 'mgr-a@test.invalid'),
  ('00000000-0000-0000-0000-0000000000b1', 'mgr-b@test.invalid'),
  ('00000000-0000-0000-0000-0000000000a2', 'staff-a@test.invalid'),
  ('00000000-0000-0000-0000-0000000000a3', 'staff-a2@test.invalid'),
  ('00000000-0000-0000-0000-0000000000e1', 'guardian-1@test.invalid'),
  ('00000000-0000-0000-0000-0000000000e2', 'guardian-2@test.invalid'),
  ('00000000-0000-0000-0000-0000000000d9', 'former-staff@test.invalid');

insert into public.branches (id, name, active) values
  ('10000000-0000-0000-0000-00000000000a', 'TEST Branch A', true),
  ('10000000-0000-0000-0000-00000000000b', 'TEST Branch B', true);

-- Legacy users (legacy role model). Salary/bank values are obviously fake.
insert into public.users (id, name, role, branch_id, status, base_salary, salary_currency, bank_account_no, id_card) values
  ('00000000-0000-0000-0000-0000000000c0', 'TEST CEO',      'admin',    null, 'Active', 999, 'LAK', 'FAKE-0', 'FAKE-ID-0'),
  ('00000000-0000-0000-0000-0000000000c1', 'TEST CoAdmin',  'co_admin', null, 'Active', 888, 'LAK', 'FAKE-1', 'FAKE-ID-1'),
  ('00000000-0000-0000-0000-0000000000f1', 'TEST Finance',  'finance',  null, 'Active', 777, 'LAK', 'FAKE-2', 'FAKE-ID-2'),
  ('00000000-0000-0000-0000-0000000000a2', 'TEST Staff A',  'staff',    '10000000-0000-0000-0000-00000000000a', 'Active', 111, 'LAK', 'FAKE-3', 'FAKE-ID-3'),
  ('00000000-0000-0000-0000-0000000000a3', 'TEST Staff A2', 'staff',    '10000000-0000-0000-0000-00000000000a', 'Active', 222, 'LAK', 'FAKE-4', 'FAKE-ID-4'),
  ('00000000-0000-0000-0000-0000000000d9', 'TEST Former',   'staff',    null, 'Terminated', 1, 'LAK', 'FAKE-5', 'FAKE-ID-5');

insert into public.settings (key, value) values ('company', '{"name":"TEST Co"}');

insert into public.programs (id, name) values ('70000000-0000-0000-0000-000000000001', 'TEST Program');

insert into public.student_packages (id, student_id, student_name, branch_id, program_id, package, sessions_total, sessions_used, active) values
  ('30000000-0000-0000-0000-000000000001', 'TST-001', 'TEST Child One', '10000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-000000000001', '8 sessions', 8, 0, true),
  ('30000000-0000-0000-0000-000000000002', 'TST-002', 'TEST Child Two', '10000000-0000-0000-0000-00000000000b', '70000000-0000-0000-0000-000000000001', '8 sessions', 8, 0, true);

insert into public.classes (id, name, branch_id, capacity) values
  ('40000000-0000-0000-0000-000000000001', 'TEST Class', '10000000-0000-0000-0000-00000000000a', 8);

insert into public.invoices (id, invoice_no, date, branch_id, student_name, phone, amount, currency, rate_to_lak, amount_lak, status, share_token) values
  ('50000000-0000-0000-0000-000000000001', 'TEST-1', '2026-11-01', '10000000-0000-0000-0000-00000000000a', 'TEST Child One', '000', 100, 'LAK', 1, 100, 'Sent', 'tok_aaaaaaaaaaaaaaaaaaaa'),
  ('50000000-0000-0000-0000-000000000002', 'TEST-2', '2026-11-01', '10000000-0000-0000-0000-00000000000a', 'TEST Child Two', '000', 200, 'LAK', 1, 200, 'Sent', 'tok_bbbbbbbbbbbbbbbbbbbb');

-- StaffOS (cr360) fixtures
insert into public.cr360_hr_memberships (user_id, role, branch_id) values
  ('00000000-0000-0000-0000-0000000000c0', 'ceo', null),
  ('00000000-0000-0000-0000-0000000000a1', 'manager', '10000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000b1', 'manager', '10000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-0000000000a2', 'staff', '10000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000a3', 'staff', '10000000-0000-0000-0000-00000000000a');

insert into public.cr360_hr_employees (id, auth_user_id, branch_id, display_name) values
  ('20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'TEST Manager A'),
  ('20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'TEST Staff A'),
  ('20000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a', 'TEST Staff A2'),
  ('20000000-0000-0000-0000-0000000000b9', null, '10000000-0000-0000-0000-00000000000b', 'TEST Staff B');

insert into public.cr360_hr_leave_requests (id, employee_id, branch_id, leave_type, start_date, end_date, reason) values
  ('60000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'annual', '2026-12-01', '2026-12-02', 'test'),
  ('60000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'annual', '2026-12-03', '2026-12-03', 'mgr own'),
  ('60000000-0000-0000-0000-0000000000b9', '20000000-0000-0000-0000-0000000000b9', '10000000-0000-0000-0000-00000000000b', 'sick', '2026-12-01', '2026-12-01', 'test');

-- Legacy payslips (fictional amounts) for decision-B checks: one each for staff A and staff A2.
insert into public.salary_payroll (id, month, staff_id, user_id, staff_name, net, currency, rate_to_lak, net_lak) values
  ('80000000-0000-0000-0000-0000000000a2', '2026-10', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a2', 'TEST Staff A', 111, 'LAK', 1, 111),
  ('80000000-0000-0000-0000-0000000000a3', '2026-10', '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a3', 'TEST Staff A2', 222, 'LAK', 1, 222);

-- Second branch-A class (decision C: two legitimate classes on one day).
insert into public.classes (id, name, branch_id, capacity) values
  ('40000000-0000-0000-0000-000000000002', 'TEST Class 2', '10000000-0000-0000-0000-00000000000a', 8);
