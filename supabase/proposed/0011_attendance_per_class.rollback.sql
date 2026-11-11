-- Rollback for 0011: restores UNIQUE(package_id, date). Refuses if multi-class days already exist
-- (restoring the old rule would require deleting real attendance; that is never done here).
begin;
do $$ begin
  if exists (select 1 from public.attendance group by package_id, date having count(*) > 1) then
    raise exception 'rollback refused: some packages have more than one attendance row on a day (decision C in use). Resolve with the owner first.';
  end if;
end $$;
alter table public.attendance drop constraint if exists attendance_package_id_date_key;
alter table public.attendance add constraint attendance_package_id_date_key unique (package_id, date);
drop trigger if exists cr360_attendance_day_guard on public.attendance;
drop function if exists public.cr360_attendance_day_guard();
drop index if exists public.attendance_pkg_class_date_uq;
drop index if exists public.attendance_pkg_date_classless_uq;
commit;
