-- =====================================================================
-- Staff Directory — extend users table into a full staff profile
-- =====================================================================

-- Add all the profile columns
alter table users add column if not exists position         text;
alter table users add column if not exists photo_url        text;
alter table users add column if not exists status           text default 'Active';
alter table users add column if not exists start_date       date;
alter table users add column if not exists end_date         date;
alter table users add column if not exists base_salary      numeric;
alter table users add column if not exists salary_currency  text default 'LAK';
alter table users add column if not exists bank_name        text;
alter table users add column if not exists bank_account_no  text;
alter table users add column if not exists emergency_contact text;
alter table users add column if not exists id_card          text;
alter table users add column if not exists address          text;
alter table users add column if not exists notes            text;

-- New role: contractor (no login access, just profile)
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role in ('admin','manager','finance','staff','viewer','contractor'));

-- Status must be one of these
alter table users drop constraint if exists users_status_check;
alter table users add constraint users_status_check
  check (status in ('Active','On leave','Terminated'));

-- ---------------------------------------------------------------------
-- Link payroll to staff for easier lookup
-- ---------------------------------------------------------------------
alter table salary_payroll add column if not exists user_id uuid references users(id);
create index if not exists ix_payroll_user on salary_payroll (user_id);

-- Backfill: try to match old payroll rows to users by name where possible
update salary_payroll sp
   set user_id = u.id
  from users u
 where sp.user_id is null
   and lower(trim(sp.staff_name)) = lower(trim(u.name));

-- ---------------------------------------------------------------------
-- RLS updates
-- ---------------------------------------------------------------------
-- Users can see their OWN profile always; admins see everyone (already covered by p_users_read).
-- Nothing to change here since p_users_read already allows any auth user to read
-- (this is fine — staff need to see each other's names for reports/attendance).

-- For UPDATE: admins already have p_users_admin_write.
-- Also let staff update their OWN profile (limited fields via app).
drop policy if exists p_users_self_update on users;
create policy p_users_self_update on users for update
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------
-- Seed: give CEO a default profile
-- ---------------------------------------------------------------------
update users
   set position = coalesce(position, 'CEO / Founder'),
       status = coalesce(status, 'Active')
 where role = 'admin' and (position is null or status is null);
