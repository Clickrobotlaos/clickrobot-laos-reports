-- =====================================================================
-- Class management module — foundation (Phase 1)
-- Weekly class slots + student enrollment + makeup bookings
-- =====================================================================

-- ---------------------------------------------------------------------
-- classes: the weekly recurring slot definitions
-- ---------------------------------------------------------------------
create table if not exists classes (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,                    -- "LEGO Essential — Sat 10am Beginner"
  program_id        uuid references programs(id),
  branch_id         uuid references branches(id) not null,
  teacher_id        uuid references users(id),
  assistant_id      uuid references users(id),
  day_of_week       int check (day_of_week between 0 and 6),  -- 0=Sun ... 6=Sat
  start_time        time,
  end_time          time,
  room              text,
  capacity          int,
  age_min           int,
  age_max           int,
  level             text,                              -- Beginner / Intermediate / Advanced
  class_fee         numeric,
  fee_currency      text default 'LAK',
  active            boolean not null default true,
  notes             text,
  created_at        timestamptz default now()
);

create index if not exists ix_classes_active_day on classes (day_of_week) where active = true;
create index if not exists ix_classes_branch on classes (branch_id);
create index if not exists ix_classes_teacher on classes (teacher_id);

-- ---------------------------------------------------------------------
-- class_bookings: link student packages to classes
-- Two kinds: 'regular' (permanent weekly) and 'makeup' (one-time date)
-- ---------------------------------------------------------------------
create table if not exists class_bookings (
  id             uuid primary key default gen_random_uuid(),
  class_id       uuid references classes(id) on delete cascade not null,
  package_id     uuid references student_packages(id) on delete cascade not null,
  kind           text not null check (kind in ('regular','makeup')),
  makeup_date    date,                    -- required for kind='makeup', null for 'regular'
  status         text not null default 'Confirmed'
                 check (status in ('Confirmed','Cancelled','Attended','No-show')),
  booked_by      uuid references users(id),
  booked_at      timestamptz default now(),
  cancelled_at   timestamptz,
  notes          text,
  -- rules:
  -- one regular class per package (student's home slot)
  constraint uniq_regular_per_pkg
    exclude (package_id with =) where (kind = 'regular' and status = 'Confirmed'),
  -- one makeup booking per package per date
  constraint uniq_makeup_per_pkg_date
    exclude (package_id with =, makeup_date with =)
    where (kind = 'makeup' and status = 'Confirmed')
);

create index if not exists ix_bk_class on class_bookings (class_id);
create index if not exists ix_bk_pkg on class_bookings (package_id);
create index if not exists ix_bk_date on class_bookings (makeup_date);

-- ---------------------------------------------------------------------
-- attendance: add optional class_id link so we know WHICH class the
-- attendance was for (regular slot or makeup)
-- ---------------------------------------------------------------------
alter table attendance add column if not exists class_id uuid references classes(id);
alter table attendance add column if not exists is_makeup boolean default false;

-- ---------------------------------------------------------------------
-- Capacity check for bookings — raises exception if class is full
-- Counts: enrolled regulars + confirmed makeups for the target date
-- ---------------------------------------------------------------------
create or replace function check_class_capacity()
returns trigger language plpgsql as $$
declare
  cap int;
  filled int;
  target_date date;
begin
  select capacity into cap from classes where id = new.class_id;
  if cap is null or cap = 0 then return new; end if;

  if new.kind = 'regular' then
    select count(*) into filled from class_bookings
      where class_id = new.class_id and kind = 'regular' and status = 'Confirmed'
      and id <> new.id;
    if filled >= cap then
      raise exception 'This class is at full capacity (% of %)', filled, cap;
    end if;
  else
    target_date := new.makeup_date;
    -- regular seats + already-booked makeups on that date
    select
      (select count(*) from class_bookings where class_id = new.class_id and kind = 'regular' and status = 'Confirmed')
      +
      (select count(*) from class_bookings where class_id = new.class_id and kind = 'makeup' and status = 'Confirmed' and makeup_date = target_date and id <> new.id)
    into filled;
    if filled >= cap then
      raise exception 'No space in this class on % (% of %)', target_date, filled, cap;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_class_capacity on class_bookings;
create trigger trg_class_capacity
  before insert or update on class_bookings
  for each row execute function check_class_capacity();

-- ---------------------------------------------------------------------
-- Helper views
-- ---------------------------------------------------------------------

-- All classes today (based on server date's day_of_week)
create or replace view v_classes_today as
select
  c.*,
  b.name as branch_name,
  p.name as program_name,
  u.name as teacher_name,
  ua.name as assistant_name,
  (select count(*) from class_bookings cb
     where cb.class_id = c.id and cb.kind = 'regular' and cb.status = 'Confirmed') as regular_count,
  (select count(*) from class_bookings cb
     where cb.class_id = c.id and cb.kind = 'makeup' and cb.status = 'Confirmed'
     and cb.makeup_date = current_date) as makeup_count
from classes c
left join branches b on b.id = c.branch_id
left join programs p on p.id = c.program_id
left join users u on u.id = c.teacher_id
left join users ua on ua.id = c.assistant_id
where c.active = true
  and c.day_of_week = extract(dow from current_date);

-- Students in a class today (regulars + confirmed makeups for today)
create or replace view v_class_today_roster as
select
  cb.class_id,
  cb.id                    as booking_id,
  cb.kind,
  cb.status                as booking_status,
  cb.makeup_date,
  sp.id                    as package_id,
  sp.student_name,
  sp.parent_name,
  sp.phone,
  sp.photo_url,
  sp.sessions_total,
  sp.sessions_used,
  greatest(0, sp.sessions_total - sp.sessions_used) as sessions_left,
  a.id                     as attendance_id,
  a.status                 as attendance_status
from class_bookings cb
join student_packages sp on sp.id = cb.package_id
left join attendance a
  on a.package_id = sp.id and a.date = current_date
where cb.status = 'Confirmed'
  and (
    cb.kind = 'regular' or
    (cb.kind = 'makeup' and cb.makeup_date = current_date)
  );

-- Classes taught count per teacher this month (for payroll)
create or replace view v_teacher_month_classes as
select
  c.teacher_id,
  to_char(a.date, 'YYYY-MM') as month,
  count(distinct (c.id, a.date)) as sessions_taught
from attendance a
join classes c on c.id = a.class_id
where a.status = 'Present' and c.teacher_id is not null
group by c.teacher_id, to_char(a.date, 'YYYY-MM');

-- ---------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------
alter table classes enable row level security;
alter table class_bookings enable row level security;

drop policy if exists p_classes_read on classes;
create policy p_classes_read on classes for select using (auth.uid() is not null);

drop policy if exists p_classes_write on classes;
create policy p_classes_write on classes for all
  using (my_role() in ('admin','manager')) with check (my_role() in ('admin','manager'));

drop policy if exists p_bookings_read on class_bookings;
create policy p_bookings_read on class_bookings for select using (auth.uid() is not null);

drop policy if exists p_bookings_write on class_bookings;
create policy p_bookings_write on class_bookings for all
  using (my_role() in ('admin','manager','finance','staff'))
  with check (my_role() in ('admin','manager','finance','staff'));

-- allow anonymous read on classes for parent portal
grant select on classes to anon;
grant select on class_bookings to anon;
grant select on v_classes_today to anon, authenticated;
grant select on v_class_today_roster to anon, authenticated;

-- ---------------------------------------------------------------------
-- Extend parent portal view with regular class info + upcoming makeups
-- ---------------------------------------------------------------------
create or replace view v_parent_portal as
select
  sp.id                as package_id,
  sp.public_token,
  sp.student_name,
  sp.parent_name,
  sp.phone,
  sp.package,
  sp.photo_url,
  sp.date_of_birth,
  sp.sessions_total,
  sp.sessions_used,
  greatest(0, sp.sessions_total - sp.sessions_used) as sessions_left,
  sp.start_date,
  sp.active,
  sp.branch_id,
  sp.program_id,
  b.name               as branch_name,
  p.name               as program_name,
  -- regular class info
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

-- Upcoming makeup bookings for parent portal
create or replace view v_parent_makeups as
select
  cb.id as booking_id,
  cb.makeup_date,
  cb.status,
  c.name as class_name,
  c.start_time,
  c.end_time,
  c.room,
  b.name as branch_name,
  sp.public_token
from class_bookings cb
join classes c on c.id = cb.class_id
left join branches b on b.id = c.branch_id
join student_packages sp on sp.id = cb.package_id
where cb.kind = 'makeup' and cb.status = 'Confirmed'
  and cb.makeup_date >= current_date;

grant select on v_parent_makeups to anon, authenticated;

-- ---------------------------------------------------------------------
-- Settings toggles for optional class fields
-- ---------------------------------------------------------------------
insert into settings (key, value) values ('class_fields', '{"capacity":true,"age":true,"level":true,"fee":true,"room":true}')
  on conflict (key) do nothing;
