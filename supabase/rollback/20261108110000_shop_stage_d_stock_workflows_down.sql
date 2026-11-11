-- Reverses 20261108110000_shop_stage_d_stock_workflows.sql: restores the router
-- as 20261108100000 left it, removes the stock count and transfer function and
-- tables, and puts the stock-movement reason list back to what it was before.
-- WARNING: this DELETES every stock count and transfer record.
-- It REFUSES to run while the stock movement history holds entries made by a
-- count, transfer or purchase (reasons stocktake, transfer_out, transfer_in,
-- purchase): the old reason list cannot hold them, and altering history is not
-- something a rollback may do. Keep this migration in that case.
begin;

do $guard$
begin
  if exists (select 1 from public.shop_stock_movements
              where reason in ('stocktake','transfer_out','transfer_in','purchase')) then
    raise exception 'Cannot roll back: the stock movement history contains stock counts, transfers or purchases. Keep this upgrade, or archive those rows first.';
  end if;
end $guard$;

create or replace function public.tallybook_shop_ops(p_action text, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $body$
declare
  actor uuid := auth.uid();
  sid uuid;
begin
  begin sid := (auth.jwt()->>'session_id')::uuid;
  exception when others then sid := null;
  end;
  return private.shop_stage_c_action(p_action,actor,sid,p_input);
end $body$;

revoke all on function public.tallybook_shop_ops(text,jsonb) from public,anon;
grant execute on function public.tallybook_shop_ops(text,jsonb) to authenticated;

drop function if exists private.shop_stage_d_stock_action(text, uuid, uuid, jsonb);

drop table if exists public.shop_transfers;
drop table if exists public.shop_stock_counts;

alter table public.shop_stock_movements drop constraint shop_stock_movements_reason_valid;
alter table public.shop_stock_movements
  add constraint shop_stock_movements_reason_valid
    check (reason in ('sale','restock','correction','refund','opening'));

commit;
