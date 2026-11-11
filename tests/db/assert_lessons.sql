-- 0010 lesson logs, student notes, parent reports. Run after all proposed migrations.
\set QUIET on
-- class 40..01 (branch A); teacher = staff A (...a2); substitute = staff A2 (...a3, same branch);
-- manager B (...b1) other branch; G1 (...e1) guardian of TST-001 (package 30..01); TST-002 = package 30..02 (branch B)

begin;
update public.classes set teacher_id = '00000000-0000-0000-0000-0000000000a2' where id = '40000000-0000-0000-0000-000000000001';
insert into public.class_bookings (class_id, package_id, kind, status) values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'regular', 'Confirmed');

-- teacher writes today's log
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a2');
select public.cr360_lesson_log_save('40000000-0000-0000-0000-000000000001', (now() at time zone 'Asia/Vientiane')::date,
  'Unit 3: Sensors', 'Colour sensor line follower', 'Spike Prime L2', 'Calibrated sensor; built follower', 'Add speed control', 'Robot kits in cabinet B') as log \gset
select set_config('t.log', :'log', true);
select t.ok(:'log' <> '', '0010 class teacher saves the lesson log');
select t.ok(public.cr360_lesson_log_save('40000000-0000-0000-0000-000000000001', (now() at time zone 'Asia/Vientiane')::date,
  'Unit 3: Sensors', 'Colour sensor line follower (v2)', 'Spike Prime L2', null, 'Add speed control', null)::text = :'log', '0010 saving again updates the same day''s log');
do $$ declare code text; begin
  begin perform public.cr360_lesson_log_save('40000000-0000-0000-0000-000000000001', (now() at time zone 'Asia/Vientiane')::date + 1, null, 'Future', null, null, null, null); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', '0010 future dates rejected');
  begin perform public.cr360_lesson_log_save('40000000-0000-0000-0000-000000000001', (now() at time zone 'Asia/Vientiane')::date - 30, null, 'Old', null, null, null, null); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', '0010 entries older than 14 days are read-only');
end $$;

-- per-student note (booked student only), valid rubric only
select public.cr360_student_note_save(current_setting('t.log')::uuid, '30000000-0000-0000-0000-000000000001',
  '{"problem_solving":3,"programming":4,"teamwork":3}', 'Helped partner debug', 'Great work today.', 'ເຮັດໄດ້ດີຫຼາຍມື້ນີ້.', 'ai_draft_edited') as note \gset
select set_config('t.note', :'note', true);
select t.ok((select status from public.cr360_student_lesson_notes where id = :'note') = 'draft', '0010 note saved as draft');
do $$ declare code text; begin
  begin perform public.cr360_student_note_save(current_setting('t.log')::uuid, '30000000-0000-0000-0000-000000000002', '{}', null, 'x', null, 'teacher'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', '0010 cannot write notes for a student not booked in the class');
  begin perform public.cr360_student_note_save(current_setting('t.log')::uuid, '30000000-0000-0000-0000-000000000001', '{"programming":7}', null, 'x', null, 'teacher'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', '0010 rubric scores must be 1-4');
  begin perform public.cr360_student_note_save(current_setting('t.log')::uuid, '30000000-0000-0000-0000-000000000001', '{"charisma":2}', null, 'x', null, 'teacher'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', '0010 unknown rubric skill rejected');
end $$;

-- parent cannot see drafts
reset role;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a1');
select public.cr360_guardian_verify(public.cr360_guardian_link('00000000-0000-0000-0000-0000000000e1', 'TST-001'), 'consent-test');
select t.claims('00000000-0000-0000-0000-0000000000e1');
select t.ok((select count(*) from public.cr360_guardian_reports('TST-001')) = 0, '0010 parent does not see draft reports');
select t.ok((select count(*) from public.cr360_lesson_logs) = 0, '0010 parent has no direct access to lesson logs');
select t.ok((select count(*) from public.cr360_student_lesson_notes) = 0, '0010 parent has no direct access to teacher notes');

-- teacher approves → parent sees report but not the private note
select t.claims('00000000-0000-0000-0000-0000000000a2');
select public.cr360_student_note_approve(current_setting('t.note')::uuid);
select public.cr360_student_note_approve(current_setting('t.note')::uuid);
select t.claims('00000000-0000-0000-0000-0000000000e1');
select t.ok((select count(*) from public.cr360_guardian_reports('TST-001')) = 1, '0010 parent sees the approved report');
select t.ok((select report_lo from public.cr360_guardian_reports('TST-001') limit 1) = 'ເຮັດໄດ້ດີຫຼາຍມື້ນີ້.', '0010 Lao report delivered as written');
select t.ok(not exists (select 1 from information_schema.parameters p join information_schema.routines r on r.specific_name = p.specific_name
  where r.routine_name = 'cr360_guardian_reports' and p.parameter_name = 'teacher_note'), '0010 parent function never returns the private teacher note');
select t.ok((select count(*) from public.cr360_guardian_reports('TST-002')) = 0, '0010 parent cannot read another child''s reports');

-- editing an approved report sends it back to draft (parent stops seeing it until re-approved)
select t.claims('00000000-0000-0000-0000-0000000000a2');
select public.cr360_student_note_save(current_setting('t.log')::uuid, '30000000-0000-0000-0000-000000000001',
  '{"problem_solving":3,"programming":4,"teamwork":3}', 'Helped partner debug', 'Great work today!', 'ເຮັດໄດ້ດີຫຼາຍມື້ນີ້.', 'teacher');
select t.ok((select status from public.cr360_student_lesson_notes where id = current_setting('t.note')::uuid) = 'draft', '0010 edited report returns to draft');
-- changing only the private note keeps approval
select public.cr360_student_note_approve(current_setting('t.note')::uuid);
select public.cr360_student_note_save(current_setting('t.log')::uuid, '30000000-0000-0000-0000-000000000001',
  '{"problem_solving":3,"programming":4,"teamwork":3}', 'Private: check pencil grip', 'Great work today!', 'ເຮັດໄດ້ດີຫຼາຍມື້ນີ້.', 'teacher');
select t.ok((select status from public.cr360_student_lesson_notes where id = current_setting('t.note')::uuid) = 'approved', '0010 private-note-only change keeps the approval');

-- substitute (same branch) can READ the log and notes, but not write
select t.claims('00000000-0000-0000-0000-0000000000a3');
select t.ok((select next_plan from public.cr360_lesson_logs where id = current_setting('t.log')::uuid) = 'Add speed control', '0010 substitute teacher can read where the class is');
select t.ok((select count(*) from public.cr360_student_lesson_notes) = 1, '0010 substitute can read student follow-up notes');
do $$ declare code text; begin
  begin perform public.cr360_lesson_log_save('40000000-0000-0000-0000-000000000001', (now() at time zone 'Asia/Vientiane')::date, null, 'Hijack', null, null, null, null); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0010 substitute cannot overwrite the log');
end $$;

-- other-branch manager sees nothing and cannot write
select t.claims('00000000-0000-0000-0000-0000000000b1');
select t.ok((select count(*) from public.cr360_lesson_logs) = 0, '0010 other-branch manager cannot read the log');
do $$ declare code text; begin
  begin perform public.cr360_student_note_approve(current_setting('t.note')::uuid); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0010 other-branch manager cannot approve reports');
end $$;

-- branch manager may write and approve
select t.claims('00000000-0000-0000-0000-0000000000a1');
select t.ok((select count(*) from public.cr360_lesson_logs) = 1, '0010 branch manager reads the log');

reset role;
select t.ok((select count(*) from cr360_vault.audit_events where action = 'parent_report.approved') = 2, '0010 each approval audited (idempotent repeat writes nothing)');
-- no direct writes
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a2');
do $$ declare blocked boolean; begin
  begin update public.cr360_student_lesson_notes set status = 'approved'; blocked := false;
  exception when insufficient_privilege then blocked := true; end;
  perform t.ok(blocked, '0010 no direct UPDATE of notes (approval only through the function)');
end $$;
rollback;

begin;
set local role anon; select t.claims(null);
do $$ declare denied boolean; begin
  begin perform * from public.cr360_guardian_reports('TST-001'); denied := false; exception when insufficient_privilege then denied := true; end;
  perform t.ok(denied, '0010 anon cannot read reports');
end $$;
rollback;
