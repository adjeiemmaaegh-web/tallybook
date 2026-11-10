-- Reverses 20261108120000_shop_stage_d_purchase_payables.sql: restores the
-- router as 20261108110000 left it and removes the purchasing function and
-- tables.
-- WARNING: this DELETES every supplier, purchase order, goods receipt, order
-- closure and supplier payment recorded since the upgrade. Stock already
-- received stays in store stock and in the stock movement history (reason
-- 'purchase'), but its supplier records are gone. Export them first.
begin;

create or replace function public.tallybook_shop_ops(p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $body$
declare actor uuid:=auth.uid(); sid uuid;
begin
  begin sid:=(auth.jwt()->>'session_id')::uuid;
  exception when others then sid:=null;
  end;
  if p_action in ('listStockCounts','listTransfers','startStockCount','applyStockCount',
                  'cancelStockCount','requestTransfer','dispatchTransfer',
                  'receiveTransfer','cancelTransfer') then
    return private.shop_stage_d_stock_action(p_action,actor,sid,p_input);
  end if;
  return private.shop_stage_c_action(p_action,actor,sid,p_input);
end $body$;
revoke all on function public.tallybook_shop_ops(text,jsonb) from public,anon;
grant execute on function public.tallybook_shop_ops(text,jsonb) to authenticated;

drop function if exists private.shop_stage_d_purchase_action(text, uuid, uuid, jsonb);

drop table if exists public.shop_supplier_settlements;
drop table if exists public.shop_purchase_closures;
drop table if exists public.shop_purchase_receipt_lines;
drop table if exists public.shop_purchase_receipts;
drop table if exists public.shop_purchase_order_lines;
drop table if exists public.shop_purchase_orders;
drop table if exists public.shop_suppliers;

commit;
