-- Stage 8: additive owner-only order list. Existing immutable order, receipt, supplier
-- and stock tables remain unchanged. This read model is not a bank settlement assertion.
begin;
create function private.shop_stage_e_purchase_list(
  p_actor uuid,p_session uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_company uuid;v_role text;
begin
  if jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'Invalid purchase list request' using errcode='22023'; end if;
  v_company:=private.shop_uuid(p_input,'companyId');
  v_role:=private.shop_member_role(p_actor,p_session,v_company);
  if v_role<>'owner' then raise exception 'Only the owner may review purchase orders' using errcode='42501'; end if;
  return jsonb_build_object('orders',coalesce((
    select jsonb_agg(jsonb_build_object('orderId',o.id,'storeId',o.store_id,
      'supplierId',o.supplier_id,'reference',o.reference,'createdAt',o.created_at,
      'closed',exists(select 1 from public.shop_purchase_closures c where c.order_id=o.id),
      'orderedLines',coalesce((select count(*) from public.shop_purchase_order_lines l where l.order_id=o.id),0),
      'receivedMinor',coalesce((select sum(r.total_minor) from public.shop_purchase_receipts r where r.order_id=o.id),0)::text)
      order by o.created_at desc,o.id)
    from (select * from public.shop_purchase_orders where business_id=v_company
      order by created_at desc,id limit 100) o),'[]'::jsonb));
end $fn$;
revoke all on function private.shop_stage_e_purchase_list(uuid,uuid,jsonb)
  from public,anon,authenticated;

-- Last migration (online orders) is the canonical routing baseline. Preserve all
-- existing public.tallybook_shop_ops actions while adding read-only order discovery.
create or replace function public.tallybook_shop_ops(p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $body$
declare actor uuid:=auth.uid();sid uuid;
begin
  begin sid:=(auth.jwt()->>'session_id')::uuid;
  exception when others then sid:=null; end;
  if p_action='listPurchaseOrders' then
    return private.shop_stage_e_purchase_list(actor,sid,p_input);
  end if;
  if p_action in ('listOnlineOrders','createOnlineOrder','acceptOnlineOrder',
      'closeOnlineOrder','linkOnlineOrderSale') then
    return private.shop_stage_d_online_action(p_action,actor,sid,p_input);
  end if;
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
commit;
