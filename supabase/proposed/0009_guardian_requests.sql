-- =====================================================================================
-- PROPOSED — NOT APPLIED. Requires CEO approval. Apply after 0004 (audit), 0005 (guardian links), 0006.
-- Rollback: 0009_guardian_requests.rollback.sql
--
-- Parent service desk (modules 9 + 16): absence notices and makeup / extension / schedule requests.
--  * Only a guardian with a VERIFIED, consented, unrevoked link to the student can create a request.
--  * Max 10 open (pending) requests per guardian (abuse guard).
--  * The CEO or the student's branch manager decides; rejection needs a note; everything audited.
--  * Approval records the decision ONLY. It never changes the session ledger or bookings by itself —
--    staff apply the approved change (master prompt: "effective ledger/booking changes only after
--    approved action"), so a mistaken click cannot move a child's sessions.
--  * No direct table writes for any API role; guardians read their own rows only.
-- =====================================================================================
begin;

create table if not exists public.cr360_guardian_requests (
  id uuid primary key default gen_random_uuid(),
  guardian_user_id uuid not null references auth.users(id) on delete cascade,
  student_code text not null,
  kind text not null check (kind in ('absence', 'makeup', 'extension', 'schedule', 'other')),
  start_date date,
  end_date date,
  message text not null check (length(trim(message)) between 3 and 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  constraint guardian_request_dates check (end_date is null or start_date is null or end_date >= start_date),
  constraint guardian_request_absence_dates check (kind not in ('absence', 'extension') or start_date is not null)
);
create index if not exists cr360_guardian_requests_student on public.cr360_guardian_requests (student_code, status);
create index if not exists cr360_guardian_requests_guardian on public.cr360_guardian_requests (guardian_user_id, created_at desc);

alter table public.cr360_guardian_requests enable row level security;
revoke all on public.cr360_guardian_requests from anon, authenticated;
grant select on public.cr360_guardian_requests to authenticated;
drop policy if exists cr360_guardian_requests_own on public.cr360_guardian_requests;
create policy cr360_guardian_requests_own on public.cr360_guardian_requests for select to authenticated
  using (guardian_user_id = (select auth.uid()));

-- Verified-link check shared by the create path.
create or replace function cr360_authz.is_verified_guardian_of(p_code text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.cr360_guardian_links l
    where l.guardian_user_id = (select auth.uid()) and l.student_code = p_code
      and l.verified_at is not null and l.consent_at is not null and l.revoked_at is null)
$$;
revoke all on function cr360_authz.is_verified_guardian_of(text) from public, anon, authenticated;

create or replace function public.cr360_guardian_request_create(
  p_student_code text, p_kind text, p_start date, p_end date, p_message text
) returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_id uuid; v_today date := (now() at time zone 'Asia/Vientiane')::date;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if cr360_authz.is_verified_guardian_of(p_student_code) is not true then raise exception 'access denied' using errcode = '42501'; end if;
  if p_start is not null and p_start < v_today - 7 then raise exception 'start date too far in the past' using errcode = '22023'; end if;
  if p_end is not null and p_end > v_today + 365 then raise exception 'end date too far ahead' using errcode = '22023'; end if;
  if (select count(*) from public.cr360_guardian_requests where guardian_user_id = v_user and status = 'pending') >= 10 then
    raise exception 'too many open requests' using errcode = '54000';
  end if;
  insert into public.cr360_guardian_requests (guardian_user_id, student_code, kind, start_date, end_date, message)
  values (v_user, p_student_code, p_kind, p_start, p_end, p_message) returning id into v_id;
  insert into cr360_vault.audit_events (actor, action, entity, entity_id, after)
  values (v_user, 'guardian.request.created', 'cr360_guardian_requests', v_id, jsonb_build_object('kind', p_kind));
  return v_id;
end $$;

create or replace function public.cr360_guardian_request_cancel(p_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_owner uuid; v_status text;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select guardian_user_id, status into v_owner, v_status from public.cr360_guardian_requests where id = p_id for update;
  if v_owner is null or v_owner <> v_user then raise exception 'not found' using errcode = 'P0002'; end if;
  if v_status = 'cancelled' then return; end if;
  if v_status <> 'pending' then raise exception 'already decided' using errcode = '40001'; end if;
  update public.cr360_guardian_requests set status = 'cancelled' where id = p_id;
  insert into cr360_vault.audit_events (actor, action, entity, entity_id) values (v_user, 'guardian.request.cancelled', 'cr360_guardian_requests', p_id);
end $$;

drop function if exists public.cr360_guardian_requests_for_staff();
create function public.cr360_guardian_requests_for_staff()
returns table (id uuid, student_code text, student_name text, kind text, start_date date, end_date date,
               message text, status text, created_at timestamptz, review_note text)
language sql stable security definer set search_path = '' as $$
  select r.id, r.student_code,
         (select p.student_name from public.student_packages p where p.student_id = r.student_code order by p.created_at desc limit 1),
         r.kind, r.start_date, r.end_date, r.message, r.status, r.created_at, r.review_note
  from public.cr360_guardian_requests r
  where (select auth.uid()) is not null
    and (r.status = 'pending' or r.created_at > now() - interval '30 days')
    and cr360_authz.can_manage_student(r.student_code)
  order by (r.status = 'pending') desc, r.created_at
$$;

create or replace function public.cr360_guardian_request_decide(p_id uuid, p_action text, p_note text default null)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_code text; v_status text; v_new text;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_action not in ('approve', 'reject') then raise exception 'invalid action' using errcode = '22023'; end if;
  if p_action = 'reject' and (p_note is null or length(trim(p_note)) < 3) then raise exception 'reason required' using errcode = '22023'; end if;
  select student_code, status into v_code, v_status from public.cr360_guardian_requests where id = p_id for update;
  if v_code is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if cr360_authz.can_manage_student(v_code) is not true then raise exception 'access denied' using errcode = '42501'; end if;
  if v_status <> 'pending' then raise exception 'already decided' using errcode = '40001'; end if;
  v_new := case p_action when 'approve' then 'approved' else 'rejected' end;
  update public.cr360_guardian_requests
     set status = v_new, reviewed_by = v_user, reviewed_at = now(), review_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_id;
  insert into cr360_vault.audit_events (actor, action, entity, entity_id, before, after, reason)
  values (v_user, 'guardian.request.' || p_action, 'cr360_guardian_requests', p_id,
          jsonb_build_object('status', v_status), jsonb_build_object('status', v_new), p_note);
  return v_new;
end $$;

revoke all on function public.cr360_guardian_request_create(text, text, date, date, text) from public, anon;
revoke all on function public.cr360_guardian_request_cancel(uuid) from public, anon;
revoke all on function public.cr360_guardian_requests_for_staff() from public, anon;
revoke all on function public.cr360_guardian_request_decide(uuid, text, text) from public, anon;
grant execute on function public.cr360_guardian_request_create(text, text, date, date, text) to authenticated;
grant execute on function public.cr360_guardian_request_cancel(uuid) to authenticated;
grant execute on function public.cr360_guardian_requests_for_staff() to authenticated;
grant execute on function public.cr360_guardian_request_decide(uuid, text, text) to authenticated;

commit;
