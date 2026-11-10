-- Rollback for 0004. Audit history is preserved unless explicitly approved for deletion.
begin;
drop function if exists public.cr360_hr_decide_request(text, uuid, text, text);
-- drop table if exists cr360_vault.audit_events;  -- destructive; requires approval
commit;
