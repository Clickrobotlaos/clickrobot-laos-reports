-- =====================================================================================
-- PROPOSED — NOT APPLIED. Requires CEO approval. Apply AFTER 0003. Staging first.
-- Rollback: 0011_attendance_per_class.rollback.sql
--
-- OWNER DECISION C (2026-11-11): no universal one-class-per-day rule. A student may attend several
-- legitimate classes on one day; each attended class deducts exactly one session, never twice.
--
-- Today: UNIQUE(package_id, date) on public.attendance (one row per package per day).
-- After:  one row per (package, class, day)              -> roll call per class
--         at most one CLASS-LESS row per (package, day)  -> Records app Quick Scan (no class)
--         a class-less row and class rows never coexist for one package+day (trigger, race-safe),
--         because a scan check-in and a roll call for the same lesson would otherwise debit twice.
--         The scan page then gets 23505 exactly as today; a manager corrects via the class roll call.
-- Session counting is unchanged: the legacy attendance_apply_change trigger debits one session per
-- Present row and credits it back on Absent/delete; 0003 records every change in the audit trail.
--
-- DATA IMPACT: no rows change. Existing rows already satisfy the stricter old rule, so the new
-- indexes build without conflicts. Rollback refuses (and changes nothing) once any package has two
-- rows on one day, because restoring the old constraint would then require deleting attendance.
-- =====================================================================================
begin;

create unique index if not exists attendance_pkg_class_date_uq
  on public.attendance (package_id, class_id, date) where class_id is not null;
create unique index if not exists attendance_pkg_date_classless_uq
  on public.attendance (package_id, date) where class_id is null;

create or replace function public.cr360_attendance_day_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- serialise writers for one package+day so the existence checks below cannot race
  perform pg_advisory_xact_lock(hashtextextended('cr360_att:' || new.package_id::text || ':' || new.date::text, 0));
  if new.class_id is null then
    if exists (select 1 from public.attendance a
               where a.package_id = new.package_id and a.date = new.date and a.id <> new.id) then
      raise exception 'attendance already recorded for this package on %', new.date using errcode = '23505';
    end if;
  elsif exists (select 1 from public.attendance a
                where a.package_id = new.package_id and a.date = new.date and a.class_id is null and a.id <> new.id) then
    raise exception 'a check-in without a class exists for this package on %; correct that record first', new.date
      using errcode = '23505';
  end if;
  return new;
end $$;
revoke all on function public.cr360_attendance_day_guard() from public, anon, authenticated;

drop trigger if exists cr360_attendance_day_guard on public.attendance;
create trigger cr360_attendance_day_guard before insert or update of package_id, date, class_id on public.attendance
  for each row execute function public.cr360_attendance_day_guard();

alter table public.attendance drop constraint if exists attendance_package_id_date_key;

commit;

-- Pre-flight (read-only): select count(*) from public.attendance;   -- note the number; unchanged after
-- Verification (staging, as a teacher): mark Present in two different classes on one day -> 2 rows,
-- sessions_used +2; mark the same class twice -> second is 23505 / no-op; Quick Scan after a roll call -> 23505.
