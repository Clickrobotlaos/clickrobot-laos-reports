-- Rollback for 0016: removes policies and functions (no new uploads, nobody can read media).
-- The bucket, its files and the media table are KEPT; deleting children's media is a separate,
-- explicit owner decision (use the Storage API, not SQL, to delete files).
begin;
drop policy if exists cr360_media_read on storage.objects;
drop policy if exists cr360_media_upload on storage.objects;
drop policy if exists cr360_media_delete on storage.objects;
drop function if exists public.cr360_guardian_media(text);
drop function if exists public.cr360_media_decide(uuid, text, text);
drop function if exists public.cr360_media_register(text, text, text, integer, numeric, text, uuid[]);
drop function if exists cr360_authz.can_upload_media_path(text);
drop function if exists cr360_authz.can_read_media_object(text);
drop policy if exists cr360_class_media_staff_read on public.cr360_class_media;
drop function if exists cr360_authz.media_consented(uuid[]);
commit;
