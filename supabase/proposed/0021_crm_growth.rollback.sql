-- Rollback for 0021: drops functions and policies; campaigns, attributions and rewards are kept.
begin;
drop function if exists public.cr360_referral_board();
drop function if exists public.cr360_campaign_report(date, date);
drop function if exists public.cr360_referral_reward(uuid, text, text);
drop function if exists public.cr360_lead_attribute(uuid, uuid, text);
drop function if exists public.cr360_campaign_save(uuid, text, text, uuid, date, date, numeric, numeric);
drop policy if exists cr360_referral_rewards_read on public.cr360_referral_rewards;
drop policy if exists cr360_lead_attribution_read on public.cr360_lead_attribution;
drop policy if exists cr360_campaigns_read on public.cr360_campaigns;
commit;
