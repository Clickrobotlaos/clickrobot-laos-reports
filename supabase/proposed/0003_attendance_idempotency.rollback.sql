-- Rollback for 0003. Keeps the audit table data (export it first if you intend to drop it).
begin;
drop trigger if exists attendance_audit on public.attendance;
drop index if exists public.attendance_one_present_per_class_day;
-- Optional, destructive to audit history — only with explicit approval:
-- drop schema cr360_audit cascade;
commit;
