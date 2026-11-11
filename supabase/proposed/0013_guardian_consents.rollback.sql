-- Rollback for 0013: removes the consent functions. The consent history TABLE is kept (legal record);
-- dropping it needs explicit owner approval. Without the functions, every optional purpose reads as
-- "not granted" in the app (fail closed): no AI drafts, no media, no notifications.
begin;
drop function if exists public.cr360_student_consent_ok(text[], text);
drop function if exists public.cr360_guardian_my_consents();
drop function if exists public.cr360_guardian_consent_record(uuid, text, boolean, text, text);
drop function if exists public.cr360_guardian_consent_set(text, text, boolean, text);
drop function if exists cr360_authz.student_consent(text, text);
drop function if exists cr360_authz.consent_latest(uuid, text);
-- drop table if exists public.cr360_guardian_consents;   -- destructive; requires approval
commit;
