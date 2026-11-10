-- Reverses 20261108130000_shop_stage_d_online_orders.sql: restores the router
-- as 20261108120000 left it and removes the online-order function and tables.
-- WARNING: this DELETES every online order, line, accepted/closed event and
-- sale link recorded since the upgrade. Export them first if you need them.
-- Sales themselves are not touched.
begin;

create or replace function public.tallybook_shop_ops(p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $body$
declare actor uuid:=auth.uid(); sid uuid;
begin
  begin sid:=(auth.jwt()->>'session_id')::uuid;
  exception when others then sid:=null;
  end;
  if p_action in ('saveSupplier','archiveSupplier','supplierBalances',
      'createPurchaseOrder','purchaseDetails','closePurchaseOrder',
      'receivePurchase','settleSupplier') then
    return private.shop_stage_d_purchase_action(p_action,actor,sid,p_input);
  end if;
  if p_action in ('listStockCounts','listTransfers','startStockCount','applyStockCount',
      'cancelStockCount','requestTransfer','dispatchTransfer','receiveTransfer',
      'cancelTransfer') then
    return private.shop_stage_d_stock_action(p_action,actor,sid,p_input);
  end if;
  return private.shop_stage_c_action(p_action,actor,sid,p_input);
end $body$;
revoke all on function public.tallybook_shop_ops(text,jsonb) from public,anon;
grant execute on function public.tallybook_shop_ops(text,jsonb) to authenticated;

drop function if exists private.shop_stage_d_online_action(text, uuid, uuid, jsonb);

drop table if exists public.shop_online_order_fulfillments;
drop table if exists public.shop_online_order_events;
drop table if exists public.shop_online_order_lines;
drop table if exists public.shop_online_orders;

commit;
