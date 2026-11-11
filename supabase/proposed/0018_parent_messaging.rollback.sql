-- Rollback for 0018: drops functions and policies (nobody can read or send). Conversations are kept.
begin;
drop function if exists public.cr360_thread_close(uuid);
drop function if exists public.cr360_thread_mark_read(uuid);
drop function if exists public.cr360_message_send(uuid, text);
drop function if exists public.cr360_thread_start(text, text, text);
drop function if exists cr360_authz.message_rate_ok();
drop policy if exists cr360_messages_read on public.cr360_messages;
drop policy if exists cr360_threads_read on public.cr360_message_threads;
drop function if exists cr360_authz.can_read_thread(uuid);
drop function if exists cr360_authz.can_message_student(text);
commit;
