-- =====================================================================
-- ClickRobot Laos — Sessions & Attendance module
-- Run once in Supabase SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Student packages: one row per paid enrolment (created from paid invoice)
-- ---------------------------------------------------------------------
create table if not exists student_packages (
  id                 uuid primary key default gen_random_uuid(),
  invoice_id         uuid references invoices(id),
  student_name       text not null,
  parent_name        text,
  phone              text,
  branch_id          uuid references branches(id) not null,
  program_id         uuid references programs(id) not null,
  package            text,
  sessions_total     int not null,
  sessions_used      int not null default 0,
  start_date         date not null default current_date,
  active             boolean not null default true,
  created_by         uuid references users(id),
  created_at         timestamptz default now()
);

create index if not exists ix_pkg_branch_program on student_packages (branch_id, program_id) where active = true;
create index if not exists ix_pkg_active on student_packages (active);

-- ---------------------------------------------------------------------
-- Attendance records — one row per (package, session date)
-- ---------------------------------------------------------------------
create table if not exists attendance (
  id                 uuid primary key default gen_random_uuid(),
  package_id         uuid references student_packages(id) on delete cascade not null,
  date               date not null default current_date,
  status             text not null check (status in ('Present','Absent')),
  notes              text,
  recorded_by        uuid references users(id),
  created_at         timestamptz default now(),
  -- one attendance record per package per date
  unique (package_id, date)
);

create index if not exists ix_att_date on attendance (date desc);
create index if not exists ix_att_pkg on attendance (package_id);

-- ---------------------------------------------------------------------
-- Trigger: keep sessions_used in sync automatically
-- Present = +1 session used ; Absent = 0
-- ---------------------------------------------------------------------
create or replace function attendance_apply_change()
returns trigger language plpgsql as $$
declare
  used_delta int := 0;
begin
  if tg_op = 'INSERT' then
    used_delta := case when new.status = 'Present' then 1 else 0 end;
  elsif tg_op = 'UPDATE' then
    used_delta := (case when new.status = 'Present' then 1 else 0 end)
                - (case when old.status = 'Present' then 1 else 0 end);
  elsif tg_op = 'DELETE' then
    used_delta := -(case when old.status = 'Present' then 1 else 0 end);
    update student_packages
       set sessions_used = greatest(0, sessions_used + used_delta)
     where id = old.package_id;
    return old;
  end if;

  update student_packages
     set sessions_used = greatest(0, sessions_used + used_delta),
         active = case when sessions_used + used_delta >= sessions_total then false else active end
   where id = new.package_id;
  return new;
end;
$$;

drop trigger if exists trg_attendance_apply on attendance;
create trigger trg_attendance_apply
  after insert or update or delete on attendance
  for each row execute function attendance_apply_change();

-- ---------------------------------------------------------------------
-- When an invoice is marked Paid, auto-create the matching student_package
-- ---------------------------------------------------------------------
create or replace function invoice_paid_create_package()
returns trigger language plpgsql as $$
begin
  if new.status = 'Paid' and (old.status is distinct from 'Paid')
     and new.sessions is not null and new.sessions > 0 then
    -- avoid duplicates
    if not exists (select 1 from student_packages where invoice_id = new.id) then
      insert into student_packages (
        invoice_id, student_name, parent_name, phone,
        branch_id, program_id, package,
        sessions_total, start_date, created_by
      ) values (
        new.id, new.student_name, new.parent_name, new.phone,
        new.branch_id, new.program_id, new.package,
        new.sessions, current_date, new.paid_by
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_invoice_paid_pkg on invoices;
create trigger trg_invoice_paid_pkg
  after update on invoices
  for each row execute function invoice_paid_create_package();

-- Backfill: any already-paid invoice with sessions gets a package now
insert into student_packages (
  invoice_id, student_name, parent_name, phone,
  branch_id, program_id, package,
  sessions_total, start_date, created_by
)
select i.id, i.student_name, i.parent_name, i.phone,
       i.branch_id, i.program_id, i.package,
       i.sessions, coalesce(i.paid_at::date, i.date), i.paid_by
from invoices i
where i.status = 'Paid' and i.sessions is not null and i.sessions > 0
  and not exists (select 1 from student_packages sp where sp.invoice_id = i.id);

-- ---------------------------------------------------------------------
-- Convenience view: what staff need on the "Class today" screen
-- ---------------------------------------------------------------------
create or replace view v_packages_today as
select
  sp.id, sp.student_name, sp.parent_name, sp.phone,
  sp.branch_id, sp.program_id, sp.package,
  sp.sessions_total, sp.sessions_used,
  greatest(0, sp.sessions_total - sp.sessions_used) as sessions_left,
  a.id                  as attendance_id,
  a.status              as attendance_status,
  a.date                as attendance_date
from student_packages sp
left join attendance a
  on a.package_id = sp.id and a.date = current_date
where sp.active = true;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table student_packages enable row level security;
alter table attendance enable row level security;

drop policy if exists p_pkg_read on student_packages;
create policy p_pkg_read on student_packages for select using (auth.uid() is not null);
drop policy if exists p_pkg_write on student_packages;
create policy p_pkg_write on student_packages for all
  using (my_role() in ('staff','finance','admin'))
  with check (my_role() in ('staff','finance','admin'));

drop policy if exists p_att_read on attendance;
create policy p_att_read on attendance for select using (auth.uid() is not null);
drop policy if exists p_att_write on attendance;
create policy p_att_write on attendance for all
  using (my_role() in ('staff','finance','admin'))
  with check (my_role() in ('staff','finance','admin'));
