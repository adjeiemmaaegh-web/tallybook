-- Backend Stage D2: suppliers, purchase orders, partial goods receipts and
-- supplier payable settlement. Purchases increase stock only when received.
-- A financial settlement is ledger evidence, NOT a bank/MoMo payment.
begin;

create table public.shop_suppliers (
  id uuid primary key,
  business_id uuid not null references public.businesses(id),
  name text not null check (length(btrim(name)) between 1 and 120),
  archived boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (business_id,id)
);
create unique index shop_suppliers_active_name
  on public.shop_suppliers(business_id,lower(btrim(name))) where archived=false;

create table public.shop_purchase_orders (
  id uuid primary key,
  business_id uuid not null references public.businesses(id),
  store_id uuid not null,
  supplier_id uuid not null,
  order_hash text not null check (order_hash ~ '^[0-9a-f]{64}$'),
  reference text check (reference is null or length(btrim(reference)) between 1 and 100),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (business_id,id),
  foreign key (business_id,store_id) references public.shop_stores(business_id,id),
  foreign key (business_id,supplier_id) references public.shop_suppliers(business_id,id)
);
create index shop_purchase_orders_supplier_time
  on public.shop_purchase_orders(business_id,supplier_id,created_at desc);

create table public.shop_purchase_order_lines (
  business_id uuid not null,
  order_id uuid not null,
  line_no smallint not null check (line_no between 1 and 100),
  product_id uuid not null,
  ordered_quantity integer not null check (ordered_quantity between 1 and 100000),
  unit_cost_minor bigint not null check (unit_cost_minor between 0 and 100000000000),
  primary key(order_id,line_no),
  unique(order_id,product_id),
  foreign key(business_id,order_id) references public.shop_purchase_orders(business_id,id),
  foreign key(business_id,product_id) references public.shop_products(business_id,id)
);

create table public.shop_purchase_receipts (
  id uuid primary key,
  business_id uuid not null,
  order_id uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  total_minor bigint not null check (total_minor between 0 and 100000000000000),
  actor_id uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  unique(business_id,id),
  foreign key(business_id,order_id) references public.shop_purchase_orders(business_id,id)
);
create index shop_purchase_receipts_order_time on public.shop_purchase_receipts(business_id,order_id,recorded_at desc);

create table public.shop_purchase_receipt_lines (
  business_id uuid not null,
  receipt_id uuid not null,
  order_id uuid not null,
  line_no smallint not null check (line_no between 1 and 100),
  quantity integer not null check (quantity between 1 and 100000),
  unit_cost_minor bigint not null,
  amount_minor bigint not null check (amount_minor>=0),
  primary key(receipt_id,line_no),
  check (amount_minor=quantity::bigint*unit_cost_minor),
  foreign key(business_id,receipt_id) references public.shop_purchase_receipts(business_id,id),
  foreign key(order_id,line_no) references public.shop_purchase_order_lines(order_id,line_no)
);
create index shop_purchase_receipt_lines_order on public.shop_purchase_receipt_lines(order_id,line_no);

-- Closing an order closes ONLY its undelivered remainder. Previously
-- received goods and associated payables remain intact forever.
create table public.shop_purchase_closures (
  order_id uuid primary key,
  business_id uuid not null,
  reason text not null check (length(btrim(reason)) between 4 and 200),
  actor_id uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  foreign key(business_id,order_id) references public.shop_purchase_orders(business_id,id)
);

create table public.shop_supplier_settlements (
  id uuid primary key,
  business_id uuid not null,
  supplier_id uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  amount_minor bigint not null check (amount_minor between 1 and 100000000000000),
  method text not null check(method in ('cash','mobile','card','bank')),
  reference text check(reference is null or length(btrim(reference)) between 1 and 120),
  actor_id uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  unique (business_id,id),
  foreign key(business_id,supplier_id) references public.shop_suppliers(business_id,id)
);
create index shop_supplier_settlements_supplier on public.shop_supplier_settlements(business_id,supplier_id,recorded_at desc);

do $$
declare tbl text;
begin
  foreach tbl in array array[
      'shop_suppliers','shop_purchase_orders','shop_purchase_order_lines',
      'shop_purchase_receipts','shop_purchase_receipt_lines',
      'shop_purchase_closures','shop_supplier_settlements'] loop
    execute format('alter table public.%I enable row level security',tbl);
    execute format('alter table public.%I force row level security',tbl);
    execute format('revoke all on table public.%I from public,anon,authenticated',tbl);
  end loop;
end $$;
-- Immutable financial and product-provenance entries, including through
-- elevated query paths. Suppliers may be archived, never hard-deleted.
do $$
declare tbl text;
begin
  foreach tbl in array array[
    'shop_purchase_orders','shop_purchase_order_lines','shop_purchase_receipts',
    'shop_purchase_receipt_lines','shop_purchase_closures','shop_supplier_settlements'] loop
    execute format('create trigger %I before update or delete on public.%I for each row execute function private.shop_reject_history_change()',
      tbl||'_append_only',tbl);
  end loop;
end $$;

create function private.shop_stage_d_purchase_action(
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

commit;
