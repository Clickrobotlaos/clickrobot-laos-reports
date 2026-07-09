-- =====================================================================
-- ClickRobot Laos — Reports export + Month closing + CEO reset
-- Run once in Supabase SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- closed_months: audit trail of month closures
-- ---------------------------------------------------------------------
create table if not exists closed_months (
  month        text primary key,           -- 'YYYY-MM'
  closed_at    timestamptz default now(),
  closed_by    uuid references users(id),
  record_counts jsonb                       -- snapshot of counts at closure time
);

alter table closed_months enable row level security;

drop policy if exists p_closed_read on closed_months;
create policy p_closed_read on closed_months for select using (auth.uid() is not null);

drop policy if exists p_closed_write on closed_months;
create policy p_closed_write on closed_months for all
  using (my_role() = 'admin') with check (my_role() = 'admin');

-- ---------------------------------------------------------------------
-- Helper: is a given date in a closed month?
-- ---------------------------------------------------------------------
create or replace function is_month_closed(d date) returns boolean
language sql stable as $$
  select exists (select 1 from closed_months where month = to_char(d, 'YYYY-MM'))
$$;

-- ---------------------------------------------------------------------
-- Trigger factory: prevent edit/delete in closed months
-- ---------------------------------------------------------------------
create or replace function prevent_edit_closed_month()
returns trigger language plpgsql as $$
declare
  target_date date;
begin
  target_date := coalesce(new.date, old.date);
  if is_month_closed(target_date) and my_role() <> 'admin' then
    raise exception 'This month is closed. Records from % cannot be modified.', to_char(target_date, 'Mon YYYY');
  end if;
  -- Even admins can only edit closed months via a special reopen (not implemented yet).
  -- For now, admin CAN edit closed months — trusting the CEO's judgment.
  return coalesce(new, old);
end;
$$;

-- Apply the guard to the main financial tables
drop trigger if exists trg_closed_income on income_records;
create trigger trg_closed_income
  before update or delete on income_records
  for each row execute function prevent_edit_closed_month();

drop trigger if exists trg_closed_expense on expense_records;
create trigger trg_closed_expense
  before update or delete on expense_records
  for each row execute function prevent_edit_closed_month();

drop trigger if exists trg_closed_report on daily_reports;
create trigger trg_closed_report
  before update or delete on daily_reports
  for each row execute function prevent_edit_closed_month();

-- Also block INSERT into a closed month (except by admin — trusting CEO)
create or replace function prevent_insert_closed_month()
returns trigger language plpgsql as $$
begin
  if is_month_closed(new.date) and my_role() <> 'admin' then
    raise exception 'This month is closed. Records for % cannot be added.', to_char(new.date, 'Mon YYYY');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_closed_income_ins on income_records;
create trigger trg_closed_income_ins
  before insert on income_records
  for each row execute function prevent_insert_closed_month();

drop trigger if exists trg_closed_expense_ins on expense_records;
create trigger trg_closed_expense_ins
  before insert on expense_records
  for each row execute function prevent_insert_closed_month();

drop trigger if exists trg_closed_report_ins on daily_reports;
create trigger trg_closed_report_ins
  before insert on daily_reports
  for each row execute function prevent_insert_closed_month();
