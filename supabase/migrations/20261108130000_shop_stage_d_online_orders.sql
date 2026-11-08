-- Backend Stage D3: owner-entered online orders with human-reviewed
-- acceptance and immutable sale linkage. No public storefront or payment
-- integration is provided. Accepting NEVER reserves or deducts stock.
-- Marking sold requires an existing REAL shop sale, and never posts it twice.
begin;

create table public.shop_online_orders (
  id uuid primary key,
  business_id uuid not null references public.businesses(id),
  store_id uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  customer_reference text check (customer_reference is null or length(btrim(customer_reference)) between 1 and 120),
  quoted_total_minor bigint not null check (quoted_total_minor between 0 and 100000000000000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (business_id,id),
  foreign key (business_id,store_id) references public.shop_stores(business_id,id)
);
create index shop_online_orders_business_time
  on public.shop_online_orders(business_id,created_at desc);

create table public.shop_online_order_lines (
  business_id uuid not null,
  order_id uuid not null,
  line_no smallint not null check (line_no between 1 and 100),
  product_id uuid not null,
  product_name text not null,
  quantity integer not null check(quantity between 1 and 100000),
  quoted_unit_price_minor bigint not null check(quoted_unit_price_minor between 0 and 100000000000),
  primary key(order_id,line_no),
  unique(order_id,product_id),
  foreign key(business_id,order_id) references public.shop_online_orders(business_id,id),
  foreign key(business_id,product_id) references public.shop_products(business_id,id)
);

-- Event snapshots are immutable; an acceptance does not reserve stock.
create table public.shop_online_order_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  order_id uuid not null,
  kind text not null check(kind in ('accepted','closed')),
  reason text,
  actor_id uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  unique(order_id,kind),
  check ((kind='closed')=(reason is not null)),
  check (reason is null or length(btrim(reason)) between 3 and 200),
  foreign key(business_id,order_id) references public.shop_online_orders(business_id,id)
);

-- A POS sale may fulfill at most one online order, and an order at most one
-- sale. The sale already moved stock and receivables; this only links evidence.
create table public.shop_online_order_fulfillments (
  business_id uuid not null,
  order_id uuid primary key,
  sale_id uuid not null,
  actor_id uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  unique(business_id,sale_id),
  foreign key(business_id,order_id) references public.shop_online_orders(business_id,id),
  foreign key(business_id,sale_id) references public.shop_sales(business_id,id)
);

do $$
declare tbl text;
begin
  foreach tbl in array array[
    'shop_online_orders','shop_online_order_lines','shop_online_order_events',
    'shop_online_order_fulfillments'] loop
    execute format('alter table public.%I enable row level security',tbl);
    execute format('alter table public.%I force row level security',tbl);
    execute format('revoke all on table public.%I from public,anon,authenticated',tbl);
    execute format('create trigger %I before update or delete on public.%I for each row execute function private.shop_reject_history_change()',
      tbl||'_append_only',tbl);
  end loop;
end $$;

create function private.shop_stage_d_online_action(
  p_action text,p_actor uuid,p_session uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_company uuid;
  v_role text;
  v_id uuid;
  v_store uuid;
  v_product uuid;
  v_sale uuid;
  v_order public.shop_online_orders;
  v_link public.shop_online_order_fulfillments;
  v_name text;
  v_ref text;
  v_hash text;
  v_lines jsonb;
  v_line jsonb;
  v_qty bigint;
  v_price bigint;
  v_total numeric:=0;
  v_line_no int:=0;
  v_seen jsonb:='{}'::jsonb;
begin
  if jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'Invalid online order request' using errcode='22023';
  end if;
  v_company:=private.shop_uuid(p_input,'companyId');
  v_role:=private.shop_member_role(p_actor,p_session,v_company);
  if v_role<>'owner' then
    raise exception 'Only the owner can manage these online orders' using errcode='42501';
  end if;
  if p_action='listOnlineOrders' then
    return jsonb_build_object('orders',coalesce((
      select jsonb_agg(jsonb_build_object('orderId',o.id,'storeId',o.store_id,
        'quotedTotalMinor',o.quoted_total_minor::text,
        'customerReference',o.customer_reference,
        'status',case when f.order_id is not null then 'sold'
          when e_closed.order_id is not null then 'closed'
          when e_accept.order_id is not null then 'accepted' else 'new' end,
        'saleId',f.sale_id,'createdAt',o.created_at)
        order by o.created_at desc)
      from (select * from public.shop_online_orders where business_id=v_company
        order by created_at desc limit 100) o
      left join public.shop_online_order_fulfillments f on f.order_id=o.id
      left join public.shop_online_order_events e_closed on e_closed.order_id=o.id and e_closed.kind='closed'
      left join public.shop_online_order_events e_accept on e_accept.order_id=o.id and e_accept.kind='accepted'
    ),'[]'::jsonb));
  end if;

  perform 1 from public.shop_ledgers where business_id=v_company for update;
  if not found then raise exception 'Set up a shop before taking orders' using errcode='42501'; end if;

  if p_action='createOnlineOrder' then
    v_id:=private.shop_uuid(p_input,'orderId');
    v_store:=private.shop_uuid(p_input,'storeId');
    v_ref:=nullif(btrim(coalesce(p_input->>'customerReference','')),'');
    if v_ref is not null and length(v_ref)>120 then
      raise exception 'Customer reference too long' using errcode='22023';
    end if;
    if jsonb_typeof(p_input->'lines') is distinct from 'array'
      or jsonb_array_length(p_input->'lines') not between 1 and 100 then
      raise exception 'Order requires 1 to 100 lines' using errcode='22023';
    end if;
    v_hash:=encode(sha256(convert_to(jsonb_build_object('storeId',v_store,
      'customerReference',v_ref,'lines',p_input->'lines')::text,'UTF8')),'hex');
    select * into v_order from public.shop_online_orders where id=v_id;
    if found then
      if v_order.business_id<>v_company or v_order.request_hash<>v_hash then
        raise exception 'Order ID already used with different details' using errcode='23505';
      end if;
      return jsonb_build_object('orderId',v_id,'quotedTotalMinor',v_order.quoted_total_minor::text,'replayed',true);
    end if;
    perform 1 from public.shop_stores
      where business_id=v_company and id=v_store and status='active';
    if not found then raise exception 'Store unavailable' using errcode='42501'; end if;
    v_lines:='[]'::jsonb;
    for v_line in select * from jsonb_array_elements(p_input->'lines') loop
      v_line_no:=v_line_no+1;
      v_product:=private.shop_uuid(v_line,'productId');
      v_qty:=private.shop_int(v_line,'quantity',1,100000);
      if v_seen ? v_product::text then raise exception 'Duplicate product in order' using errcode='22023'; end if;
      v_seen:=v_seen||jsonb_build_object(v_product::text,true);
      select name,unit_price_minor into v_name,v_price
        from public.shop_products where business_id=v_company and id=v_product and active;
      if not found then raise exception 'Product unavailable' using errcode='42501'; end if;
      v_total:=v_total+v_qty::numeric*v_price;
      if v_total>100000000000000 then raise exception 'Order value too large' using errcode='22003'; end if;
      v_lines:=v_lines||jsonb_build_array(jsonb_build_object('lineNo',v_line_no,
        'productId',v_product,'productName',v_name,'quantity',v_qty,'unitPrice',v_price));
    end loop;
    insert into public.shop_online_orders(id,business_id,store_id,request_hash,
      customer_reference,quoted_total_minor,created_by)
      values(v_id,v_company,v_store,v_hash,v_ref,v_total::bigint,p_actor);
    for v_line in select * from jsonb_array_elements(v_lines) loop
      insert into public.shop_online_order_lines(business_id,order_id,line_no,
        product_id,product_name,quantity,quoted_unit_price_minor)
        values(v_company,v_id,(v_line->>'lineNo')::int,
          (v_line->>'productId')::uuid,v_line->>'productName',
          (v_line->>'quantity')::int,(v_line->>'unitPrice')::bigint);
    end loop;
    return jsonb_build_object('orderId',v_id,'quotedTotalMinor',v_total::text,
      'status','new','stockReserved',false,'replayed',false);
  end if;

  v_id:=private.shop_uuid(p_input,'orderId');
  select * into v_order from public.shop_online_orders
    where business_id=v_company and id=v_id;
  if not found then raise exception 'Online order not found' using errcode='42501'; end if;

  if p_action='acceptOnlineOrder' then
    if exists(select 1 from public.shop_online_order_fulfillments where order_id=v_id) then
      raise exception 'Sold order cannot be accepted again' using errcode='23514';
    end if;
    if exists(select 1 from public.shop_online_order_events where order_id=v_id and kind='closed') then
      raise exception 'Closed order cannot be accepted' using errcode='23514';
    end if;
    if exists(select 1 from public.shop_online_order_events where order_id=v_id and kind='accepted') then
      return jsonb_build_object('orderId',v_id,'status','accepted','stockReserved',false,'replayed',true);
    end if;
    if exists(
      select 1 from public.shop_online_order_lines l
        left join public.shop_store_stock ss
          on ss.business_id=v_company and ss.store_id=v_order.store_id and ss.product_id=l.product_id
        where l.order_id=v_id and coalesce(ss.quantity,0)<l.quantity
    ) then raise exception 'Store stock does not cover this order at acceptance time' using errcode='23514'; end if;
    insert into public.shop_online_order_events(business_id,order_id,kind,actor_id)
      values(v_company,v_id,'accepted',p_actor);
    return jsonb_build_object('orderId',v_id,'status','accepted',
      'stockReserved',false,'replayed',false);
  end if;

  if p_action='closeOnlineOrder' then
    v_ref:=btrim(coalesce(p_input->>'reason',''));
    if length(v_ref) not between 3 and 200 then
      raise exception 'Explain why the order is closing' using errcode='22023';
    end if;
    if exists(select 1 from public.shop_online_order_fulfillments where order_id=v_id) then
      raise exception 'Sold order cannot be closed as unfulfilled' using errcode='23514';
    end if;
    select e.reason into v_name from public.shop_online_order_events e
      where e.order_id=v_id and e.kind='closed';
    if found then
      if v_name<>v_ref then raise exception 'Order already closed for another reason' using errcode='23505'; end if;
      return jsonb_build_object('orderId',v_id,'status','closed','replayed',true);
    end if;
    insert into public.shop_online_order_events(business_id,order_id,kind,reason,actor_id)
      values(v_company,v_id,'closed',v_ref,p_actor);
    return jsonb_build_object('orderId',v_id,'status','closed','replayed',false);
  end if;

  if p_action='linkOnlineOrderSale' then
    v_sale:=private.shop_uuid(p_input,'saleId');
    select * into v_link from public.shop_online_order_fulfillments
      where business_id=v_company and order_id=v_id;
    if found then
      if v_link.sale_id<>v_sale then
        raise exception 'Order already linked to a different sale' using errcode='23505';
      end if;
      return jsonb_build_object('orderId',v_id,'saleId',v_sale,'status','sold','replayed',true);
    end if;
    if not exists(select 1 from public.shop_online_order_events where order_id=v_id and kind='accepted') then
      raise exception 'Accept this online order before linking a sale' using errcode='23514';
    end if;
    if exists(select 1 from public.shop_online_order_events where order_id=v_id and kind='closed') then
      raise exception 'Closed order cannot be sold' using errcode='23514';
    end if;
    perform 1 from public.shop_sales s
      where s.business_id=v_company and s.id=v_sale and s.store_id=v_order.store_id;
    if not found then raise exception 'Recorded sale not found for this store' using errcode='42501'; end if;
    if exists(
      select 1 from (
        select product_id,sum(quantity)::bigint qty from public.shop_online_order_lines
          where order_id=v_id group by product_id
      ) o full outer join (
        select product_id,sum(quantity)::bigint qty from public.shop_sale_lines
          where sale_id=v_sale group by product_id
      ) s using(product_id)
      where coalesce(o.qty,0)<>coalesce(s.qty,0)
    ) then raise exception 'Recorded sale products do not match the online order' using errcode='23514'; end if;
    if exists(select 1 from public.shop_online_order_fulfillments where business_id=v_company and sale_id=v_sale) then
      raise exception 'Sale is already linked to another online order' using errcode='23505';
    end if;
    insert into public.shop_online_order_fulfillments(business_id,order_id,sale_id,actor_id)
      values(v_company,v_id,v_sale,p_actor);
    return jsonb_build_object('orderId',v_id,'saleId',v_sale,'status','sold',
      'stockAdjustedByLink',false,'replayed',false);
  end if;
  raise exception 'Unknown online order operation' using errcode='42501';
end $fn$;

revoke all on function private.shop_stage_d_online_action(text,uuid,uuid,jsonb)
  from public,anon,authenticated;

create or replace function public.tallybook_shop_ops(p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $body$
declare actor uuid:=auth.uid();sid uuid;
begin
  begin sid:=(auth.jwt()->>'session_id')::uuid;
  exception when others then sid:=null; end;
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
