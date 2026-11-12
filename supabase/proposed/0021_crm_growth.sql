-- =====================================================================================
-- PROPOSED — NOT APPLIED. Requires CEO approval. Apply AFTER 0004, 0006, 0012 and 0020. Staging first.
-- Rollback: 0021_crm_growth.rollback.sql
--
-- Marketing campaigns, lead attribution and referral rewards. The legacy `leads` table is NOT altered.
--  * Campaigns: CEO (any / all branches) or branch manager (own branch).
--  * Attribution (one row per lead): campaign and/or referring student code; by active staff of the
--    lead's branch (or CEO). A referrer must be an existing student.
--  * Referral reward: only once the referred lead is Registered; branch manager / CEO approves, then
--    marks it given; or declines with a reason. Audited.
--  * Report: per campaign leads, trials, registrations, budget/spend, cost per lead / registration.
-- DATA IMPACT: three new tables; no existing rows change.
-- =====================================================================================
begin;

create table if not exists public.cr360_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  channel text not null check (channel in ('Facebook', 'TikTok', 'Flyer', 'Event', 'School visit', 'Referral', 'Other')),
  branch_id uuid references public.branches(id),
  starts_on date not null, ends_on date not null,
  budget_lak numeric(15,2) not null default 0 check (budget_lak >= 0),
  spent_lak numeric(15,2) not null default 0 check (spent_lak >= 0),
  created_by uuid not null, created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create table if not exists public.cr360_lead_attribution (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  campaign_id uuid references public.cr360_campaigns(id),
  referrer_student_code text,
  attributed_by uuid not null, attributed_at timestamptz not null default now(),
  check (campaign_id is not null or referrer_student_code is not null)
);
create table if not exists public.cr360_referral_rewards (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.leads(id),
  referrer_student_code text not null,
  branch_id uuid,
  reward text not null check (length(trim(reward)) between 2 and 200),
  status text not null default 'approved' check (status in ('approved', 'given', 'declined')),
  decided_by uuid not null, decided_at timestamptz not null default now(),
  given_by uuid, given_at timestamptz, note text
);
alter table public.cr360_campaigns enable row level security;
alter table public.cr360_lead_attribution enable row level security;
alter table public.cr360_referral_rewards enable row level security;
revoke all on public.cr360_campaigns, public.cr360_lead_attribution, public.cr360_referral_rewards from anon, authenticated;
grant select on public.cr360_campaigns, public.cr360_lead_attribution, public.cr360_referral_rewards to authenticated;
drop policy if exists cr360_campaigns_read on public.cr360_campaigns;
create policy cr360_campaigns_read on public.cr360_campaigns for select to authenticated using (cr360_authz.active_member());
drop policy if exists cr360_lead_attribution_read on public.cr360_lead_attribution;
create policy cr360_lead_attribution_read on public.cr360_lead_attribution for select to authenticated using (cr360_authz.active_member());
drop policy if exists cr360_referral_rewards_read on public.cr360_referral_rewards;
create policy cr360_referral_rewards_read on public.cr360_referral_rewards for select to authenticated using (cr360_authz.is_branch_manager(branch_id));

create or replace function public.cr360_campaign_save(p_id uuid, p_name text, p_channel text, p_branch uuid, p_from date, p_to date, p_budget numeric, p_spent numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; c public.cr360_campaigns%rowtype;
begin
  if cr360_authz.is_branch_manager(p_branch) is not true then raise exception 'access denied' using errcode = '42501'; end if;
  if p_id is null then
    insert into public.cr360_campaigns (name, channel, branch_id, starts_on, ends_on, budget_lak, spent_lak, created_by)
    values (trim(p_name), p_channel, p_branch, p_from, p_to, coalesce(p_budget, 0), coalesce(p_spent, 0), auth.uid()) returning id into v_id;
    return v_id;
  end if;
  select * into c from public.cr360_campaigns where id = p_id for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if cr360_authz.is_branch_manager(c.branch_id) is not true then raise exception 'access denied' using errcode = '42501'; end if;
  update public.cr360_campaigns set name = trim(p_name), channel = p_channel, branch_id = p_branch, starts_on = p_from, ends_on = p_to,
    budget_lak = coalesce(p_budget, 0), spent_lak = coalesce(p_spent, 0) where id = p_id;
  return p_id;
end $$;

create or replace function public.cr360_lead_attribute(p_lead uuid, p_campaign uuid, p_referrer text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_branch uuid;
begin
  select l.branch_id into v_branch from public.leads l where l.id = p_lead;
  if not found then raise exception 'lead not found' using errcode = 'P0002'; end if;
  if (cr360_authz.is_branch_manager(v_branch) or (v_branch is not null and cr360_authz.in_branch(v_branch))) is not true then
    raise exception 'access denied' using errcode = '42501';
  end if;
  if p_campaign is null and nullif(trim(coalesce(p_referrer, '')), '') is null then raise exception 'campaign or referrer required' using errcode = '22023'; end if;
  if p_campaign is not null and not exists (select 1 from public.cr360_campaigns c where c.id = p_campaign and (c.branch_id is null or c.branch_id = v_branch)) then
    raise exception 'campaign not found for this branch' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_referrer, '')), '') is not null and not exists (select 1 from public.student_packages p where p.student_id = trim(p_referrer)) then
    raise exception 'referrer is not an existing student' using errcode = '22023';
  end if;
  insert into public.cr360_lead_attribution (lead_id, campaign_id, referrer_student_code, attributed_by)
  values (p_lead, p_campaign, nullif(trim(coalesce(p_referrer, '')), ''), auth.uid())
  on conflict (lead_id) do update set campaign_id = excluded.campaign_id, referrer_student_code = excluded.referrer_student_code,
    attributed_by = excluded.attributed_by, attributed_at = now();
  return true;
end $$;

-- p_action: approve (needs reward text; lead must be Registered) | give | decline (needs note)
create or replace function public.cr360_referral_reward(p_lead uuid, p_action text, p_text text) returns text
language plpgsql security definer set search_path = '' as $$
declare l public.leads%rowtype; a public.cr360_lead_attribution%rowtype; r public.cr360_referral_rewards%rowtype;
begin
  select * into l from public.leads where id = p_lead;
  if not found then raise exception 'lead not found' using errcode = 'P0002'; end if;
  if cr360_authz.is_branch_manager(l.branch_id) is not true then raise exception 'access denied' using errcode = '42501'; end if;
  select * into a from public.cr360_lead_attribution where lead_id = p_lead;
  if a.referrer_student_code is null then raise exception 'no referrer recorded for this lead' using errcode = '22023'; end if;
  select * into r from public.cr360_referral_rewards where lead_id = p_lead for update;
  if p_action = 'approve' then
    if l.status <> 'Registered' then raise exception 'reward only after the referred child registers' using errcode = '22023'; end if;
    if r.id is not null then return r.status; end if;
    if p_text is null or length(trim(p_text)) < 2 then raise exception 'reward description required' using errcode = '22023'; end if;
    insert into public.cr360_referral_rewards (lead_id, referrer_student_code, branch_id, reward, decided_by)
    values (p_lead, a.referrer_student_code, l.branch_id, trim(p_text), auth.uid());
  elsif p_action = 'give' then
    if r.id is null or r.status <> 'approved' then
      if r.status = 'given' then return 'given'; end if;
      raise exception 'approve the reward first' using errcode = '22023';
    end if;
    update public.cr360_referral_rewards set status = 'given', given_by = auth.uid(), given_at = now(), note = nullif(trim(coalesce(p_text, '')), '') where id = r.id;
  elsif p_action = 'decline' then
    if p_text is null or length(trim(p_text)) < 3 then raise exception 'reason required' using errcode = '22023'; end if;
    if r.id is null then
      insert into public.cr360_referral_rewards (lead_id, referrer_student_code, branch_id, reward, status, decided_by, note)
      values (p_lead, a.referrer_student_code, l.branch_id, '—', 'declined', auth.uid(), trim(p_text));
    elsif r.status = 'given' then raise exception 'already given' using errcode = '22023';
    else update public.cr360_referral_rewards set status = 'declined', note = trim(p_text), decided_by = auth.uid(), decided_at = now() where id = r.id;
    end if;
  else raise exception 'invalid action' using errcode = '22023';
  end if;
  insert into cr360_vault.audit_events (actor, action, entity, entity_id, branch_id, reason)
  values (auth.uid(), 'crm.referral_reward.' || p_action, 'leads', p_lead, l.branch_id, p_text);
  return (select status from public.cr360_referral_rewards where lead_id = p_lead);
end $$;

-- Campaign results for leads created in [from, to]; only branches the caller manages (CEO: all).
create or replace function public.cr360_campaign_report(p_from date, p_to date)
returns table (campaign_id uuid, name text, channel text, branch_id uuid, budget_lak numeric, spent_lak numeric,
               leads bigint, trials bigint, registered bigint, cost_per_lead numeric, cost_per_registration numeric)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.channel, c.branch_id, c.budget_lak, c.spent_lak,
         count(l.id), count(l.id) filter (where l.status in ('TrialBooked', 'TrialAttended', 'Registered')),
         count(l.id) filter (where l.status = 'Registered'),
         case when count(l.id) > 0 then round(c.spent_lak / count(l.id), 0) end,
         case when count(l.id) filter (where l.status = 'Registered') > 0 then round(c.spent_lak / count(l.id) filter (where l.status = 'Registered'), 0) end
    from public.cr360_campaigns c
    left join public.cr360_lead_attribution a on a.campaign_id = c.id
    left join public.leads l on l.id = a.lead_id and (l.created_at at time zone 'Asia/Vientiane')::date between p_from and p_to
   where cr360_authz.is_branch_manager(c.branch_id) or (c.branch_id is null and cr360_authz.has_role(array['ceo','manager']))
   group by c.id order by c.starts_on desc
$$;

-- Referral leaderboard: referring families (by student code) with leads and registrations, managed branches only.
create or replace function public.cr360_referral_board()
returns table (referrer_student_code text, referrer_name text, leads bigint, registered bigint, rewards_given bigint)
language sql stable security definer set search_path = '' as $$
  select a.referrer_student_code, (select p.student_name from public.student_packages p where p.student_id = a.referrer_student_code order by p.created_at desc limit 1),
         count(*), count(*) filter (where l.status = 'Registered'),
         (select count(*) from public.cr360_referral_rewards r where r.referrer_student_code = a.referrer_student_code and r.status = 'given')
    from public.cr360_lead_attribution a join public.leads l on l.id = a.lead_id
   where a.referrer_student_code is not null and cr360_authz.is_branch_manager(l.branch_id)
   group by a.referrer_student_code order by 4 desc, 3 desc limit 50
$$;

revoke all on function public.cr360_campaign_save(uuid, text, text, uuid, date, date, numeric, numeric) from public, anon;
revoke all on function public.cr360_lead_attribute(uuid, uuid, text) from public, anon;
revoke all on function public.cr360_referral_reward(uuid, text, text) from public, anon;
revoke all on function public.cr360_campaign_report(date, date) from public, anon;
revoke all on function public.cr360_referral_board() from public, anon;
grant execute on function public.cr360_campaign_save(uuid, text, text, uuid, date, date, numeric, numeric) to authenticated;
grant execute on function public.cr360_lead_attribute(uuid, uuid, text) to authenticated;
grant execute on function public.cr360_referral_reward(uuid, text, text) to authenticated;
grant execute on function public.cr360_campaign_report(date, date) to authenticated;
grant execute on function public.cr360_referral_board() to authenticated;
commit;
