-- Owner decision C (0011): one deduction per attended class, several classes a day allowed,
-- never two deductions for one class, Quick Scan (no class) cannot double up a roll call.
\set QUIET on
-- staff A ...a2 (legacy role staff, may write attendance); package TST-001 ...0001 (8 sessions, 0 used)

begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a2');
insert into public.attendance (package_id, class_id, date, status, recorded_by) values
  ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '2026-12-05', 'Present', auth.uid()),
  ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', '2026-12-05', 'Present', auth.uid());
select t.ok((select count(*) from public.attendance where package_id = '30000000-0000-0000-0000-000000000001' and date = '2026-12-05') = 2,
  'C two different classes on one day are both recorded');
select t.ok((select sessions_used from public.student_packages where id = '30000000-0000-0000-0000-000000000001') = 2,
  'C each attended class deducts exactly one session (2 classes -> 2 sessions)');
do $$ declare code text; begin
  begin insert into public.attendance (package_id, class_id, date, status) values
    ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '2026-12-05', 'Present'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '23505', 'C the same class cannot be recorded twice on one day (no double deduction)');
  begin insert into public.attendance (package_id, date, status) values
    ('30000000-0000-0000-0000-000000000001', '2026-12-05', 'Present'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '23505', 'C Quick Scan (no class) after a roll call is refused, as today');
end $$;
select t.ok((select sessions_used from public.student_packages where id = '30000000-0000-0000-0000-000000000001') = 2,
  'C refused duplicates deducted nothing');
-- cancellation / correction: Absent gives the session back, with an audit row (0003)
update public.attendance set status = 'Absent'
 where package_id = '30000000-0000-0000-0000-000000000001' and class_id = '40000000-0000-0000-0000-000000000002' and date = '2026-12-05';
select t.ok((select sessions_used from public.student_packages where id = '30000000-0000-0000-0000-000000000001') = 1,
  'C correcting one class to Absent returns exactly one session');
rollback;

begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a2');
insert into public.attendance (package_id, date, status) values ('30000000-0000-0000-0000-000000000001', '2026-12-06', 'Present');
do $$ declare code text; begin
  begin insert into public.attendance (package_id, class_id, date, status) values
    ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '2026-12-06', 'Present'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '23505', 'C roll call after a class-less scan is refused until the scan row is corrected');
  begin insert into public.attendance (package_id, date, status) values
    ('30000000-0000-0000-0000-000000000001', '2026-12-06', 'Present'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '23505', 'C second class-less scan on one day is refused');
end $$;
-- correction path: attach the scan row to its class; then a second class is allowed
update public.attendance set class_id = '40000000-0000-0000-0000-000000000001'
 where package_id = '30000000-0000-0000-0000-000000000001' and date = '2026-12-06';
insert into public.attendance (package_id, class_id, date, status) values
  ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', '2026-12-06', 'Present');
select t.ok((select sessions_used from public.student_packages where id = '30000000-0000-0000-0000-000000000001') = 2,
  'C after attaching the scan to its class, a second class adds one session (total 2)');
rollback;

select t.ok(not exists (select 1 from pg_constraint where conname = 'attendance_package_id_date_key'),
  'C the universal one-class-per-day constraint is gone');
