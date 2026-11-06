-- Backend Stage D1: audited stock counts and inter-store transfers.
-- All mutations are owner-only, transaction-scoped, idempotent and server-side.
-- Existing sale/refund stock semantics and foreign keys remain unchanged.
begin;

alter table public.shop_stock_movements
  drop constraint shop_stock_movements_reason_valid;
alter table public.shop_stock_movements
  add constraint shop_stock_movements_reason_valid check (
    reason in ('sale','restock','correction','refund','opening',
               'stocktake','transfer_out','transfer_in','purchase'));

create table public.shop_stock_counts (
  id uuid primary key,
  business_id uuid not null references public.businesses(id),
  store_id uuid not null,
  product_id uuid not null,
  expected_quantity integer not null check (expected_quantity >= 0),
  counted_quantity integer check (counted_quantity between 0 and 2147483647),
  status text not null default 'open' check (status in ('open','applied','cancelled')),
  created_by uuid not null references auth.users(id),
  applied_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  unique (business_id,id),
  foreign key (business_id,store_id) references public.shop_stores(business_id,id),
  foreign key (business_id,product_id) references public.shop_products(business_id,id),
  check ((status='applied')=(counted_quantity is not null)),
  check ((status='applied')=(applied_at is not null))
);
create index shop_stock_counts_store_time on public.shop_stock_counts(business_id,store_id,created_at desc);

create table public.shop_transfers (
  id uuid primary key,
  business_id uuid not null references public.businesses(id),
  from_store_id uuid not null,
  to_store_id uuid not null,
  product_id uuid not null,
  quantity integer not null check (quantity between 1 and 100000),
  status text not null default 'requested'
    check (status in ('requested','in_transit','received','cancelled')),
  requested_by uuid not null references auth.users(id),
  dispatched_by uuid references auth.users(id),
  received_by uuid references auth.users(id),
  requested_at timestamptz not null default now(),
  dispatched_at timestamptz,
  received_at timestamptz,
  unique (business_id,id),
  check (from_store_id<>to_store_id),
  check ((status in ('in_transit','received'))=(dispatched_at is not null)),
  check ((status='received')=(received_at is not null)),
  foreign key (business_id,from_store_id) references public.shop_stores(business_id,id),
  foreign key (business_id,to_store_id) references public.shop_stores(business_id,id),
  foreign key (business_id,product_id) references public.shop_products(business_id,id)
);
create index shop_transfers_company_time on public.shop_transfers(business_id,requested_at desc);

do $$
declare tbl text;
begin
  foreach tbl in array array['shop_stock_counts','shop_transfers'] loop
    execute format('alter table public.%I enable row level security',tbl);
    execute format('alter table public.%I force row level security',tbl);
    execute format('revoke all on table public.%I from public,anon,authenticated',tbl);
  end loop;
end $$;

-- A shared lock on the shop ledger serializes stock-changing operations
-- with the existing sale/stock RPC, but does not replace stock-row FOR UPDATE.
create function private.shop_stage_d_stock_action(
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

commit;
