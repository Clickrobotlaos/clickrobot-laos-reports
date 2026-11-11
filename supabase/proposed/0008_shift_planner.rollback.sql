-- Rollback for 0008. Existing shifts are kept.
begin;
drop function if exists public.cr360_hr_cancel_shift(uuid, text);
drop function if exists public.cr360_hr_create_shift(uuid, timestamptz, timestamptz);
commit;
