-- Rollback for 0010. Lesson logs and reports are kept (teaching records); drop tables only with explicit approval.
begin;
drop function if exists public.cr360_guardian_reports(text);
drop function if exists public.cr360_student_note_approve(uuid);
drop function if exists public.cr360_student_note_save(uuid, uuid, jsonb, text, text, text, text);
drop function if exists public.cr360_lesson_log_save(uuid, date, text, text, text, text, text, text);
drop policy if exists cr360_student_notes_read on public.cr360_student_lesson_notes;
drop policy if exists cr360_lesson_logs_read on public.cr360_lesson_logs;
drop function if exists cr360_authz.valid_rubric(jsonb);
drop function if exists cr360_authz.can_view_class_progress(uuid);
drop function if exists cr360_authz.can_teach_class(uuid);
drop function if exists public.cr360_revoke_substitute(uuid, text);
drop function if exists public.cr360_assign_substitute(uuid, uuid, date, date, text);
drop policy if exists cr360_class_substitutes_read on public.cr360_class_substitutes;
drop function if exists cr360_authz.is_class_substitute(uuid);
drop function if exists cr360_authz.is_branch_manager(uuid);
-- drop table if exists public.cr360_student_lesson_notes;  -- destructive; requires approval
-- drop table if exists public.cr360_class_substitutes;    -- assignment history; requires approval
-- drop table if exists public.cr360_lesson_logs;           -- destructive; requires approval
commit;
