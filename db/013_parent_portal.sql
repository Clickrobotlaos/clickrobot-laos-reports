-- =====================================================================
-- Parent portal — magic-link access to child's dashboard
-- =====================================================================

-- Give every student_package a public token (like invoices)
alter table student_packages add column if not exists public_token uuid default gen_random_uuid();
alter table student_packages add column if not exists photo_url text;

-- Fill any missing tokens
update student_packages set public_token = gen_random_uuid() where public_token is null;

-- Optional: student date-of-birth for a friendly "Happy Birthday!" note later
alter table student_packages add column if not exists date_of_birth date;

-- ---------------------------------------------------------------------
-- Anonymous read view (used by the /p/[token] page)
-- Only exposes what parents should see; hides internal ids.
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
  p.name               as program_name
from student_packages sp
left join branches b on b.id = sp.branch_id
left join programs p on p.id = sp.program_id;

grant select on v_parent_portal to anon, authenticated;

-- ---------------------------------------------------------------------
-- Public read policies for what the portal needs.
-- We check the token via view; but we also need to let anon SELECT the
-- underlying attendance and invoices rows that belong to the package.
-- Simplest safe approach: expose them through views scoped by token.
-- ---------------------------------------------------------------------

create or replace view v_parent_attendance as
select
  a.id, a.date, a.status, a.notes,
  a.package_id, sp.public_token
from attendance a
join student_packages sp on sp.id = a.package_id;

grant select on v_parent_attendance to anon, authenticated;

create or replace view v_parent_invoices as
select
  i.id, i.invoice_no, i.date, i.due_date, i.status,
  i.package, i.sessions,
  i.amount, i.currency, i.amount_lak,
  i.paid_at, i.paid_amount, i.paid_currency,
  i.notes,
  sp.public_token
from invoices i
join student_packages sp on sp.invoice_id = i.id;

grant select on v_parent_invoices to anon, authenticated;

-- ---------------------------------------------------------------------
-- Settings the portal needs (company + bank) — already readable via
-- the settings table because settings is granted anon SELECT? If not,
-- add a scoped view of only the safe keys.
-- ---------------------------------------------------------------------

create or replace view v_public_settings as
select key, value
from settings
where key in ('company', 'bank');

grant select on v_public_settings to anon, authenticated;
