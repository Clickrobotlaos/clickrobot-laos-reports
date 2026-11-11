-- Rollback for 0015: drops the functions and policy. Achievement records and the certificate counter
-- are kept (issued certificates must stay verifiable); dropping them needs explicit owner approval.
begin;
drop function if exists public.cr360_guardian_achievements(text);
drop function if exists public.cr360_achievement_decide(uuid, text, text);
drop function if exists public.cr360_achievement_propose(uuid, text, text, text, text, date, text);
drop policy if exists cr360_achievements_staff_read on public.cr360_achievements;
drop function if exists cr360_authz.can_see_achievement(text, uuid);
drop function if exists cr360_authz.teaches_package(uuid);
commit;
