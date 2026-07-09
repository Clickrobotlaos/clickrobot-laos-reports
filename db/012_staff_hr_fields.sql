-- =====================================================================
-- Staff Directory — HR profile extensions
-- Personal identity, education, expanded employment, contract, address
-- =====================================================================

-- ---------------------------- Personal ------------------------------
alter table users add column if not exists date_of_birth   date;
alter table users add column if not exists nationality     text;
alter table users add column if not exists gender          text;
alter table users add column if not exists marital_status  text;

alter table users drop constraint if exists users_gender_check;
alter table users add constraint users_gender_check
  check (gender is null or gender in ('Male','Female','Prefer not to say'));

alter table users drop constraint if exists users_marital_check;
alter table users add constraint users_marital_check
  check (marital_status is null or marital_status in ('Single','Married','Divorced','Widowed'));

-- ---------------------------- Education -----------------------------
alter table users add column if not exists degree           text;
alter table users add column if not exists field_of_study   text;
alter table users add column if not exists university       text;
alter table users add column if not exists graduation_year  int;

-- ---------------------------- Employment ----------------------------
alter table users add column if not exists workplace         text;
alter table users add column if not exists employment_type   text;
alter table users add column if not exists work_schedule     text;

alter table users drop constraint if exists users_emptype_check;
alter table users add constraint users_emptype_check
  check (employment_type is null or employment_type in ('Full-time','Part-time','Contract','Intern'));

-- ---------------------------- Contract ------------------------------
alter table users add column if not exists contract_start    date;
alter table users add column if not exists contract_end      date;
alter table users add column if not exists contract_type     text;
alter table users add column if not exists contract_url      text;

alter table users drop constraint if exists users_contracttype_check;
alter table users add constraint users_contracttype_check
  check (contract_type is null or contract_type in ('Permanent','Fixed-term','Renewable'));

-- ---------------------------- Address (expanded) --------------------
alter table users add column if not exists permanent_address text;
alter table users add column if not exists city              text;
alter table users add column if not exists province          text;

-- ---------------------------------------------------------------------
-- Privacy: date_of_birth visible to admin OR the staff themself.
-- We enforce this at the app layer since Supabase RLS can only allow/deny
-- entire rows, not individual columns. The app will hide DOB unless
-- the caller is admin or looking at their own profile.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- View: contracts expiring in the next 30 days
-- ---------------------------------------------------------------------
create or replace view v_contracts_expiring as
select id, name, position, contract_end,
       (contract_end - current_date) as days_left
from users
where contract_end is not null
  and contract_end >= current_date
  and contract_end <= current_date + interval '30 days'
  and status <> 'Terminated';
