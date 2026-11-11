-- Reverses 20261111100000_shop_attendant_stock.sql: restores the owner-only
-- stock and purchasing functions and the previous router, then drops the
-- wrapper and the can_manage_stock column. WARNING: the per-attendant stock
-- trust flags are deleted with the column. Stock movements already made by
-- attendants stay in the history.
begin;

create or replace function public.tallybook_shop_ops(p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $body$
declare actor uuid:=auth.uid();sid uuid;
begin
  begin sid:=(auth.jwt()->>'session_id')::uuid;
  exception when others then sid:=null; end;
  if p_action='dailyReport' then
    return private.shop_stage_h_daily_report(actor,sid,p_input);
  end if;
  if p_action in ('saveProductFull','productCatalog') then
    return private.shop_stage_g_product_action(p_action,actor,sid,p_input);
  end if;
  if p_action='searchSales' then
    return private.shop_stage_f_sales_search(actor,sid,p_input);
  end if;
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

create or replace function private.shop_stage_d_stock_action(
  p_action text,p_actor uuid,p_session uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_company uuid;
  v_role text;
  v_store uuid;
  v_product uuid;
  v_other uuid;
  v_id uuid;
  v_count public.shop_stock_counts;
  v_transfer public.shop_transfers;
  v_current integer;
  v_qty bigint;
  v_delta bigint;
  v_op uuid;
begin
  if jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'Invalid stock request' using errcode='22023';
  end if;
  v_company:=private.shop_uuid(p_input,'companyId');
  v_role:=private.shop_member_role(p_actor,p_session,v_company);
  if v_role<>'owner' then
    raise exception 'Only the business owner can change stock workflows' using errcode='42501';
  end if;

  if p_action='listStockCounts' then
    return jsonb_build_object('counts',coalesce((
      select jsonb_agg(jsonb_build_object('countId',x.id,'storeId',x.store_id,
        'productId',x.product_id,'expectedQuantity',x.expected_quantity,
        'countedQuantity',x.counted_quantity,'status',x.status,'createdAt',x.created_at)
        order by x.created_at desc)
      from (select * from public.shop_stock_counts where business_id=v_company
            order by created_at desc limit 100) x),'[]'::jsonb));
  end if;
  if p_action='listTransfers' then
    return jsonb_build_object('transfers',coalesce((
      select jsonb_agg(jsonb_build_object('transferId',x.id,'fromStoreId',x.from_store_id,
        'toStoreId',x.to_store_id,'productId',x.product_id,'quantity',x.quantity,
        'status',x.status,'requestedAt',x.requested_at,'dispatchedAt',x.dispatched_at,
        'receivedAt',x.received_at) order by x.requested_at desc)
      from (select * from public.shop_transfers where business_id=v_company
            order by requested_at desc limit 100) x),'[]'::jsonb));
  end if;

  -- Only one owner stock mutation at a time for this company.
  perform 1 from public.shop_ledgers where business_id=v_company for update;
  if not found then raise exception 'Set up this shop before using stock workflows' using errcode='42501'; end if;

  if p_action='startStockCount' then
    v_id:=private.shop_uuid(p_input,'countId');
    v_store:=private.shop_uuid(p_input,'storeId');
    v_product:=private.shop_uuid(p_input,'productId');
    select * into v_count from public.shop_stock_counts
      where business_id=v_company and id=v_id for update;
    if found then
      if v_count.store_id<>v_store or v_count.product_id<>v_product then
        raise exception 'Count ID already belongs to another product' using errcode='23505';
      end if;
      return jsonb_build_object('countId',v_id,'expectedQuantity',v_count.expected_quantity,
        'status',v_count.status,'replayed',true);
    end if;
    perform 1 from public.shop_stores
      where business_id=v_company and id=v_store and status='active';
    if not found then raise exception 'Store unavailable' using errcode='42501'; end if;
    perform 1 from public.shop_products
      where business_id=v_company and id=v_product and active;
    if not found then raise exception 'Product unavailable' using errcode='42501'; end if;
    select quantity into v_current from public.shop_store_stock
      where business_id=v_company and store_id=v_store and product_id=v_product for update;
    v_current:=coalesce(v_current,0);
    insert into public.shop_stock_counts(id,business_id,store_id,product_id,expected_quantity,created_by)
      values(v_id,v_company,v_store,v_product,v_current,p_actor);
    return jsonb_build_object('countId',v_id,'expectedQuantity',v_current,
      'status','open','replayed',false);
  end if;

  if p_action in ('applyStockCount','cancelStockCount') then
    v_id:=private.shop_uuid(p_input,'countId');
    select * into v_count from public.shop_stock_counts
      where business_id=v_company and id=v_id for update;
    if not found then raise exception 'Stock count not found' using errcode='42501'; end if;
    if p_action='cancelStockCount' then
      if v_count.status='cancelled' then
        return jsonb_build_object('countId',v_id,'status','cancelled','replayed',true);
      end if;
      if v_count.status<>'open' then raise exception 'Applied count cannot be cancelled' using errcode='23514'; end if;
      update public.shop_stock_counts set status='cancelled' where id=v_id;
      return jsonb_build_object('countId',v_id,'status','cancelled','replayed',false);
    end if;
    v_qty:=private.shop_int(p_input,'countedQuantity',0,2147483647);
    if v_count.status='applied' then
      if v_count.counted_quantity<>v_qty then
        raise exception 'Count already applied with different quantity' using errcode='23505';
      end if;
      return jsonb_build_object('countId',v_id,'status','applied',
        'countedQuantity',v_qty,'replayed',true);
    end if;
    if v_count.status<>'open' then raise exception 'Cancelled count cannot be applied' using errcode='23514'; end if;
    insert into public.shop_store_stock(business_id,store_id,product_id,quantity)
      values(v_company,v_count.store_id,v_count.product_id,0) on conflict do nothing;
    select quantity into v_current from public.shop_store_stock
      where business_id=v_company and store_id=v_count.store_id and product_id=v_count.product_id for update;
    if v_current<>v_count.expected_quantity then
      raise exception 'Stock changed after counting began; start a fresh count' using errcode='23514';
    end if;
    v_delta:=v_qty-v_current;
    if v_delta<>0 then
      update public.shop_store_stock set quantity=v_qty::int,updated_at=clock_timestamp()
        where business_id=v_company and store_id=v_count.store_id and product_id=v_count.product_id;
      v_op:=private.shop_derived_uuid(v_id,'stage-d-stocktake');
      insert into public.shop_stock_movements(business_id,store_id,product_id,delta,quantity_after,
        reason,operation_id,note,actor_id)
        values(v_company,v_count.store_id,v_count.product_id,v_delta::int,v_qty::int,
          'stocktake',v_op,'Count '||v_id::text,p_actor);
    end if;
    update public.shop_stock_counts set counted_quantity=v_qty::int,status='applied',
      applied_by=p_actor,applied_at=clock_timestamp() where id=v_id;
    return jsonb_build_object('countId',v_id,'status','applied','countedQuantity',v_qty,
      'adjustment',v_delta,'replayed',false);
  end if;

  if p_action='requestTransfer' then
    v_id:=private.shop_uuid(p_input,'transferId');
    v_store:=private.shop_uuid(p_input,'fromStoreId');
    v_other:=private.shop_uuid(p_input,'toStoreId');
    v_product:=private.shop_uuid(p_input,'productId');
    v_qty:=private.shop_int(p_input,'quantity',1,100000);
    if v_store=v_other then raise exception 'Choose two different stores' using errcode='22023'; end if;
    select * into v_transfer from public.shop_transfers
      where business_id=v_company and id=v_id for update;
    if found then
      if v_transfer.from_store_id<>v_store or v_transfer.to_store_id<>v_other or
         v_transfer.product_id<>v_product or v_transfer.quantity<>v_qty then
        raise exception 'Transfer ID already used with different details' using errcode='23505';
      end if;
      return jsonb_build_object('transferId',v_id,'status',v_transfer.status,'replayed',true);
    end if;
    if (select count(*) from public.shop_stores
        where business_id=v_company and status='active' and id in (v_store,v_other))<>2 then
      raise exception 'Both stores must be active in this business' using errcode='42501';
    end if;
    perform 1 from public.shop_products
      where business_id=v_company and id=v_product and active;
    if not found then raise exception 'Product unavailable' using errcode='42501'; end if;
    insert into public.shop_transfers(id,business_id,from_store_id,to_store_id,product_id,quantity,requested_by)
      values(v_id,v_company,v_store,v_other,v_product,v_qty::int,p_actor);
    return jsonb_build_object('transferId',v_id,'status','requested','replayed',false);
  end if;

  if p_action in ('dispatchTransfer','receiveTransfer','cancelTransfer') then
    v_id:=private.shop_uuid(p_input,'transferId');
    select * into v_transfer from public.shop_transfers
      where business_id=v_company and id=v_id for update;
    if not found then raise exception 'Transfer not found' using errcode='42501'; end if;
    if p_action='cancelTransfer' then
      if v_transfer.status='cancelled' then
        return jsonb_build_object('transferId',v_id,'status','cancelled','replayed',true);
      end if;
      if v_transfer.status<>'requested' then
        raise exception 'Dispatched stock cannot be cancelled without a separate return transfer' using errcode='23514';
      end if;
      update public.shop_transfers set status='cancelled' where id=v_id;
      return jsonb_build_object('transferId',v_id,'status','cancelled','replayed',false);
    end if;
    if p_action='dispatchTransfer' then
      if v_transfer.status='in_transit' then
        return jsonb_build_object('transferId',v_id,'status','in_transit','replayed',true);
      end if;
      if v_transfer.status<>'requested' then
        raise exception 'Transfer is not awaiting dispatch' using errcode='23514';
      end if;
      select quantity into v_current from public.shop_store_stock
        where business_id=v_company and store_id=v_transfer.from_store_id
          and product_id=v_transfer.product_id for update;
      if coalesce(v_current,0)<v_transfer.quantity then
        raise exception 'Not enough stock to dispatch' using errcode='23514';
      end if;
      update public.shop_store_stock set quantity=quantity-v_transfer.quantity,
        updated_at=clock_timestamp()
        where business_id=v_company and store_id=v_transfer.from_store_id
          and product_id=v_transfer.product_id returning quantity into v_current;
      v_op:=private.shop_derived_uuid(v_id,'stage-d-dispatch');
      insert into public.shop_stock_movements(business_id,store_id,product_id,delta,quantity_after,
          reason,operation_id,note,actor_id)
        values(v_company,v_transfer.from_store_id,v_transfer.product_id,
          -v_transfer.quantity,v_current,'transfer_out',v_op,'Transfer '||v_id::text,p_actor);
      update public.shop_transfers set status='in_transit',dispatched_at=clock_timestamp(),
        dispatched_by=p_actor where id=v_id;
      return jsonb_build_object('transferId',v_id,'status','in_transit','replayed',false);
    end if;
    if v_transfer.status='received' then
      return jsonb_build_object('transferId',v_id,'status','received','replayed',true);
    end if;
    if v_transfer.status<>'in_transit' then
      raise exception 'Transfer has not been dispatched' using errcode='23514';
    end if;
    insert into public.shop_store_stock(business_id,store_id,product_id,quantity)
      values(v_company,v_transfer.to_store_id,v_transfer.product_id,0) on conflict do nothing;
    select quantity into v_current from public.shop_store_stock
      where business_id=v_company and store_id=v_transfer.to_store_id
        and product_id=v_transfer.product_id for update;
    if v_current::bigint+v_transfer.quantity>2147483647 then
      raise exception 'Receiving stock would exceed the quantity limit' using errcode='22003';
    end if;
    update public.shop_store_stock set quantity=quantity+v_transfer.quantity,
      updated_at=clock_timestamp()
      where business_id=v_company and store_id=v_transfer.to_store_id
        and product_id=v_transfer.product_id returning quantity into v_current;
    v_op:=private.shop_derived_uuid(v_id,'stage-d-receive');
    insert into public.shop_stock_movements(business_id,store_id,product_id,delta,quantity_after,
      reason,operation_id,note,actor_id)
      values(v_company,v_transfer.to_store_id,v_transfer.product_id,
        v_transfer.quantity,v_current,'transfer_in',v_op,'Transfer '||v_id::text,p_actor);
    update public.shop_transfers set status='received',received_at=clock_timestamp(),
      received_by=p_actor where id=v_id;
    return jsonb_build_object('transferId',v_id,'status','received','replayed',false);
  end if;
  raise exception 'Unknown stock operation' using errcode='42501';
end $fn$;
revoke all on function private.shop_stage_d_stock_action(text,uuid,uuid,jsonb)
  from public,anon,authenticated;

create or replace function private.shop_stage_d_purchase_action(
  p_action text,p_actor uuid,p_session uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_company uuid;
  v_role text;
  v_id uuid;
  v_store uuid;
  v_supplier uuid;
  v_product uuid;
  v_order public.shop_purchase_orders;
  v_receipt public.shop_purchase_receipts;
  v_settlement public.shop_supplier_settlements;
  v_supplier_row public.shop_suppliers;
  v_name text;
  v_reference text;
  v_method text;
  v_hash text;
  v_lines jsonb;
  v_line jsonb;
  v_i bigint;
  v_qty bigint;
  v_cost bigint;
  v_line_no int:=0;
  v_total numeric:=0;
  v_received bigint;
  v_ordered bigint;
  v_current bigint;
  v_stock bigint;
  v_sum_received numeric;
  v_sum_paid numeric;
  v_outstanding numeric;
  v_lines_out jsonb:='[]'::jsonb;
  v_seen jsonb:='{}'::jsonb;
  v_op uuid;
begin
  if jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'Invalid purchasing request' using errcode='22023';
  end if;
  v_company:=private.shop_uuid(p_input,'companyId');
  v_role:=private.shop_member_role(p_actor,p_session,v_company);
  if v_role<>'owner' then raise exception 'Only the owner can manage supplier payables' using errcode='42501'; end if;

  if p_action='supplierBalances' then
    return jsonb_build_object('suppliers',coalesce((
      select jsonb_agg(jsonb_build_object('supplierId',s.id,'name',s.name,
        'archived',s.archived,'receivedMinor',coalesce(r.received,0)::text,
        'settledMinor',coalesce(p.paid,0)::text,
        'outstandingMinor',(coalesce(r.received,0)-coalesce(p.paid,0))::text)
        order by s.name)
      from public.shop_suppliers s
      left join lateral (select sum(pr.total_minor) received
        from public.shop_purchase_receipts pr
        join public.shop_purchase_orders po on po.id=pr.order_id
        where po.business_id=v_company and po.supplier_id=s.id) r on true
      left join lateral (select sum(sp.amount_minor) paid
        from public.shop_supplier_settlements sp
        where sp.business_id=v_company and sp.supplier_id=s.id) p on true
      where s.business_id=v_company),'[]'::jsonb));
  end if;
  if p_action='purchaseDetails' then
    v_id:=private.shop_uuid(p_input,'orderId');
    select * into v_order from public.shop_purchase_orders
      where business_id=v_company and id=v_id;
    if not found then raise exception 'Purchase order not found' using errcode='42501'; end if;
    return jsonb_build_object('orderId',v_id,'supplierId',v_order.supplier_id,
      'storeId',v_order.store_id,'closed',exists(
        select 1 from public.shop_purchase_closures where order_id=v_id),
      'lines',coalesce((select jsonb_agg(jsonb_build_object(
        'lineNo',l.line_no,'productId',l.product_id,'orderedQuantity',l.ordered_quantity,
        'unitCostMinor',l.unit_cost_minor,'receivedQuantity',
        coalesce((select sum(rl.quantity) from public.shop_purchase_receipt_lines rl
          where rl.order_id=v_id and rl.line_no=l.line_no),0)) order by l.line_no)
        from public.shop_purchase_order_lines l where l.order_id=v_id),'[]'::jsonb),
      'receivedMinor',coalesce((select sum(pr.total_minor)
        from public.shop_purchase_receipts pr where pr.order_id=v_id),0)::text);
  end if;

  -- Serialize both receipts and payables with sales on the shop ledger.
  perform 1 from public.shop_ledgers where business_id=v_company for update;
  if not found then raise exception 'Set up this shop before purchasing' using errcode='42501'; end if;

  if p_action='saveSupplier' then
    v_id:=private.shop_uuid(p_input,'supplierId');
    v_name:=btrim(coalesce(p_input->>'name',''));
    if length(v_name) not between 1 and 120 then
      raise exception 'Supplier name must be 1 to 120 characters' using errcode='22023';
    end if;
    select * into v_supplier_row from public.shop_suppliers where id=v_id for update;
    if found then
      if v_supplier_row.business_id<>v_company or v_supplier_row.name<>v_name then
        raise exception 'Supplier ID already used with different details' using errcode='23505';
      end if;
      return jsonb_build_object('supplierId',v_id,'name',v_name,'archived',v_supplier_row.archived,'replayed',true);
    end if;
    insert into public.shop_suppliers(id,business_id,name,created_by)
      values(v_id,v_company,v_name,p_actor);
    return jsonb_build_object('supplierId',v_id,'name',v_name,'archived',false,'replayed',false);
  end if;

  if p_action='archiveSupplier' then
    v_id:=private.shop_uuid(p_input,'supplierId');
    update public.shop_suppliers set archived=true where business_id=v_company and id=v_id
      returning * into v_supplier_row;
    if not found then raise exception 'Supplier not found' using errcode='42501'; end if;
    return jsonb_build_object('supplierId',v_id,'archived',true);
  end if;

  if p_action='createPurchaseOrder' then
    v_id:=private.shop_uuid(p_input,'orderId');
    v_store:=private.shop_uuid(p_input,'storeId');
    v_supplier:=private.shop_uuid(p_input,'supplierId');
    v_reference:=nullif(btrim(coalesce(p_input->>'reference','')),'');
    if v_reference is not null and length(v_reference)>100 then
      raise exception 'Purchase reference too long' using errcode='22023';
    end if;
    if jsonb_typeof(p_input->'lines') is distinct from 'array' or
       jsonb_array_length(p_input->'lines') not between 1 and 100 then
      raise exception 'Order needs 1–100 product lines' using errcode='22023';
    end if;
    v_hash:=encode(sha256(convert_to(jsonb_build_object(
      'supplierId',v_supplier,'storeId',v_store,'reference',v_reference,
      'lines',p_input->'lines')::text,'UTF8')),'hex');
    select * into v_order from public.shop_purchase_orders where id=v_id for update;
    if found then
      if v_order.business_id<>v_company or v_order.order_hash<>v_hash then
        raise exception 'Order ID already used with different details' using errcode='23505';
      end if;
      return jsonb_build_object('orderId',v_id,'replayed',true);
    end if;
    perform 1 from public.shop_stores
      where business_id=v_company and id=v_store and status='active';
    if not found then raise exception 'Store unavailable' using errcode='42501'; end if;
    perform 1 from public.shop_suppliers
      where business_id=v_company and id=v_supplier and not archived;
    if not found then raise exception 'Supplier unavailable' using errcode='42501'; end if;
    insert into public.shop_purchase_orders(id,business_id,store_id,supplier_id,
      order_hash,reference,created_by)
      values(v_id,v_company,v_store,v_supplier,v_hash,v_reference,p_actor);
    for v_line in select * from jsonb_array_elements(p_input->'lines') loop
      v_line_no:=v_line_no+1;
      v_product:=private.shop_uuid(v_line,'productId');
      v_qty:=private.shop_int(v_line,'quantity',1,100000);
      v_cost:=private.shop_int(v_line,'unitCostMinor',0,100000000000);
      if v_seen ? v_product::text then raise exception 'Duplicate product on order' using errcode='22023'; end if;
      v_seen:=v_seen||jsonb_build_object(v_product::text,true);
      perform 1 from public.shop_products
        where business_id=v_company and id=v_product and active;
      if not found then raise exception 'Product unavailable' using errcode='42501'; end if;
      insert into public.shop_purchase_order_lines(business_id,order_id,line_no,
        product_id,ordered_quantity,unit_cost_minor)
        values(v_company,v_id,v_line_no,v_product,v_qty::int,v_cost);
    end loop;
    return jsonb_build_object('orderId',v_id,'lineCount',v_line_no,'replayed',false);
  end if;

  if p_action='closePurchaseOrder' then
    v_id:=private.shop_uuid(p_input,'orderId');
    v_name:=btrim(coalesce(p_input->>'reason',''));
    if length(v_name) not between 4 and 200 then
      raise exception 'Explain why the remaining order is closed' using errcode='22023';
    end if;
    perform 1 from public.shop_purchase_orders where business_id=v_company and id=v_id;
    if not found then raise exception 'Order not found' using errcode='42501'; end if;
    select reason into v_reference from public.shop_purchase_closures where order_id=v_id;
    if found then
      if v_reference<>v_name then raise exception 'Order closed for a different reason' using errcode='23505'; end if;
      return jsonb_build_object('orderId',v_id,'closed',true,'replayed',true);
    end if;
    insert into public.shop_purchase_closures(order_id,business_id,reason,actor_id)
      values(v_id,v_company,v_name,p_actor);
    return jsonb_build_object('orderId',v_id,'closed',true,'replayed',false);
  end if;

  if p_action='receivePurchase' then
    v_id:=private.shop_uuid(p_input,'receiptId');
    v_order.id:=private.shop_uuid(p_input,'orderId');
    if jsonb_typeof(p_input->'lines') is distinct from 'array' or
       jsonb_array_length(p_input->'lines') not between 1 and 100 then
      raise exception 'Receipt needs 1–100 lines' using errcode='22023';
    end if;
    v_hash:=encode(sha256(convert_to(jsonb_build_object(
      'orderId',v_order.id,'lines',p_input->'lines')::text,'UTF8')),'hex');
    select * into v_receipt from public.shop_purchase_receipts where id=v_id for update;
    if found then
      if v_receipt.business_id<>v_company or v_receipt.request_hash<>v_hash then
        raise exception 'Receipt ID already used with different details' using errcode='23505';
      end if;
      return jsonb_build_object('receiptId',v_id,'orderId',v_receipt.order_id,
        'totalMinor',v_receipt.total_minor::text,'replayed',true);
    end if;
    select * into v_order from public.shop_purchase_orders
      where business_id=v_company and id=v_order.id for update;
    if not found then raise exception 'Order unavailable' using errcode='42501'; end if;
    if exists(select 1 from public.shop_purchase_closures where order_id=v_order.id) then
      raise exception 'Purchase order is closed' using errcode='23514';
    end if;
    perform 1 from public.shop_stores
      where business_id=v_company and id=v_order.store_id and status='active';
    if not found then raise exception 'Receiving store unavailable' using errcode='42501'; end if;
    v_seen:='{}'::jsonb;v_total:=0;v_lines_out:='[]'::jsonb;
    -- First prevalidate all quantities before any stock is changed.
    for v_line in select * from jsonb_array_elements(p_input->'lines') loop
      v_line_no:=private.shop_int(v_line,'lineNo',1,100)::int;
      v_qty:=private.shop_int(v_line,'quantity',1,100000);
      if v_seen ? v_line_no::text then raise exception 'Duplicate received line' using errcode='22023'; end if;
      v_seen:=v_seen||jsonb_build_object(v_line_no::text,true);
      select l.product_id,l.ordered_quantity,l.unit_cost_minor
        into v_product,v_ordered,v_cost from public.shop_purchase_order_lines l
        where l.order_id=v_order.id and l.line_no=v_line_no;
      if not found then raise exception 'Order line not found' using errcode='22023'; end if;
      select coalesce(sum(rl.quantity),0) into v_received
        from public.shop_purchase_receipt_lines rl
        where rl.order_id=v_order.id and rl.line_no=v_line_no;
      if v_qty>v_ordered-v_received then
        raise exception 'Goods received exceed outstanding order quantity' using errcode='23514';
      end if;
      v_total:=v_total+v_qty::numeric*v_cost;
      if v_total>100000000000000 then
        raise exception 'Receipt amount too large' using errcode='22003';
      end if;
      v_lines_out:=v_lines_out||jsonb_build_array(jsonb_build_object(
        'lineNo',v_line_no,'productId',v_product,'quantity',v_qty,
        'unitCostMinor',v_cost,'amountMinor',v_qty*v_cost));
    end loop;
    insert into public.shop_purchase_receipts(id,business_id,order_id,request_hash,total_minor,actor_id)
      values(v_id,v_company,v_order.id,v_hash,v_total::bigint,p_actor);
    for v_line in select * from jsonb_array_elements(v_lines_out) loop
      v_line_no:=(v_line->>'lineNo')::int;
      v_product:=(v_line->>'productId')::uuid;
      v_qty:=(v_line->>'quantity')::bigint;
      v_cost:=(v_line->>'unitCostMinor')::bigint;
      insert into public.shop_store_stock(business_id,store_id,product_id,quantity)
        values(v_company,v_order.store_id,v_product,0) on conflict do nothing;
      select quantity into v_stock from public.shop_store_stock
        where business_id=v_company and store_id=v_order.store_id
          and product_id=v_product for update;
      if v_stock+v_qty>2147483647 then raise exception 'Stock overflow' using errcode='22003'; end if;
      update public.shop_store_stock set quantity=quantity+v_qty::int,updated_at=clock_timestamp()
        where business_id=v_company and store_id=v_order.store_id and product_id=v_product
        returning quantity into v_stock;
      insert into public.shop_purchase_receipt_lines(business_id,receipt_id,
        order_id,line_no,quantity,unit_cost_minor,amount_minor)
        values(v_company,v_id,v_order.id,v_line_no,v_qty::int,v_cost,v_qty*v_cost);
      v_op:=private.shop_derived_uuid(v_id,'stage-d-purchase-'||v_line_no::text);
      insert into public.shop_stock_movements(business_id,store_id,product_id,
        delta,quantity_after,reason,operation_id,note,actor_id)
        values(v_company,v_order.store_id,v_product,v_qty::int,v_stock,
          'purchase',v_op,'Purchase receipt '||v_id::text,p_actor);
    end loop;
    return jsonb_build_object('receiptId',v_id,'orderId',v_order.id,
      'totalMinor',v_total::text,'replayed',false);
  end if;

  if p_action='settleSupplier' then
    v_id:=private.shop_uuid(p_input,'settlementId');
    v_supplier:=private.shop_uuid(p_input,'supplierId');
    v_qty:=private.shop_int(p_input,'amountMinor',1,100000000000000);
    v_method:=p_input->>'method';
    if v_method not in ('cash','mobile','card','bank') or v_method is null then
      raise exception 'Unsupported supplier payment method' using errcode='22023';
    end if;
    v_reference:=nullif(btrim(coalesce(p_input->>'reference','')),'');
    if v_reference is not null and length(v_reference)>120 then
      raise exception 'Payment reference too long' using errcode='22023';
    end if;
    if jsonb_typeof(p_input->'externalSettlementConfirmed') is distinct from 'boolean'
        or p_input->>'externalSettlementConfirmed'<>'true' then
      raise exception 'Confirm the payment happened outside Tallybook before recording it' using errcode='22023';
    end if;
    v_hash:=encode(sha256(convert_to(jsonb_build_object('supplierId',v_supplier,
      'amountMinor',v_qty,'method',v_method,'reference',v_reference)::text,'UTF8')),'hex');
    select * into v_settlement from public.shop_supplier_settlements where id=v_id for update;
    if found then
      if v_settlement.business_id<>v_company or v_settlement.request_hash<>v_hash then
        raise exception 'Settlement ID already used with different details' using errcode='23505';
      end if;
      return jsonb_build_object('settlementId',v_id,'replayed',true,
        'amountMinor',v_settlement.amount_minor::text,'externalPaymentExecuted',false);
    end if;
    perform 1 from public.shop_suppliers where business_id=v_company and id=v_supplier;
    if not found then raise exception 'Supplier unavailable' using errcode='42501'; end if;
    select coalesce(sum(r.total_minor),0) into v_sum_received
      from public.shop_purchase_receipts r
      join public.shop_purchase_orders o on o.id=r.order_id
      where o.business_id=v_company and o.supplier_id=v_supplier;
    select coalesce(sum(s.amount_minor),0) into v_sum_paid
      from public.shop_supplier_settlements s
      where s.business_id=v_company and s.supplier_id=v_supplier;
    v_outstanding:=v_sum_received-v_sum_paid;
    if v_qty>v_outstanding then
      raise exception 'Supplier payment exceeds unpaid received goods' using errcode='23514';
    end if;
    insert into public.shop_supplier_settlements(id,business_id,supplier_id,
      request_hash,amount_minor,method,reference,actor_id)
      values(v_id,v_company,v_supplier,v_hash,v_qty,v_method,v_reference,p_actor);
    return jsonb_build_object('settlementId',v_id,'replayed',false,
      'amountMinor',v_qty::text,'outstandingMinor',(v_outstanding-v_qty)::text,
      'externalPaymentExecuted',false);
  end if;
  raise exception 'Unknown purchasing operation' using errcode='42501';
end $fn$;
revoke all on function private.shop_stage_d_purchase_action(text,uuid,uuid,jsonb)
  from public,anon,authenticated;

drop function private.shop_stage_i_attendant_stock(text, uuid, uuid, jsonb);
drop function private.shop_can_manage_stock(uuid, uuid);
alter table public.shop_member_permissions drop column can_manage_stock;

commit;
