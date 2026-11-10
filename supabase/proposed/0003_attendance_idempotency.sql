-- =====================================================================================
-- PROPOSED — NOT APPLIED. Requires CEO approval. Staging first.
-- Rollback: 0003_attendance_idempotency.rollback.sql
--
-- Legacy attendance mutates student_packages.sessions_used directly (trigger
-- attendance_apply_change) and nothing prevents two "Present" rows for the same package,
-- class and date -> a double tap deducts two sessions. This migration is the minimal,
-- compatible step toward the ledger model in lib/cr360/ledger.ts:
--   1. DB-enforced idempotency: at most one Present per (package, class, date).
--   2. Append-only audit of every attendance change (who/when/before/after), so the
--      sessions_used counter can be reconciled and later replaced by a derived balance.
-- Does NOT modify or delete existing rows.
-- =====================================================================================

-- PRE-FLIGHT (must return 0 rows before applying; if not, resolve duplicates by review — never auto-delete):
--   select package_id, class_id, date, count(*) from public.attendance
--   where status = 'Present' group by 1,2,3 having count(*) > 1;

begin;

create unique index if not exists attendance_one_present_per_class_day
  on public.attendance (package_id, coalesce(class_id, '00000000-0000-0000-0000-000000000000'::uuid), date)
  where status = 'Present';

create schema if not exists cr360_audit;
revoke all on schema cr360_audit from public, anon, authenticated;

create table if not exists cr360_audit.attendance_changes (
  id bigint generated always as identity primary key,
  attendance_id uuid not null,
  op text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  actor uuid,
  at timestamptz not null default now(),
  old_status text,
  new_status text,
  package_id uuid,
  class_id uuid,
  att_date date
);
revoke all on cr360_audit.attendance_changes from public, anon, authenticated;

create or replace function cr360_audit.log_attendance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into cr360_audit.attendance_changes (attendance_id, op, actor, old_status, new_status, package_id, class_id, att_date)
  values (
    coalesce(new.id, old.id), tg_op, auth.uid(),
    case when tg_op <> 'INSERT' then old.status end,
    case when tg_op <> 'DELETE' then new.status end,
    coalesce(new.package_id, old.package_id), coalesce(new.class_id, old.class_id), coalesce(new.date, old.date)
  );
  return coalesce(new, old);
end;
$$;
revoke all on function cr360_audit.log_attendance() from public, anon, authenticated;

drop trigger if exists attendance_audit on public.attendance;
create trigger attendance_audit after insert or update or delete on public.attendance
  for each row execute function cr360_audit.log_attendance();

-- Prevent append-only tampering (even by table owner via API roles).
create or replace function cr360_audit.no_mutation() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'audit log is append-only' using errcode = '42501'; end; $$;
drop trigger if exists attendance_changes_immutable on cr360_audit.attendance_changes;
create trigger attendance_changes_immutable before update or delete on cr360_audit.attendance_changes
  for each row execute function cr360_audit.no_mutation();

commit;
