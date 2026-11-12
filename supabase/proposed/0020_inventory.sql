-- =====================================================================================
-- PROPOSED — NOT APPLIED. Requires CEO approval. Apply AFTER 0010, 0012 and 0019. Staging first.
-- Rollback: 0020_inventory.rollback.sql
--
-- Inventory: robot kits, parts, consumables and devices per branch.
--  * Catalogue (CEO). Stock = sum of append-only movements per item and branch.
--  * Branch manager / CEO record movements; branch staff can view their branch's stock.
--  * No negative stock (row lock per item+branch); transfers write both sides atomically.
--  * adjust / damaged / lost need a note. Nothing is ever deleted.
-- DATA IMPACT: two new tables; no existing rows change.
-- =====================================================================================
begin;

create table if not exists public.cr360_inventory_items (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique check (sku ~ '^[A-Z0-9][A-Z0-9-]{1,39}$'),
  name text not null check (length(trim(name)) between 2 and 120),
  category text not null check (category in ('kit', 'part', 'consumable', 'device', 'other')),
  unit text not null default 'pcs' check (length(unit) between 1 and 12),
  reorder_level integer not null default 0 check (reorder_level >= 0),
  active boolean not null default true,
  created_by uuid not null, created_at timestamptz not null default now()
);
create table if not exists public.cr360_inventory_moves (
  id bigint generated always as identity primary key,
  item_id uuid not null references public.cr360_inventory_items(id),
  branch_id uuid not null references public.branches(id),
  qty integer not null check (qty <> 0 and abs(qty) <= 100000),
  kind text not null check (kind in ('receive', 'issue', 'transfer_out', 'transfer_in', 'adjust', 'damaged', 'lost')),
  transfer_id uuid,
  note text check (note is null or length(note) <= 300),
  moved_by uuid not null, moved_at timestamptz not null default now(),
  check ((kind in ('receive', 'transfer_in') and qty > 0) or (kind in ('issue', 'transfer_out', 'damaged', 'lost') and qty < 0) or kind = 'adjust')
);
create index if not exists cr360_inventory_moves_item_branch on public.cr360_inventory_moves (item_id, branch_id);

alter table public.cr360_inventory_items enable row level security;
alter table public.cr360_inventory_moves enable row level security;
revoke all on public.cr360_inventory_items, public.cr360_inventory_moves from anon, authenticated;
grant select on public.cr360_inventory_items, public.cr360_inventory_moves to authenticated;

drop trigger if exists cr360_inventory_moves_immutable on public.cr360_inventory_moves;
create trigger cr360_inventory_moves_immutable before update or delete on public.cr360_inventory_moves
  for each row execute function public.cr360_finance_immutable();

create or replace function cr360_authz.in_branch(p_branch uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(cr360_authz.is_branch_manager(p_branch) or (cr360_authz.active_member() and exists (
    select 1 from public.cr360_hr_memberships m where m.user_id = (select auth.uid()) and m.active and m.branch_id = p_branch)), false)
$$;
revoke all on function cr360_authz.in_branch(uuid) from public, anon;
grant execute on function cr360_authz.in_branch(uuid) to authenticated;

drop policy if exists cr360_inventory_items_read on public.cr360_inventory_items;
create policy cr360_inventory_items_read on public.cr360_inventory_items for select to authenticated using (cr360_authz.active_member());
drop policy if exists cr360_inventory_moves_read on public.cr360_inventory_moves;
create policy cr360_inventory_moves_read on public.cr360_inventory_moves for select to authenticated using (cr360_authz.in_branch(branch_id));

create or replace function public.cr360_inventory_item_save(p_id uuid, p_sku text, p_name text, p_category text, p_unit text, p_reorder integer, p_active boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if coalesce(cr360_authz.has_role(array['ceo']), false) is not true then raise exception 'access denied' using errcode = '42501'; end if;
  if p_id is null then
    insert into public.cr360_inventory_items (sku, name, category, unit, reorder_level, created_by)
    values (upper(trim(p_sku)), trim(p_name), p_category, coalesce(nullif(trim(p_unit), ''), 'pcs'), coalesce(p_reorder, 0), auth.uid()) returning id into v_id;
    return v_id;
  end if;
  update public.cr360_inventory_items set name = trim(p_name), category = p_category, unit = coalesce(nullif(trim(p_unit), ''), 'pcs'),
    reorder_level = coalesce(p_reorder, 0), active = coalesce(p_active, true) where id = p_id;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  return p_id;
end $$;

-- Record a movement. p_qty is always POSITIVE; the kind decides the sign (adjust: p_sign = +1 / -1).
-- Transfers: p_to_branch required; writes transfer_out + transfer_in in one transaction.
create or replace function public.cr360_inventory_move(p_item uuid, p_branch uuid, p_kind text, p_qty integer, p_note text,
  p_to_branch uuid default null, p_sign integer default 1) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_on_hand integer; v_delta integer; v_transfer uuid;
begin
  if cr360_authz.is_branch_manager(p_branch) is not true then raise exception 'access denied' using errcode = '42501'; end if;
  if p_qty is null or p_qty <= 0 or p_qty > 100000 then raise exception 'invalid quantity' using errcode = '22023'; end if;
  if not exists (select 1 from public.cr360_inventory_items i where i.id = p_item and i.active) then raise exception 'item not found' using errcode = 'P0002'; end if;
  if p_kind in ('adjust', 'damaged', 'lost') and (p_note is null or length(trim(p_note)) < 3) then raise exception 'note required' using errcode = '22023'; end if;
  v_delta := case p_kind when 'receive' then p_qty when 'adjust' then p_qty * (case when p_sign < 0 then -1 else 1 end)
                         when 'issue' then -p_qty when 'damaged' then -p_qty when 'lost' then -p_qty when 'transfer' then -p_qty else null end;
  if v_delta is null then raise exception 'invalid kind' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('cr360_inv:' || p_item::text || ':' || p_branch::text, 0));
  select coalesce(sum(qty), 0) into v_on_hand from public.cr360_inventory_moves where item_id = p_item and branch_id = p_branch;
  if v_on_hand + v_delta < 0 then raise exception 'not enough stock (on hand %)', v_on_hand using errcode = '23514'; end if;
  if p_kind = 'transfer' then
    if p_to_branch is null or p_to_branch = p_branch or not exists (select 1 from public.branches b where b.id = p_to_branch and b.active) then
      raise exception 'destination branch required' using errcode = '22023';
    end if;
    v_transfer := gen_random_uuid();
    insert into public.cr360_inventory_moves (item_id, branch_id, qty, kind, transfer_id, note, moved_by)
    values (p_item, p_branch, -p_qty, 'transfer_out', v_transfer, nullif(trim(coalesce(p_note, '')), ''), auth.uid()),
           (p_item, p_to_branch, p_qty, 'transfer_in', v_transfer, nullif(trim(coalesce(p_note, '')), ''), auth.uid());
    return v_transfer;
  end if;
  insert into public.cr360_inventory_moves (item_id, branch_id, qty, kind, note, moved_by)
  values (p_item, p_branch, v_delta, p_kind, nullif(trim(coalesce(p_note, '')), ''), auth.uid());
  return null;
end $$;

-- Stock per item for the branches the caller may see.
create or replace function public.cr360_inventory_stock(p_branch uuid)
returns table (item_id uuid, sku text, name text, category text, unit text, reorder_level integer, on_hand bigint)
language sql stable security definer set search_path = '' as $$
  select i.id, i.sku, i.name, i.category, i.unit, i.reorder_level, coalesce(sum(m.qty), 0)
    from public.cr360_inventory_items i
    left join public.cr360_inventory_moves m on m.item_id = i.id and m.branch_id = p_branch
   where cr360_authz.in_branch(p_branch) and i.active
   group by i.id order by i.category, i.name
$$;

revoke all on function public.cr360_inventory_item_save(uuid, text, text, text, text, integer, boolean) from public, anon;
revoke all on function public.cr360_inventory_move(uuid, uuid, text, integer, text, uuid, integer) from public, anon;
revoke all on function public.cr360_inventory_stock(uuid) from public, anon;
grant execute on function public.cr360_inventory_item_save(uuid, text, text, text, text, integer, boolean) to authenticated;
grant execute on function public.cr360_inventory_move(uuid, uuid, text, integer, text, uuid, integer) to authenticated;
grant execute on function public.cr360_inventory_stock(uuid) to authenticated;
commit;
