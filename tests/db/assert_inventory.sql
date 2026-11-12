-- 0020 inventory. CEO ...c0; manager A ...a1; manager B ...b1; staff A ...a2.
\set QUIET on
begin;
set local role authenticated;
select t.claims('00000000-0000-0000-0000-0000000000a1');
do $$ declare code text; begin
  begin perform public.cr360_inventory_item_save(null, 'SPK-001', 'Spike Prime kit', 'kit', 'set', 2, true); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0020 only the CEO manages the catalogue');
end $$;
select t.claims('00000000-0000-0000-0000-0000000000c0');
select public.cr360_inventory_item_save(null, 'spk-001', 'Spike Prime kit', 'kit', 'set', 2, true) as it \gset
select set_config('t.it', :'it', true);
select t.ok((select sku from public.cr360_inventory_items) = 'SPK-001', '0020 CEO adds an item (SKU normalised)');

select t.claims('00000000-0000-0000-0000-0000000000a1');
select public.cr360_inventory_move(current_setting('t.it')::uuid, '10000000-0000-0000-0000-00000000000a', 'receive', 5, 'delivery 12');
select public.cr360_inventory_move(current_setting('t.it')::uuid, '10000000-0000-0000-0000-00000000000a', 'issue', 2, 'class use');
select t.ok((select on_hand from public.cr360_inventory_stock('10000000-0000-0000-0000-00000000000a')) = 3, '0020 stock = receipts − issues');
do $$ declare code text; begin
  begin perform public.cr360_inventory_move(current_setting('t.it')::uuid, '10000000-0000-0000-0000-00000000000a', 'issue', 4, null); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '23514', '0020 stock cannot go negative');
  begin perform public.cr360_inventory_move(current_setting('t.it')::uuid, '10000000-0000-0000-0000-00000000000a', 'lost', 1, ''); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '22023', '0020 lost/damaged/adjust need a note');
  begin perform public.cr360_inventory_move(current_setting('t.it')::uuid, '10000000-0000-0000-0000-00000000000b', 'receive', 1, null); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0020 a manager cannot move stock of another branch');
end $$;
select public.cr360_inventory_move(current_setting('t.it')::uuid, '10000000-0000-0000-0000-00000000000a', 'transfer', 2, 'for branch B', '10000000-0000-0000-0000-00000000000b');
select t.ok((select on_hand from public.cr360_inventory_stock('10000000-0000-0000-0000-00000000000a')) = 1, '0020 transfer takes stock from the source');
select t.claims('00000000-0000-0000-0000-0000000000b1');
select t.ok((select on_hand from public.cr360_inventory_stock('10000000-0000-0000-0000-00000000000b')) = 2, '0020 and adds it to the destination in the same step');
select t.ok((select count(*) from public.cr360_inventory_stock('10000000-0000-0000-0000-00000000000a')) = 0, '0020 manager B cannot read branch A stock');
select t.claims('00000000-0000-0000-0000-0000000000a2');
select t.ok((select on_hand from public.cr360_inventory_stock('10000000-0000-0000-0000-00000000000a')) = 1, '0020 branch staff can view their branch stock');
do $$ declare code text; begin
  begin perform public.cr360_inventory_move(current_setting('t.it')::uuid, '10000000-0000-0000-0000-00000000000a', 'issue', 1, null); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0020 plain staff cannot record movements');
end $$;
reset role;
do $$ declare code text; begin
  begin delete from public.cr360_inventory_moves; code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0020 movement history cannot be deleted');
end $$;
rollback;
