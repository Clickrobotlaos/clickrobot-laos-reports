-- Rollback for 0001. Restores the previous (VULNERABLE) state — use only if 0001 breaks a
-- legitimate workflow, and re-apply a corrected fix immediately.
begin;
drop trigger if exists users_guard_protected_columns on public.users;
drop function if exists public.users_guard_protected_columns();

grant execute on function public.admin_deep_reset() to anon, public;
grant execute on function public.admin_nuclear_reset() to anon, public;
-- Function bodies: the only behavioural change was the stricter NULL-safe guard + search_path;
-- leaving the fixed bodies in place is recommended even on rollback.

alter function public.my_role() reset search_path;
alter function public.prevent_edit_approved() reset search_path;
alter function public.next_invoice_no() reset search_path;
alter function public.attendance_apply_change() reset search_path;
alter function public.invoice_paid_create_package() reset search_path;
alter function public.is_month_closed(date) reset search_path;
alter function public.prevent_edit_closed_month() reset search_path;
alter function public.prevent_insert_closed_month() reset search_path;
alter function public.check_class_capacity() reset search_path;
commit;
