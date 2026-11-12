-- Rollback for 0020: drops functions and policies; catalogue and movement history are kept.
begin;
drop function if exists public.cr360_inventory_stock(uuid);
drop function if exists public.cr360_inventory_move(uuid, uuid, text, integer, text, uuid, integer);
drop function if exists public.cr360_inventory_item_save(uuid, text, text, text, text, integer, boolean);
drop policy if exists cr360_inventory_moves_read on public.cr360_inventory_moves;
drop policy if exists cr360_inventory_items_read on public.cr360_inventory_items;
drop function if exists cr360_authz.in_branch(uuid);
commit;
