-- Rollback for 0017: drops functions and policy; announcements are kept.
begin;
drop function if exists public.cr360_guardian_announcements();
drop function if exists public.cr360_announcement_status(uuid, text);
drop function if exists public.cr360_announcement_save(uuid, uuid, text, text, text, text, text, date, date);
drop policy if exists cr360_announcements_read on public.cr360_announcements;
drop function if exists cr360_authz.can_read_announcement(uuid, text, text, date, date);
drop function if exists cr360_authz.can_manage_announcement(uuid);
commit;
