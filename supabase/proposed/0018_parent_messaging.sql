-- =====================================================================================
-- PROPOSED — NOT APPLIED. Requires CEO approval. Apply AFTER 0005, 0012 and 0015. Staging first.
-- Rollback: 0018_parent_messaging.rollback.sql
--
-- Secure in-app messaging between a verified parent and the centre about ONE child.
--  * Parent: only for their verified child. Staff: branch manager / CEO of the child's branch, or a
--    teacher / assistant / assigned substitute of a class the child is booked in. No one else.
--  * Messages are append-only (no edit/delete). Staff may close a conversation; it is kept.
--  * Max 30 messages per sender per hour. Never sent outside the app, never sent to AI.
-- DATA IMPACT: two new tables; no existing rows change.
-- =====================================================================================
begin;

create table if not exists public.cr360_message_threads (
  id uuid primary key default gen_random_uuid(),
  student_code text not null,
  guardian_user_id uuid not null references auth.users(id),
  subject text not null check (length(trim(subject)) between 2 and 120),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  guardian_read_at timestamptz,
  staff_read_at timestamptz,
  closed_by uuid, closed_at timestamptz
);
create index if not exists cr360_threads_code on public.cr360_message_threads (student_code, last_message_at desc);
create index if not exists cr360_threads_guardian on public.cr360_message_threads (guardian_user_id, last_message_at desc);

create table if not exists public.cr360_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.cr360_message_threads(id),
  sender_user_id uuid not null,
  sender_side text not null check (sender_side in ('guardian', 'staff')),
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists cr360_messages_thread on public.cr360_messages (thread_id, id);

alter table public.cr360_message_threads enable row level security;
alter table public.cr360_messages enable row level security;
revoke all on public.cr360_message_threads, public.cr360_messages from anon, authenticated;
grant select on public.cr360_message_threads, public.cr360_messages to authenticated;

create or replace function public.cr360_messages_immutable() returns trigger
language plpgsql set search_path = '' as $$ begin raise exception 'messages cannot be changed or deleted' using errcode = '42501'; end $$;
drop trigger if exists cr360_messages_immutable on public.cr360_messages;
create trigger cr360_messages_immutable before update or delete on public.cr360_messages
  for each row execute function public.cr360_messages_immutable();

-- staff who may handle messages about this child
create or replace function cr360_authz.can_message_student(p_code text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(cr360_authz.can_manage_student(p_code) or exists (
    select 1 from public.student_packages p where p.student_id = p_code and cr360_authz.teaches_package(p.id)), false)
$$;
create or replace function cr360_authz.can_read_thread(p_thread uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(exists (
    select 1 from public.cr360_message_threads th
    where th.id = p_thread
      and ((th.guardian_user_id = (select auth.uid()) and cr360_authz.is_verified_guardian_of(th.student_code))
           or cr360_authz.can_message_student(th.student_code))), false)
$$;
revoke all on function cr360_authz.can_message_student(text) from public, anon;
revoke all on function cr360_authz.can_read_thread(uuid) from public, anon;
grant execute on function cr360_authz.can_message_student(text) to authenticated;
grant execute on function cr360_authz.can_read_thread(uuid) to authenticated;

drop policy if exists cr360_threads_read on public.cr360_message_threads;
create policy cr360_threads_read on public.cr360_message_threads for select to authenticated using (cr360_authz.can_read_thread(id));
drop policy if exists cr360_messages_read on public.cr360_messages;
create policy cr360_messages_read on public.cr360_messages for select to authenticated using (cr360_authz.can_read_thread(thread_id));

create or replace function cr360_authz.message_rate_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.cr360_messages m where m.sender_user_id = (select auth.uid()) and m.created_at > now() - interval '1 hour') < 30
$$;
revoke all on function cr360_authz.message_rate_ok() from public, anon, authenticated;

-- Parent starts a conversation about their verified child
create or replace function public.cr360_thread_start(p_student_code text, p_subject text, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if cr360_authz.is_verified_guardian_of(p_student_code) is not true then raise exception 'access denied' using errcode = '42501'; end if;
  if p_subject is null or length(trim(p_subject)) < 2 or p_body is null or length(trim(p_body)) < 1 or length(p_body) > 2000 then
    raise exception 'subject and message required' using errcode = '22023';
  end if;
  if cr360_authz.message_rate_ok() is not true then raise exception 'too many messages' using errcode = '54000'; end if;
  insert into public.cr360_message_threads (student_code, guardian_user_id, subject, guardian_read_at)
  values (p_student_code, auth.uid(), trim(p_subject), now()) returning id into v_id;
  insert into public.cr360_messages (thread_id, sender_user_id, sender_side, body) values (v_id, auth.uid(), 'guardian', trim(p_body));
  return v_id;
end $$;

-- Either side replies (a closed conversation is reopened by the parent's reply; staff must reopen explicitly)
create or replace function public.cr360_message_send(p_thread uuid, p_body text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare th public.cr360_message_threads%rowtype; v_side text; v_id bigint;
begin
  select * into th from public.cr360_message_threads where id = p_thread for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if th.guardian_user_id = auth.uid() and cr360_authz.is_verified_guardian_of(th.student_code) then v_side := 'guardian';
  elsif cr360_authz.can_message_student(th.student_code) then v_side := 'staff';
  else raise exception 'access denied' using errcode = '42501'; end if;
  if p_body is null or length(trim(p_body)) < 1 or length(p_body) > 2000 then raise exception 'message required' using errcode = '22023'; end if;
  if cr360_authz.message_rate_ok() is not true then raise exception 'too many messages' using errcode = '54000'; end if;
  insert into public.cr360_messages (thread_id, sender_user_id, sender_side, body) values (p_thread, auth.uid(), v_side, trim(p_body)) returning id into v_id;
  update public.cr360_message_threads set last_message_at = now(),
    status = 'open', closed_by = null, closed_at = null,
    guardian_read_at = case when v_side = 'guardian' then now() else guardian_read_at end,
    staff_read_at = case when v_side = 'staff' then now() else staff_read_at end
   where id = p_thread;
  return v_id;
end $$;

create or replace function public.cr360_thread_mark_read(p_thread uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare th public.cr360_message_threads%rowtype;
begin
  select * into th from public.cr360_message_threads where id = p_thread;
  if not found then return false; end if;
  if th.guardian_user_id = auth.uid() and cr360_authz.is_verified_guardian_of(th.student_code) then
    update public.cr360_message_threads set guardian_read_at = now() where id = p_thread;
  elsif cr360_authz.can_message_student(th.student_code) then
    update public.cr360_message_threads set staff_read_at = now() where id = p_thread;
  else raise exception 'access denied' using errcode = '42501'; end if;
  return true;
end $$;

create or replace function public.cr360_thread_close(p_thread uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare th public.cr360_message_threads%rowtype;
begin
  select * into th from public.cr360_message_threads where id = p_thread for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if cr360_authz.can_message_student(th.student_code) is not true then raise exception 'access denied' using errcode = '42501'; end if;
  update public.cr360_message_threads set status = 'closed', closed_by = auth.uid(), closed_at = now(), staff_read_at = now() where id = p_thread;
  return 'closed';
end $$;

revoke all on function public.cr360_thread_start(text, text, text) from public, anon;
revoke all on function public.cr360_message_send(uuid, text) from public, anon;
revoke all on function public.cr360_thread_mark_read(uuid) from public, anon;
revoke all on function public.cr360_thread_close(uuid) from public, anon;
grant execute on function public.cr360_thread_start(text, text, text) to authenticated;
grant execute on function public.cr360_message_send(uuid, text) to authenticated;
grant execute on function public.cr360_thread_mark_read(uuid) to authenticated;
grant execute on function public.cr360_thread_close(uuid) to authenticated;
commit;
