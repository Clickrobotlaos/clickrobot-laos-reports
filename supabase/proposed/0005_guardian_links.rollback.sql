-- Rollback for 0005. Removes the guardian read path and management RPCs (parents lose /360 access).
-- The links table is KEPT by default (it is consent evidence); drop only with explicit approval.
begin;
drop function if exists public.cr360_guardian_links_for(text);
drop function if exists public.cr360_guardian_link_by_email(text, text, text);
drop function if exists public.cr360_guardian_children();
drop function if exists public.cr360_guardian_revoke(uuid, text);
drop function if exists public.cr360_guardian_verify(uuid, text);
drop function if exists public.cr360_guardian_link(uuid, text, text);
drop function if exists cr360_authz.can_manage_student(text);
drop function if exists cr360_authz.student_branches(text);
-- drop table if exists public.cr360_guardian_links;  -- destructive; requires approval
commit;
