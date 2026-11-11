-- =====================================================================================
-- PROPOSED — NOT APPLIED. Requires CEO approval. Apply after 0004 (audit), 0005 (guardian links), 0006.
-- Rollback: 0010_lesson_logs_and_parent_reports.rollback.sql
--
-- Instructor class log + per-student follow-up + parent reports (owner request 2026-11-11):
--  * Lesson log per class per day: unit, lesson, level, what was covered, next plan, substitute notes.
--    Written by the class teacher/assistant, the branch manager or CEO; editable for 14 days.
--    READ by any staff member of the same branch so a SUBSTITUTE teacher can continue the class.
--  * Per-student note per lesson (only students booked in that class): 1–4 rubric on four skills,
--    private teacher note, parent report in English and Lao. Drafts until the teacher approves;
--    editing an approved report sends it back to draft.
--  * Parents read ONLY approved reports for verified children, never the private teacher note.
--  * AI drafting happens in the app (names removed before any text leaves the server); the database
--    only stores what the teacher saved and approved. All writes via functions; approvals audited.
-- =====================================================================================
begin;

-- ---- authorisation helpers ---------------------------------------------------------------
create or replace function cr360_authz.can_teach_class(p_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.classes c
    where c.id = p_class and c.active
      and (c.teacher_id = (select auth.uid()) or c.assistant_id = (select auth.uid())
           or cr360_authz.can_access_branch(c.branch_id))   -- CEO / HR org-wide, or manager of this branch
  )
$$;

-- Substitute access: any active ClickRobot 360 member assigned to the class's branch may READ.
create or replace function cr360_authz.can_view_class_progress(p_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select cr360_authz.can_teach_class(p_class) or exists (
    select 1 from public.classes c
    join public.cr360_hr_memberships m on m.user_id = (select auth.uid()) and m.active and m.branch_id = c.branch_id
    where c.id = p_class
  )
$$;
revoke all on function cr360_authz.can_teach_class(uuid) from public, anon;
revoke all on function cr360_authz.can_view_class_progress(uuid) from public, anon;
grant execute on function cr360_authz.can_teach_class(uuid) to authenticated;
grant execute on function cr360_authz.can_view_class_progress(uuid) to authenticated;

-- ---- tables -------------------------------------------------------------------------------
create table if not exists public.cr360_lesson_logs (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id),
  branch_id uuid not null references public.branches(id),
  lesson_date date not null,
  unit text check (unit is null or length(unit) <= 200),
  lesson_title text not null check (length(trim(lesson_title)) between 2 and 200),
  level text check (level is null or length(level) <= 100),
  covered text check (covered is null or length(covered) <= 4000),
  next_plan text check (next_plan is null or length(next_plan) <= 4000),
  substitute_notes text check (substitute_notes is null or length(substitute_notes) <= 4000),
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, lesson_date)
);

create table if not exists public.cr360_student_lesson_notes (
  id uuid primary key default gen_random_uuid(),
  lesson_log_id uuid not null references public.cr360_lesson_logs(id) on delete cascade,
  package_id uuid not null references public.student_packages(id),
  student_code text,
  rubric jsonb not null default '{}'::jsonb,
  teacher_note text check (teacher_note is null or length(teacher_note) <= 2000),
  report_en text check (report_en is null or length(report_en) <= 3000),
  report_lo text check (report_lo is null or length(report_lo) <= 3000),
  report_source text not null default 'teacher' check (report_source in ('teacher', 'ai_draft', 'ai_draft_edited', 'template')),
  status text not null default 'draft' check (status in ('draft', 'approved')),
  approved_by uuid,
  approved_at timestamptz,
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  unique (lesson_log_id, package_id)
);
create index if not exists cr360_student_notes_code on public.cr360_student_lesson_notes (student_code, status);

alter table public.cr360_lesson_logs enable row level security;
alter table public.cr360_student_lesson_notes enable row level security;
revoke all on public.cr360_lesson_logs, public.cr360_student_lesson_notes from anon, authenticated;
grant select on public.cr360_lesson_logs, public.cr360_student_lesson_notes to authenticated;
drop policy if exists cr360_lesson_logs_read on public.cr360_lesson_logs;
create policy cr360_lesson_logs_read on public.cr360_lesson_logs for select to authenticated
  using (cr360_authz.can_view_class_progress(class_id));
drop policy if exists cr360_student_notes_read on public.cr360_student_lesson_notes;
create policy cr360_student_notes_read on public.cr360_student_lesson_notes for select to authenticated
  using (exists (select 1 from public.cr360_lesson_logs l where l.id = lesson_log_id and cr360_authz.can_view_class_progress(l.class_id)));

-- ---- write functions ----------------------------------------------------------------------
create or replace function public.cr360_lesson_log_save(
  p_class uuid, p_date date, p_unit text, p_lesson_title text, p_level text,
  p_covered text, p_next_plan text, p_substitute_notes text
) returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_branch uuid; v_id uuid; v_today date := (now() at time zone 'Asia/Vientiane')::date;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if cr360_authz.can_teach_class(p_class) is not true then raise exception 'access denied' using errcode = '42501'; end if;
  if p_date is null or p_date > v_today or p_date < v_today - 14 then raise exception 'date outside the editable window' using errcode = '22023'; end if;
  select branch_id into v_branch from public.classes where id = p_class;
  insert into public.cr360_lesson_logs (class_id, branch_id, lesson_date, unit, lesson_title, level, covered, next_plan, substitute_notes, created_by, updated_by)
  values (p_class, v_branch, p_date, nullif(trim(p_unit), ''), trim(p_lesson_title), nullif(trim(p_level), ''),
          nullif(trim(p_covered), ''), nullif(trim(p_next_plan), ''), nullif(trim(p_substitute_notes), ''), v_user, v_user)
  on conflict (class_id, lesson_date) do update set
    unit = excluded.unit, lesson_title = excluded.lesson_title, level = excluded.level, covered = excluded.covered,
    next_plan = excluded.next_plan, substitute_notes = excluded.substitute_notes, updated_by = v_user, updated_at = now()
  returning id into v_id;
  return v_id;
end $$;

create or replace function cr360_authz.valid_rubric(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(coalesce(p, '{}'::jsonb)) = 'object' and not exists (
    select 1 from jsonb_each(coalesce(p, '{}'::jsonb)) e
    where e.key not in ('problem_solving', 'programming', 'mechanics', 'teamwork')
       or jsonb_typeof(e.value) <> 'number' or (e.value)::text::numeric not in (1, 2, 3, 4))
$$;

create or replace function public.cr360_student_note_save(
  p_log uuid, p_package uuid, p_rubric jsonb, p_teacher_note text, p_report_en text, p_report_lo text, p_source text
) returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_class uuid; v_date date; v_code text; v_id uuid;
  v_old public.cr360_student_lesson_notes%rowtype;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select class_id, lesson_date into v_class, v_date from public.cr360_lesson_logs where id = p_log;
  if v_class is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if cr360_authz.can_teach_class(v_class) is not true then raise exception 'access denied' using errcode = '42501'; end if;
  if not exists (select 1 from public.class_bookings b where b.class_id = v_class and b.package_id = p_package and b.status = 'Confirmed'
                 and (b.kind = 'regular' or (b.kind = 'makeup' and b.makeup_date = v_date))) then
    raise exception 'student not booked in this class' using errcode = '22023';
  end if;
  if cr360_authz.valid_rubric(p_rubric) is not true then raise exception 'invalid rubric' using errcode = '22023'; end if;
  select student_id into v_code from public.student_packages where id = p_package;

  select * into v_old from public.cr360_student_lesson_notes where lesson_log_id = p_log and package_id = p_package for update;
  insert into public.cr360_student_lesson_notes (lesson_log_id, package_id, student_code, rubric, teacher_note, report_en, report_lo, report_source, updated_by)
  values (p_log, p_package, v_code, coalesce(p_rubric, '{}'::jsonb), nullif(trim(p_teacher_note), ''), nullif(trim(p_report_en), ''),
          nullif(trim(p_report_lo), ''), coalesce(p_source, 'teacher'), v_user)
  on conflict (lesson_log_id, package_id) do update set
    rubric = excluded.rubric, teacher_note = excluded.teacher_note, report_en = excluded.report_en, report_lo = excluded.report_lo,
    report_source = excluded.report_source, updated_by = v_user, updated_at = now(),
    -- Any change to what parents would read sends an approved report back to draft.
    status = case when v_old.status = 'approved'
                   and (v_old.report_en is not distinct from excluded.report_en) and (v_old.report_lo is not distinct from excluded.report_lo)
                   and (v_old.rubric = excluded.rubric) then 'approved' else 'draft' end,
    approved_by = case when v_old.status = 'approved'
                   and (v_old.report_en is not distinct from excluded.report_en) and (v_old.report_lo is not distinct from excluded.report_lo)
                   and (v_old.rubric = excluded.rubric) then v_old.approved_by else null end,
    approved_at = case when v_old.status = 'approved'
                   and (v_old.report_en is not distinct from excluded.report_en) and (v_old.report_lo is not distinct from excluded.report_lo)
                   and (v_old.rubric = excluded.rubric) then v_old.approved_at else null end
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.cr360_student_note_approve(p_note uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_class uuid; v_en text; v_lo text; v_status text;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select l.class_id, n.report_en, n.report_lo, n.status into v_class, v_en, v_lo, v_status
    from public.cr360_student_lesson_notes n join public.cr360_lesson_logs l on l.id = n.lesson_log_id where n.id = p_note for update of n;
  if v_class is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if cr360_authz.can_teach_class(v_class) is not true then raise exception 'access denied' using errcode = '42501'; end if;
  if coalesce(trim(v_en), '') = '' and coalesce(trim(v_lo), '') = '' then raise exception 'report is empty' using errcode = '22023'; end if;
  if v_status = 'approved' then return; end if; -- idempotent
  update public.cr360_student_lesson_notes set status = 'approved', approved_by = v_user, approved_at = now() where id = p_note;
  insert into cr360_vault.audit_events (actor, action, entity, entity_id) values (v_user, 'parent_report.approved', 'cr360_student_lesson_notes', p_note);
end $$;

-- ---- parent read path ---------------------------------------------------------------------
drop function if exists public.cr360_guardian_reports(text);
create function public.cr360_guardian_reports(p_student_code text)
returns table (lesson_date date, class_name text, unit text, lesson_title text, level text, rubric jsonb, report_en text, report_lo text)
language sql stable security definer set search_path = '' as $$
  select l.lesson_date, c.name, l.unit, l.lesson_title, l.level, n.rubric, n.report_en, n.report_lo
  from public.cr360_student_lesson_notes n
  join public.cr360_lesson_logs l on l.id = n.lesson_log_id
  join public.classes c on c.id = l.class_id
  where n.student_code = p_student_code and n.status = 'approved'
    and cr360_authz.is_verified_guardian_of(p_student_code)
  order by l.lesson_date desc
  limit 30
$$;

revoke all on function public.cr360_lesson_log_save(uuid, date, text, text, text, text, text, text) from public, anon;
revoke all on function public.cr360_student_note_save(uuid, uuid, jsonb, text, text, text, text) from public, anon;
revoke all on function public.cr360_student_note_approve(uuid) from public, anon;
revoke all on function public.cr360_guardian_reports(text) from public, anon;
grant execute on function public.cr360_lesson_log_save(uuid, date, text, text, text, text, text, text) to authenticated;
grant execute on function public.cr360_student_note_save(uuid, uuid, jsonb, text, text, text, text) to authenticated;
grant execute on function public.cr360_student_note_approve(uuid) to authenticated;
grant execute on function public.cr360_guardian_reports(text) to authenticated;

commit;
