-- Rollback for 0007. Payment rows already written stay (they are real business records).
begin;
drop function if exists public.cr360_mark_invoice_paid(uuid, text);
drop index if exists public.income_records_one_per_invoice;
commit;
