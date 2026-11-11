-- =====================================================================================
-- PROPOSED — NOT APPLIED. Requires CEO approval. Apply AFTER 0005 (guardian links). Staging first.
-- Rollback: 0014_guardian_schedule_and_billing.rollback.sql
--
-- Parent portal: upcoming classes (next 14 days) and invoices/payments for a VERIFIED child.
--  * Read-only functions; parents still get no table access. No rows change on apply.
--  * Invoices have no student code in the legacy schema; matching by name/phone is unsafe (ADR-012),
--    so a parent sees exactly the invoices linked to their child's packages (student_packages.invoice_id).
--    Open invoices not yet linked to a package do not appear (stated in the portal).
--  * No share tokens, internal notes, staff ids or exchange-rate internals are returned.
-- =====================================================================================
begin;

create or replace function public.cr360_guardian_schedule(p_student_code text)
returns table (class_date date, start_time time, end_time time, class_name text, room text, branch_name text, kind text)
language sql stable security definer set search_path = '' as $$
  with kid as (
    select p.id from public.student_packages p
     where p.student_id = p_student_code and p.active and cr360_authz.is_verified_guardian_of(p_student_code)),
  days as (
    select (now() at time zone 'Asia/Vientiane')::date + g as d from generate_series(0, 13) g)
  select d.d, c.start_time, c.end_time, c.name, c.room, b.name, 'regular'
    from days d
    join public.classes c on c.active and c.day_of_week = extract(dow from d.d)::int
    join public.class_bookings k on k.class_id = c.id and k.kind = 'regular' and k.status = 'Confirmed'
    join kid on kid.id = k.package_id
    left join public.branches b on b.id = c.branch_id
  union
  select k.makeup_date, c.start_time, c.end_time, c.name, c.room, b.name, 'makeup'
    from public.class_bookings k
    join kid on kid.id = k.package_id
    join public.classes c on c.id = k.class_id and c.active
    left join public.branches b on b.id = c.branch_id
   where k.kind = 'makeup' and k.status = 'Confirmed'
     and k.makeup_date between (now() at time zone 'Asia/Vientiane')::date and (now() at time zone 'Asia/Vientiane')::date + 13
  order by 1, 2
$$;

create or replace function public.cr360_guardian_invoices(p_student_code text)
returns table (invoice_no text, invoice_date date, due_date date, package text, sessions integer,
               amount numeric, currency text, status text, paid_at timestamptz, payment_method text)
language sql stable security definer set search_path = '' as $$
  select distinct i.invoice_no, i.date, i.due_date, i.package, i.sessions, i.amount, i.currency, i.status, i.paid_at, i.payment_method
    from public.student_packages p
    join public.invoices i on i.id = p.invoice_id
   where p.student_id = p_student_code and cr360_authz.is_verified_guardian_of(p_student_code)
     and i.status <> 'Draft'
   order by i.date desc
   limit 100
$$;

revoke all on function public.cr360_guardian_schedule(text) from public, anon;
revoke all on function public.cr360_guardian_invoices(text) from public, anon;
grant execute on function public.cr360_guardian_schedule(text) to authenticated;
grant execute on function public.cr360_guardian_invoices(text) to authenticated;
commit;
