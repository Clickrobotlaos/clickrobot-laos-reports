-- Rollback for 0009. Request history is kept (drop the table only with explicit approval).
begin;
drop function if exists public.cr360_guardian_request_decide(uuid, text, text);
drop function if exists public.cr360_guardian_requests_for_staff();
drop function if exists public.cr360_guardian_request_cancel(uuid);
drop function if exists public.cr360_guardian_request_create(text, text, date, date, text);
drop function if exists cr360_authz.is_verified_guardian_of(text);
-- drop table if exists public.cr360_guardian_requests;  -- destructive; requires approval
commit;
