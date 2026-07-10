-- =====================================================================
-- 016: Package sizes, student status, discount/bonus, USD default
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Package sizes reference table
-- ---------------------------------------------------------------------
create table if not exists package_sizes (
  code    text primary key,          -- S, M, L, TRIAL, CAMP, SPECIAL
  label   text not null,             -- Small, Medium, Large, Trial, Camp, Special
  sessions int,                       -- null for SPECIAL (user enters custom)
  sort_order int default 0
);

insert into package_sizes (code, label, sessions, sort_order) values
  ('TRIAL', 'Trial',    4,  1),
  ('S',     'Small',   16,  2),
  ('M',     'Medium',  32,  3),
  ('L',     'Large',   48,  4),
  ('CAMP',  'Camp',     8,  5),
  ('SPECIAL','Special', null, 6)
on conflict (code) do nothing;

-- Grant read access
alter table package_sizes enable row level security;
drop policy if exists p_pkgsizes_read on package_sizes;
create policy p_pkgsizes_read on package_sizes for select using (true);
grant select on package_sizes to anon, authenticated;

-- Admin/co_admin can manage
drop policy if exists p_pkgsizes_write on package_sizes;
create policy p_pkgsizes_write on package_sizes for all
  using (my_role() in ('admin','co_admin'))
  with check (my_role() in ('admin','co_admin'));

-- ---------------------------------------------------------------------
-- 2. Add new columns to student_packages
-- ---------------------------------------------------------------------

-- Package size code (S/M/L/TRIAL/CAMP/SPECIAL)
alter table student_packages add column if not exists package_size text;

-- Student status: Active / Passive / Inactive (replaces boolean 'active')
alter table student_packages add column if not exists student_status text default 'Active'
  check (student_status in ('Active','Passive','Inactive'));

-- Discount & bonus
alter table student_packages add column if not exists discount_percent numeric default 0;
alter table student_packages add column if not exists bonus_sessions int default 0;
alter table student_packages add column if not exists base_sessions int;

-- Gender
alter table student_packages add column if not exists gender text;

-- Admission/registration date (separate from package start_date)
alter table student_packages add column if not exists admission_date date;

-- Migrate existing boolean 'active' → student_status
update student_packages set student_status = 'Active' where active = true and student_status is null;
update student_packages set student_status = 'Inactive' where active = false and student_status is null;

-- Set base_sessions from sessions_total where not yet set
update student_packages set base_sessions = sessions_total where base_sessions is null;

-- ---------------------------------------------------------------------
-- 3. Add discount & bonus to invoices
-- ---------------------------------------------------------------------
alter table invoices add column if not exists discount_percent numeric default 0;
alter table invoices add column if not exists bonus_sessions int default 0;
alter table invoices add column if not exists original_amount numeric;
alter table invoices add column if not exists package_size text;

-- ---------------------------------------------------------------------
-- 4. Default currency setting (USD)
-- ---------------------------------------------------------------------
insert into settings (key, value) values ('default_currency', '"USD"')
  on conflict (key) do update set value = '"USD"';

-- ---------------------------------------------------------------------
-- 5. Update v_parent_portal to include new fields
-- ---------------------------------------------------------------------
create or replace view v_parent_portal as
select
  sp.id                as package_id,
  sp.public_token,
  sp.student_name,
  sp.parent_name,
  sp.phone,
  sp.package,
  sp.package_size,
  sp.photo_url,
  sp.date_of_birth,
  sp.gender,
  sp.sessions_total,
  sp.sessions_used,
  sp.base_sessions,
  sp.bonus_sessions,
  sp.discount_percent,
  sp.student_status,
  greatest(0, sp.sessions_total - sp.sessions_used) as sessions_left,
  sp.start_date,
  sp.admission_date,
  sp.active,
  sp.branch_id,
  sp.program_id,
  b.name               as branch_name,
  p.name               as program_name,
  rc.id                as class_id,
  rc.name              as class_name,
  rc.day_of_week       as class_day,
  rc.start_time        as class_start,
  rc.end_time          as class_end,
  rc.room              as class_room,
  rc_teacher.name      as class_teacher
from student_packages sp
left join branches b on b.id = sp.branch_id
left join programs p on p.id = sp.program_id
left join class_bookings rcb on rcb.package_id = sp.id and rcb.kind = 'regular' and rcb.status = 'Confirmed'
left join classes rc on rc.id = rcb.class_id
left join users rc_teacher on rc_teacher.id = rc.teacher_id;

grant select on v_parent_portal to anon, authenticated;
