-- Rollback for 0014: read-only functions only; nothing else to undo.
begin;
drop function if exists public.cr360_guardian_invoices(text);
drop function if exists public.cr360_guardian_schedule(text);
commit;
