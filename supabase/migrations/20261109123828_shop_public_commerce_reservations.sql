-- Customer commerce uses the existing authoritative shop ledger. Nothing is
-- published by applying this migration: each owner must explicitly publish.
-- No payment provider, outgoing notification or external deployment is enabled.
begin;

create table public.shop_public_catalogues (
  business_id uuid primary key references public.shop_ledgers(business_id),
  store_id uuid not null,
  revision integer not null check(revision > 0),
  enabled boolean not null default false,
  privacy_notice text not null check(length(btrim(privacy_notice)) between 20 and 2000),
  retention_days integer not null check(retention_days between 7 and 365),
  tax_configuration jsonb not null check(tax_configuration = '{"mode":"off","ownerConfirmed":true}'::jsonb),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key(business_id,store_id) references public.shop_stores(business_id,id)
);
create table public.shop_public_products (
  business_id uuid not null references public.shop_public_catalogues(business_id),
  product_id uuid not null,
  primary key(business_id,product_id),
  foreign key(business_id,product_id) references public.shop_products(business_id,id)
);
create table public.shop_customer_orders (
  id uuid primary key,
  business_id uuid not null references public.shop_ledgers(business_id),
  store_id uuid not null,
  customer_user_id uuid not null references auth.users(id),
  request_hash text not null check(request_hash ~ '^[0-9a-f]{64}$'),
  catalogue_revision integer not null check(catalogue_revision > 0),
  customer_name text check(length(customer_name) between 1 and 120),
  customer_contact text check(length(customer_contact) between 1 and 100),
  delivery_method text not null check(delivery_method in ('pickup','delivery')),
  delivery_notes text check(length(delivery_notes)<=300),
  privacy_notice text not null,
  retention_until timestamptz not null,
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  total_minor bigint not null check(total_minor between 0 and 100000000000000),
  tax_configuration jsonb not null,
  return_policy jsonb not null,
  status text not null check(status in ('reserved','cancelled','sale-recorded')),
  fulfillment_status text not null default 'unprocessed'
    check(fulfillment_status in ('unprocessed','packed','dispatched','delivered','return-requested')),
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  sale_id uuid,
  sale_submission_key text,
  unique(business_id,id),
  unique(business_id,sale_id),
  foreign key(business_id,store_id) references public.shop_stores(business_id,id),
  foreign key(business_id,sale_id) references public.shop_sales(business_id,id),
  check((status='sale-recorded')=(sale_id is not null)),
  check(expires_at > created_at)
);
create index shop_customer_orders_customer_time on public.shop_customer_orders(customer_user_id,created_at desc);
create index shop_customer_orders_reservations on public.shop_customer_orders(business_id,store_id,expires_at) where status='reserved';
create index shop_customer_orders_retention on public.shop_customer_orders(business_id,retention_until) where customer_name is not null;
create table public.shop_customer_order_lines (
  business_id uuid not null,
  order_id uuid not null,
  product_id uuid not null,
  product_name text not null,
  quantity integer not null check(quantity between 1 and 9999),
  unit_price_minor bigint not null check(unit_price_minor between 0 and 100000000000),
  primary key(order_id,product_id),
  foreign key(business_id,order_id) references public.shop_customer_orders(business_id,id),
  foreign key(business_id,product_id) references public.shop_products(business_id,id)
);
create index shop_customer_order_lines_product on public.shop_customer_order_lines(business_id,product_id,order_id);
create table public.shop_customer_order_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  order_id uuid not null,
  actor_id uuid not null references auth.users(id),
  kind text not null check(kind in ('reserved','cancelled','sale-recorded','packed','dispatched','delivered','return-requested','privacy-redacted')),
  note text check(length(note) between 3 and 300),
  created_at timestamptz not null default clock_timestamp(),
  unique(order_id,kind),
  foreign key(business_id,order_id) references public.shop_customer_orders(business_id,id)
);
do $$ declare tbl text; begin
  foreach tbl in array array['shop_public_catalogues','shop_public_products','shop_customer_orders','shop_customer_order_lines','shop_customer_order_events'] loop
    execute format('alter table public.%I enable row level security',tbl);
    execute format('alter table public.%I force row level security',tbl);
    execute format('revoke all on table public.%I from public,anon,authenticated',tbl);
  end loop;
end $$;
create trigger shop_customer_order_lines_immutable before update or delete on public.shop_customer_order_lines
  for each row execute function private.shop_reject_history_change();
create trigger shop_customer_order_events_immutable before update or delete on public.shop_customer_order_events
  for each row execute function private.shop_reject_history_change();

create function private.shop_customer_session(p_actor uuid,p_session uuid) returns void
language plpgsql stable security definer set search_path='' as $$
begin
  if p_actor is null or p_session is null or coalesce(auth.jwt()->>'is_anonymous','false') <> 'false' then
    raise exception 'Sign in with a customer account' using errcode='42501';
  end if;
  if not exists(select 1 from auth.sessions s where s.id=p_session and s.user_id=p_actor
    and (s.not_after is null or s.not_after>clock_timestamp())) then
    raise exception 'Active customer session required' using errcode='42501';
  end if;
end $$;

create function private.shop_customer_reserved(p_company uuid,p_store uuid,p_product uuid) returns bigint
language sql stable security definer set search_path='' as $$
  select coalesce(sum(l.quantity),0)::bigint
  from public.shop_customer_orders o join public.shop_customer_order_lines l on l.order_id=o.id
  where o.business_id=p_company and o.store_id=p_store and l.product_id=p_product
    and o.status='reserved' and o.expires_at>clock_timestamp()
$$;

-- Every existing POS, transfer and adjustment path now respects reservations.
-- There is no browser-controlled GUC or claimed-order bypass.
create function private.shop_customer_stock_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.quantity < old.quantity then
    perform 1 from public.shop_ledgers where business_id=new.business_id for update;
    if new.quantity < private.shop_customer_reserved(new.business_id,new.store_id,new.product_id) then
      raise exception 'Stock is reserved for customer orders' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
create trigger shop_customer_stock_guard before update of quantity on public.shop_store_stock
  for each row execute function private.shop_customer_stock_guard();

create function private.shop_customer_order_json(p_order uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('orderId',o.id,'companyId',o.business_id,'storeId',o.store_id,
    'catalogueRevision',o.catalogue_revision,'currency',o.currency,'totalMinor',o.total_minor::text,
    'status',case when o.status='reserved' and o.expires_at<=clock_timestamp() then 'expired' else o.status end,
    'fulfillmentStatus',o.fulfillment_status,'createdAt',o.created_at,'expiresAt',o.expires_at,
    'customerName',case when o.retention_until>clock_timestamp() then o.customer_name else null end,
    'customerContact',case when o.retention_until>clock_timestamp() then o.customer_contact else null end,
    'deliveryNotes',case when o.retention_until>clock_timestamp() then o.delivery_notes else null end,
    'deliveryMethod',o.delivery_method,'taxConfiguration',o.tax_configuration,'returnPolicy',o.return_policy,
    'privacyNotice',o.privacy_notice,'retentionUntil',o.retention_until,'saleId',o.sale_id,
    'refundedMinor',coalesce((select sum(r.amount_minor) from public.shop_refunds r where r.sale_id=o.sale_id),0)::text,
    'lines',coalesce((select jsonb_agg(jsonb_build_object('productId',l.product_id,'name',l.product_name,
       'quantity',l.quantity,'unitPriceMinor',l.unit_price_minor::text) order by l.product_id)
       from public.shop_customer_order_lines l where l.order_id=o.id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('kind',e.kind,'recordedAt',e.created_at)
       order by e.created_at,e.id) from public.shop_customer_order_events e where e.order_id=o.id),'[]'::jsonb))
  from public.shop_customer_orders o where o.id=p_order
$$;

create function public.tallybook_catalogue(p_company uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.shop_public_catalogues; result jsonb;
begin
  select * into c from public.shop_public_catalogues where business_id=p_company and enabled;
  if not found or not exists(select 1 from public.shop_stores where id=c.store_id and business_id=p_company and status='active') then
    raise exception 'Catalogue unavailable' using errcode='42501';
  end if;
  select jsonb_build_object('companyId',p_company,'name',b.name,'storeId',c.store_id,
    'revision',c.revision,'currency',ledger.currency,'privacyNotice',c.privacy_notice,
    'retentionDays',c.retention_days,'taxConfiguration',c.tax_configuration,
    'returnPolicy',private.shop_refund_policy_json(p_company,'customer')-'history',
    'paymentEnabled',false,'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'name',p.name,'priceMinor',p.unit_price_minor::text,
      'available',coalesce(k.quantity,0)>private.shop_customer_reserved(p_company,c.store_id,p.id)) order by p.name,p.id)
      from public.shop_public_products listed join public.shop_products p on p.id=listed.product_id and p.business_id=listed.business_id
      left join public.shop_store_stock k on k.store_id=c.store_id and k.product_id=p.id
      where listed.business_id=p_company and p.active),'[]'::jsonb)) into result
    from public.businesses b join public.shop_ledgers ledger on ledger.business_id=b.id where b.id=p_company;
  return result || jsonb_build_object('digest',encode(sha256(convert_to((result-'items' || jsonb_build_object('items',coalesce((select jsonb_agg(value-'available') from jsonb_array_elements(result->'items')),'[]'::jsonb)))::text,'UTF8')),'hex'));
end $$;

-- The callable action layer below derives actor/session from Auth, never JSON.
create function private.shop_public_commerce_action(p_action text,p_actor uuid,p_session uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare
  company uuid; order_id uuid; store uuid; product uuid; role_name text;
  c public.shop_public_catalogues; o public.shop_customer_orders;
  item jsonb; items jsonb; lines jsonb:='[]'::jsonb; names jsonb:='{}'::jsonb;
  qty bigint; price bigint; available bigint; total numeric:=0; fingerprint text;
  customer_name text; contact text; notes text; delivery text; product_name text;
  event_kind text; at_time timestamptz:=clock_timestamp(); revision integer; days integer;
begin
  if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>24000 then
    raise exception 'Invalid commerce input' using errcode='22023';
  end if;
  perform private.shop_customer_session(p_actor,p_session);
  company:=private.shop_uuid(p_input,'companyId');
  if p_action in ('publish','unpublish','settings','merchantOrders','transition','redact') then
    role_name:=private.shop_member_role(p_actor,p_session,company);
    if role_name<>'owner' then raise exception 'Only the company owner can manage customer commerce' using errcode='42501'; end if;
  end if;
  perform 1 from public.shop_ledgers where business_id=company for update;
  if not found then raise exception 'Catalogue unavailable' using errcode='42501'; end if;
  select * into c from public.shop_public_catalogues where business_id=company;

  if p_action='settings' then
    return jsonb_build_object('enabled',coalesce(c.enabled,false),'revision',coalesce(c.revision,0),
      'storeId',c.store_id,'privacyNotice',c.privacy_notice,'retentionDays',c.retention_days,
      'productIds',coalesce((select jsonb_agg(product_id order by product_id) from public.shop_public_products where business_id=company),'[]'::jsonb));
  end if;
  if p_action in ('publish','unpublish') then
    if private.shop_int(p_input,'expectedRevision',0,1000000)<>coalesce(c.revision,0) then
      raise exception 'Catalogue changed; review the current revision' using errcode='40001';
    end if;
    if p_action='unpublish' then
      if c.business_id is null then raise exception 'No catalogue configured' using errcode='22023'; end if;
      update public.shop_public_catalogues set enabled=false,revision=c.revision+1,updated_by=p_actor,updated_at=at_time where business_id=company;
      return jsonb_build_object('enabled',false,'revision',c.revision+1);
    end if;
    if p_input->'confirmed' is distinct from 'true'::jsonb or p_input->'taxOffConfirmed' is distinct from 'true'::jsonb then
      raise exception 'Confirm publication and explicit tax-off terms before publishing this shared catalogue' using errcode='22023';
    end if;
    store:=private.shop_uuid(p_input,'storeId');
    if not exists(select 1 from public.shop_stores where id=store and business_id=company and status='active') then
      raise exception 'Active company store required' using errcode='22023';
    end if;
    notes:=btrim(coalesce(p_input->>'privacyNotice',''));
    days:=private.shop_int(p_input,'retentionDays',7,365);
    if length(notes) not between 20 and 2000 or jsonb_typeof(p_input->'productIds') is distinct from 'array'
      or jsonb_array_length(p_input->'productIds') not between 1 and 1000 then
      raise exception 'Provide a privacy notice and 1–1000 distinct products' using errcode='22023';
    end if;
    for item in select value from jsonb_array_elements(p_input->'productIds') loop
      product:=private.shop_uuid(jsonb_build_object('id',item),'id');
      if names ? product::text or not exists(select 1 from public.shop_products where id=product and business_id=company and active) then
        raise exception 'Invalid or duplicate published product' using errcode='22023';
      end if;
      names:=names||jsonb_build_object(product::text,true);
    end loop;
    revision:=coalesce(c.revision,0)+1;
    insert into public.shop_public_catalogues(business_id,store_id,revision,enabled,privacy_notice,retention_days,tax_configuration,updated_by,updated_at)
      values(company,store,revision,true,notes,days,'{"mode":"off","ownerConfirmed":true}',p_actor,at_time)
      on conflict(business_id) do update set store_id=excluded.store_id,revision=excluded.revision,enabled=true,
        privacy_notice=excluded.privacy_notice,retention_days=excluded.retention_days,tax_configuration=excluded.tax_configuration,updated_by=p_actor,updated_at=at_time;
    delete from public.shop_public_products where business_id=company;
    insert into public.shop_public_products select company,key::uuid from jsonb_object_keys(names) key;
    return public.tallybook_catalogue(company);
  end if;

  if p_action='merchantOrders' then
    return jsonb_build_object('orders',coalesce((select jsonb_agg(private.shop_customer_order_json(x.id) order by x.created_at desc,x.id)
      from (select id,created_at from public.shop_customer_orders where business_id=company order by created_at desc,id limit 100) x),'[]'::jsonb));
  end if;
  if p_action='myOrders' then
    return jsonb_build_object('orders',coalesce((select jsonb_agg(private.shop_customer_order_json(x.id) order by x.created_at desc,x.id)
      from (select id,created_at from public.shop_customer_orders where business_id=company and customer_user_id=p_actor order by created_at desc,id limit 100) x),'[]'::jsonb));
  end if;
  if p_action='redact' then
    with changed as (update public.shop_customer_orders set customer_name=null,customer_contact=null,delivery_notes=null
      where id in (select id from public.shop_customer_orders where business_id=company and retention_until<=at_time and shop_customer_orders.customer_name is not null order by retention_until limit 100)
      returning id,business_id)
    insert into public.shop_customer_order_events(business_id,order_id,actor_id,kind)
      select business_id,id,p_actor,'privacy-redacted' from changed;
    return jsonb_build_object('redacted',true);
  end if;

  order_id:=private.shop_uuid(p_input,'orderId');
  select * into o from public.shop_customer_orders where id=order_id;
  if o.id is not null and (o.business_id<>company or (role_name is distinct from 'owner' and o.customer_user_id<>p_actor)) then
    raise exception 'Order unavailable' using errcode='42501';
  end if;
  if p_action='reserve' then
    if p_input->'privacyAccepted' is distinct from 'true'::jsonb then raise exception 'Privacy consent required' using errcode='22023'; end if;
    customer_name:=btrim(coalesce(p_input->>'customerName','')); contact:=btrim(coalesce(p_input->>'customerContact',''));
    notes:=btrim(coalesce(p_input->>'deliveryNotes','')); delivery:=p_input->>'deliveryMethod';
    if length(customer_name) not between 1 and 120 or length(contact) not between 1 and 100 or length(notes)>300
      or delivery is null or delivery not in ('pickup','delivery') or jsonb_typeof(p_input->'items') is distinct from 'array'
      or jsonb_array_length(p_input->'items') not between 1 and 100 then
      raise exception 'Invalid customer request' using errcode='22023';
    end if;
    revision:=private.shop_int(p_input,'catalogueRevision',1,1000000);
    fingerprint:=encode(sha256(convert_to(jsonb_build_object('company',company,'actor',p_actor,'revision',revision,
      'name',customer_name,'contact',contact,'notes',notes,'delivery',delivery,'items',p_input->'items','digest',p_input->>'catalogueDigest')::text,'UTF8')),'hex');
    if o.id is not null then
      if o.request_hash<>fingerprint then raise exception 'Order identity reused with different details' using errcode='23505'; end if;
      return private.shop_customer_order_json(o.id);
    end if;
    if c.business_id is null or not c.enabled then raise exception 'Catalogue unavailable' using errcode='42501'; end if;
    if p_input->>'catalogueDigest' is distinct from public.tallybook_catalogue(company)->>'digest' then raise exception 'Catalogue changed; review current prices and terms' using errcode='40001'; end if;
    if revision<>c.revision then raise exception 'Catalogue changed; review current prices and terms' using errcode='40001'; end if;
    if (select count(*) from public.shop_customer_orders where business_id=company and customer_user_id=p_actor and created_at>at_time-interval '1 day')>=20
      or (select count(*) from public.shop_customer_orders where business_id=company and customer_user_id=p_actor and status='reserved' and expires_at>at_time)>=3 then
      raise exception 'Customer order limit reached; review existing requests' using errcode='54000';
    end if;
    if not exists(select 1 from public.shop_stores where id=c.store_id and business_id=company and status='active') then
      raise exception 'Catalogue store unavailable' using errcode='42501';
    end if;
    for item in select value from jsonb_array_elements(p_input->'items') loop
      product:=private.shop_uuid(item,'productId'); qty:=private.shop_int(item,'quantity',1,9999);
      if names ? product::text then raise exception 'Duplicate requested product' using errcode='22023'; end if;
      names:=names||jsonb_build_object(product::text,true);
      select p.name,p.unit_price_minor into product_name,price from public.shop_products p
        join public.shop_public_products listed on listed.product_id=p.id and listed.business_id=p.business_id
        where p.id=product and p.business_id=company and p.active;
      if not found then raise exception 'Published product unavailable' using errcode='22023'; end if;
      select quantity into available from public.shop_store_stock where store_id=c.store_id and product_id=product;
      if coalesce(available,0)-private.shop_customer_reserved(company,c.store_id,product)<qty then
        raise exception 'Requested stock is unavailable' using errcode='23514';
      end if;
      total:=total+qty*price;
      if total>100000000000000 then raise exception 'Order total too large' using errcode='22003'; end if;
      lines:=lines||jsonb_build_array(jsonb_build_object('productId',product,'name',product_name,'quantity',qty,'price',price));
    end loop;
    insert into public.shop_customer_orders(id,business_id,store_id,customer_user_id,request_hash,catalogue_revision,
      customer_name,customer_contact,delivery_method,delivery_notes,privacy_notice,retention_until,currency,total_minor,
      tax_configuration,return_policy,status,expires_at,created_at)
    select order_id,company,c.store_id,p_actor,fingerprint,revision,customer_name,contact,delivery,notes,c.privacy_notice,
      at_time+make_interval(days=>c.retention_days),currency,total::bigint,c.tax_configuration,
      private.shop_refund_policy_json(company,'customer')-'history','reserved',at_time+interval '15 minutes',at_time
      from public.shop_ledgers where business_id=company;
    insert into public.shop_customer_order_lines(business_id,order_id,product_id,product_name,quantity,unit_price_minor)
      select company,order_id,(l->>'productId')::uuid,l->>'name',(l->>'quantity')::integer,(l->>'price')::bigint from jsonb_array_elements(lines) l;
    insert into public.shop_customer_order_events(business_id,order_id,actor_id,kind) values(company,order_id,p_actor,'reserved');
    return private.shop_customer_order_json(order_id);
  end if;
  if o.id is null then raise exception 'Order unavailable' using errcode='42501'; end if;
  if p_action='inspect' then return private.shop_customer_order_json(order_id); end if;
  if p_action='cancel' then
    if o.status='cancelled' then return private.shop_customer_order_json(order_id); end if;
    if o.status<>'reserved' then raise exception 'A saved sale requires the company return process' using errcode='22023'; end if;
    update public.shop_customer_orders set status='cancelled' where id=order_id;
    insert into public.shop_customer_order_events(business_id,order_id,actor_id,kind) values(company,order_id,p_actor,'cancelled');
    return private.shop_customer_order_json(order_id);
  end if;
  if p_action='transition' then
    event_kind:=p_input->>'kind'; notes:=btrim(coalesce(p_input->>'note',''));
    if o.status<>'sale-recorded' or length(notes) not between 3 and 300 or event_kind is null then
      raise exception 'Saved POS sale and factual handling note required' using errcode='22023';
    end if;
    if exists(select 1 from public.shop_customer_order_events where shop_customer_order_events.order_id=o.id and shop_customer_order_events.kind=event_kind) then
      if not exists(select 1 from public.shop_customer_order_events e where e.order_id=o.id and e.kind=event_kind and e.note=notes) then
        raise exception 'Handling event already recorded with different evidence' using errcode='23505';
      end if;
      return private.shop_customer_order_json(order_id);
    end if;
    if not ((o.fulfillment_status='unprocessed' and event_kind='packed') or (o.fulfillment_status='packed' and event_kind='dispatched' and o.delivery_method='delivery')
      or (event_kind='delivered' and (o.fulfillment_status='dispatched' or (o.fulfillment_status='packed' and o.delivery_method='pickup')))
      or (o.fulfillment_status='delivered' and event_kind='return-requested')) then
      raise exception 'Invalid fulfillment transition' using errcode='22023';
    end if;
    update public.shop_customer_orders set fulfillment_status=event_kind where id=order_id;
    insert into public.shop_customer_order_events(business_id,order_id,actor_id,kind,note) values(company,order_id,p_actor,event_kind,notes);
    return private.shop_customer_order_json(order_id);
  end if;
  raise exception 'Unknown commerce action' using errcode='22023';
end $fn$;

create function public.tallybook_public_commerce(p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
  begin sid:=(auth.jwt()->>'session_id')::uuid; exception when others then sid:=null; end;
  return private.shop_public_commerce_action(p_action,auth.uid(),sid,p_input);
end $$;

alter function private.shop_record_sale(uuid,uuid,jsonb) rename to shop_record_sale_before_customer_orders;
create function private.shop_record_sale(p_actor uuid,p_session uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare company uuid; oid uuid; o public.shop_customer_orders; result jsonb; sale uuid; requested jsonb; quoted jsonb;
begin
  if not (p_input ? 'commerceOrderId') then return private.shop_record_sale_before_customer_orders(p_actor,p_session,p_input); end if;
  company:=private.shop_uuid(p_input,'companyId'); oid:=private.shop_uuid(p_input,'commerceOrderId');
  perform private.shop_member_role(p_actor,p_session,company);
  perform 1 from public.shop_ledgers where business_id=company for update;
  select * into o from public.shop_customer_orders where id=oid and business_id=company;
  if not found or o.store_id<>private.shop_uuid(p_input,'storeId') then raise exception 'Customer order unavailable at this store' using errcode='42501'; end if;
  if o.status='sale-recorded' then
    if o.sale_submission_key is distinct from p_input->>'submissionKey' then raise exception 'Customer order already has a sale' using errcode='23505'; end if;
    return private.shop_record_sale_before_customer_orders(p_actor,p_session,p_input-'commerceOrderId');
  end if;
  if o.status<>'reserved' or o.expires_at<=clock_timestamp() then raise exception 'Customer reservation expired or cancelled' using errcode='22023'; end if;
  if exists(select 1 from public.shop_sales where business_id=company and submission_key=p_input->>'submissionKey') then
    raise exception 'An existing sale cannot consume a new customer reservation' using errcode='23505';
  end if;
  if coalesce(p_input->>'discountMinor','0')<>'0' or jsonb_typeof(p_input->'lines') is distinct from 'array' then
    raise exception 'Checkout must match the reserved quote without a new discount' using errcode='22023';
  end if;
  select jsonb_agg(jsonb_build_object('productId',private.shop_uuid(l,'productId'),'quantity',private.shop_int(l,'quantity',1,9999)) order by l->>'productId')
    into requested from jsonb_array_elements(p_input->'lines') l;
  select jsonb_agg(jsonb_build_object('productId',product_id,'quantity',quantity) order by product_id) into quoted
    from public.shop_customer_order_lines where order_id=oid;
  if requested is distinct from quoted or exists(select 1 from public.shop_customer_order_lines l join public.shop_products p on p.id=l.product_id
    where l.order_id=oid and (not p.active or p.unit_price_minor<>l.unit_price_minor)) then
    raise exception 'Checkout lines or current prices differ from the customer quote' using errcode='22023';
  end if;
  if o.return_policy is distinct from private.shop_refund_policy_json(company,'customer')-'history' then
    raise exception 'Return terms changed; ask the customer to review a new reservation' using errcode='22023';
  end if;
  -- Remove the hold inside this transaction; any POS failure restores it.
  -- Deferrable state check is avoided by creating the sale first with a
  -- temporary cancelled hold, then atomically linking its immutable receipt.
  update public.shop_customer_orders set status='cancelled' where id=oid;
  result:=private.shop_record_sale_before_customer_orders(p_actor,p_session,p_input-'commerceOrderId');
  select id into sale from public.shop_sales where business_id=company and submission_key=p_input->>'submissionKey';
  if sale is null or (result->>'totalMinor')::bigint<>o.total_minor then raise exception 'Saved sale does not reconcile with customer quote' using errcode='23514'; end if;
  update public.shop_customer_orders set status='sale-recorded',sale_id=sale,sale_submission_key=p_input->>'submissionKey' where id=oid;
  insert into public.shop_customer_order_events(business_id,order_id,actor_id,kind) values(company,oid,p_actor,'sale-recorded');
  return result;
end $$;

revoke all on function private.shop_customer_session(uuid,uuid), private.shop_customer_reserved(uuid,uuid,uuid),
  private.shop_customer_stock_guard(),private.shop_customer_order_json(uuid),private.shop_public_commerce_action(text,uuid,uuid,jsonb),
  private.shop_record_sale(uuid,uuid,jsonb),private.shop_record_sale_before_customer_orders(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.tallybook_catalogue(uuid),public.tallybook_public_commerce(text,jsonb) from public,anon,authenticated;
grant execute on function public.tallybook_catalogue(uuid) to anon,authenticated;
grant execute on function public.tallybook_public_commerce(text,jsonb) to authenticated;
commit;
