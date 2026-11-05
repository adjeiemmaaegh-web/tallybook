-- Shared shop, part 2: refunds/voids and opening balances from a phone's books.
--
-- Refunds never edit a sale. They are new append-only records that point at
-- the sale, return the money by the sale's own payment method, and (unless the
-- goods are damaged) put the units back into the sale's store. A void is a
-- refund of everything still unrefunded. Only the owner can refund.
--
-- Opening import moves a phone's catalogue and current stock into the shared
-- shop in ONE transaction: all of it or none of it. It never overwrites what
-- the shared shop already has (same product or store name is reused, stock is
-- only opened where that store/product has no history yet), so running it
-- twice is harmless. Past sales stay in the phone's books as history.
--
-- Requires: 20261105070036_shared_shop_ledger.
begin;

create table public.shop_refunds (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  sale_id uuid not null,
  refund_no smallint not null check (refund_no between 1 and 100),
  refund_key text not null check (refund_key ~ '^[A-Za-z0-9_-]{16,64}$'),
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  method text not null check (method in ('cash','mobile','card')),
  amount_minor bigint not null check (amount_minor > 0),
  returned_to_stock boolean not null,
  reason text not null check (length(btrim(reason)) between 1 and 200),
  actor_id uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  unique (business_id, refund_key),
  unique (sale_id, refund_no),
  unique (business_id, id),
  foreign key (business_id, sale_id) references public.shop_sales(business_id, id)
);
create index shop_refunds_business_time on public.shop_refunds (business_id, recorded_at desc);

create table public.shop_refund_lines (
  business_id uuid not null,
  refund_id uuid not null,
  sale_id uuid not null,
  line_no smallint not null check (line_no between 1 and 100),
  product_id uuid not null,
  quantity integer not null check (quantity between 1 and 100000),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  line_total_minor bigint not null,
  primary key (refund_id, line_no),
  check (line_total_minor = quantity::bigint * unit_price_minor),
  foreign key (business_id, refund_id) references public.shop_refunds(business_id, id),
  foreign key (sale_id, line_no) references public.shop_sale_lines(sale_id, line_no)
);
create index shop_refund_lines_sale on public.shop_refund_lines (sale_id, line_no);

-- Audit trail of every opening import run (append-only).
create table public.shop_imports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  source_key text not null check (source_key ~ '^[A-Za-z0-9:_-]{4,128}$'),
  summary jsonb not null,
  actor_id uuid not null references auth.users(id),
  recorded_at timestamptz not null default now()
);
create index shop_imports_business on public.shop_imports (business_id, recorded_at desc);

-- Stock movements learn two reasons: 'refund' (linked to its sale and refund)
-- and 'opening' (from an import, keyed by a deterministic operation id).
alter table public.shop_stock_movements add column refund_id uuid;
alter table public.shop_stock_movements
  add constraint shop_stock_movements_refund_fk foreign key (business_id, refund_id)
  references public.shop_refunds(business_id, id);
do $$
declare c record;
begin
  for c in select conname from pg_constraint
    where conrelid = 'public.shop_stock_movements'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ~ 'reason'
  loop
    execute format('alter table public.shop_stock_movements drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.shop_stock_movements
  add constraint shop_stock_movements_reason_valid
    check (reason in ('sale','restock','correction','refund','opening')),
  add constraint shop_stock_movements_sale_link
    check ((reason in ('sale','refund')) = (sale_id is not null)),
  add constraint shop_stock_movements_refund_link
    check ((reason = 'refund') = (refund_id is not null)),
  add constraint shop_stock_movements_operation_link
    check (reason in ('sale','refund') or operation_id is not null);

do $$
declare t text;
begin
  foreach t in array array['shop_refunds','shop_refund_lines','shop_imports'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;
create trigger shop_refunds_append_only before update or delete on public.shop_refunds
  for each row execute function private.shop_reject_history_change();
create trigger shop_refund_lines_append_only before update or delete on public.shop_refund_lines
  for each row execute function private.shop_reject_history_change();
create trigger shop_imports_append_only before update or delete on public.shop_imports
  for each row execute function private.shop_reject_history_change();

-- Stable id for an imported row: the same phone record always maps to the
-- same shared-shop id within one business, and never collides across businesses.
create function private.shop_derived_uuid(p_company uuid, p_label text) returns uuid
language sql immutable set search_path = '' as $$
  select encode(substr(sha256(convert_to(p_company::text || '|' || p_label, 'UTF8')), 1, 16), 'hex')::uuid
$$;

-- Receipts now carry their refunds, so every view shows the net position.
create or replace function private.shop_receipt(p_sale uuid, p_replayed boolean) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'saleId', s.id, 'companyId', s.business_id, 'storeId', s.store_id, 'storeName', st.name,
    'cashierId', s.cashier_id, 'submissionKey', s.submission_key,
    'receiptNumber', s.receipt_number, 'currency', s.currency, 'totalMinor', s.total_minor,
    'recordedAt', s.recorded_at, 'replayed', p_replayed,
    'payment', jsonb_build_object('method', p.method, 'amountDueMinor', p.amount_due_minor,
      'amountTenderedMinor', p.amount_tendered_minor, 'changeMinor', p.change_minor, 'reference', p.reference),
    'lines', (select jsonb_agg(jsonb_build_object('lineNo', l.line_no, 'productId', l.product_id, 'name', l.product_name,
        'quantity', l.quantity, 'unitPriceMinor', l.unit_price_minor, 'lineTotalMinor', l.line_total_minor,
        'refundedQuantity', coalesce((select sum(rl.quantity) from public.shop_refund_lines rl
          where rl.sale_id = l.sale_id and rl.line_no = l.line_no), 0))
        order by l.line_no) from public.shop_sale_lines l where l.sale_id = s.id),
    'refundedMinor', coalesce((select sum(r.amount_minor) from public.shop_refunds r where r.sale_id = s.id), 0),
    'refunds', coalesce((select jsonb_agg(jsonb_build_object('refundId', r.id, 'refundNo', r.refund_no,
        'amountMinor', r.amount_minor, 'method', r.method, 'returnedToStock', r.returned_to_stock,
        'reason', r.reason, 'actorId', r.actor_id, 'recordedAt', r.recorded_at,
        'lines', (select jsonb_agg(jsonb_build_object('lineNo', rl.line_no, 'productId', rl.product_id,
            'quantity', rl.quantity, 'lineTotalMinor', rl.line_total_minor) order by rl.line_no)
          from public.shop_refund_lines rl where rl.refund_id = r.id)) order by r.refund_no)
      from public.shop_refunds r where r.sale_id = s.id), '[]'::jsonb))
  from public.shop_sales s
  join public.shop_payments p on p.sale_id = s.id
  join public.shop_stores st on st.id = s.store_id
  where s.id = p_sale
$$;

create function private.tallybook_shop_owner_action(p_action text, p_actor uuid, p_session uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  at_time timestamptz := clock_timestamp();
  v_company uuid;
  v_role text;
  v_owner uuid;
  v_ledger public.shop_ledgers;
  v_sale public.shop_sales;
  v_existing public.shop_refunds;
  v_refund uuid;
  v_hash text;
  v_lines jsonb;
  v_line record;
  v_reason text;
  v_restock boolean;
  v_void boolean;
  v_amount bigint := 0;
  v_no integer;
  v_stock integer;
  v_left integer;
  v_price bigint;
  v_store uuid;
  v_product uuid;
  v_name text;
  v_qty bigint;
  v_op uuid;
  v_item jsonb;
  v_local text;
  v_source text;
  v_stores jsonb := '{}'::jsonb;
  v_products jsonb := '{}'::jsonb;
  v_default_store uuid;
  n_stores_new integer := 0; n_stores_reused integer := 0;
  n_products_new integer := 0; n_products_reused integer := 0;
  n_stock_opened integer := 0; n_stock_skipped integer := 0; n_units bigint := 0;
  v_summary jsonb;
begin
  if p_actor is null or p_session is null or p_action is null or jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'Authenticated account required' using errcode = '42501';
  end if;
  perform 1 from auth.sessions s
    where s.id = p_session and s.user_id = p_actor and (s.not_after is null or s.not_after > at_time);
  if not found then raise exception 'Active Auth session required' using errcode = '42501'; end if;

  v_company := private.shop_uuid(p_input, 'companyId');
  select b.owner_id into v_owner from public.businesses b where b.id = v_company;
  select m.role into v_role from public.business_members m where m.business_id = v_company and m.user_id = p_actor;
  if v_owner is null or v_role is null or (v_role = 'owner' and v_owner <> p_actor) then
    raise exception 'Business access denied' using errcode = '42501';
  end if;
  if v_role <> 'owner' then
    raise exception 'Only the business owner can do this' using errcode = '42501';
  end if;

  -- Same lock as recordSale: refunds, sales and imports on one business never interleave.
  select * into v_ledger from public.shop_ledgers where business_id = v_company for update;
  if not found then raise exception 'The owner has not set up this shop yet' using errcode = '42501'; end if;

  -- ---------------------------------------------------------------- refunds
  if p_action = 'refundSale' then
    select * into v_sale from public.shop_sales
      where id = private.shop_uuid(p_input, 'saleId') and business_id = v_company;
    if not found then raise exception 'Sale not found' using errcode = '42501'; end if;
    if (p_input->>'refundKey') is null or (p_input->>'refundKey') !~ '^[A-Za-z0-9_-]{16,64}$' then
      raise exception 'Invalid refundKey' using errcode = '22023';
    end if;
    v_reason := btrim(coalesce(p_input->>'reason', ''));
    if length(v_reason) not between 1 and 200 then
      raise exception 'Say why this is being refunded' using errcode = '22023';
    end if;
    if p_input ? 'returnToStock' and jsonb_typeof(p_input->'returnToStock') <> 'boolean' then
      raise exception 'Invalid returnToStock' using errcode = '22023';
    end if;
    v_restock := coalesce((p_input->>'returnToStock')::boolean, true);
    v_void := not (p_input ? 'lines');
    if not v_void then
      if jsonb_typeof(p_input->'lines') <> 'array' or jsonb_array_length(p_input->'lines') not between 1 and 100 then
        raise exception 'Choose what to refund' using errcode = '22023';
      end if;
      select jsonb_agg(jsonb_build_object('lineNo', x.line_no, 'quantity', x.qty) order by x.line_no) into v_lines
        from (select private.shop_int(l, 'lineNo', 1, 100) as line_no, sum(private.shop_int(l, 'quantity', 1, 100000)) as qty
              from jsonb_array_elements(p_input->'lines') l group by 1) x;
    end if;
    -- Hash the request as asked (a void means "everything left"), so a retry matches.
    v_hash := encode(sha256(convert_to(jsonb_build_object('saleId', v_sale.id, 'void', v_void,
      'lines', v_lines, 'restock', v_restock, 'reason', v_reason)::text, 'UTF8')), 'hex');
    select * into v_existing from public.shop_refunds where business_id = v_company and refund_key = p_input->>'refundKey';
    if found then
      if v_existing.request_sha256 <> v_hash then
        raise exception 'This refund was already recorded with different details' using errcode = '23505';
      end if;
      return private.shop_receipt(v_sale.id, true);
    end if;

    if v_void then
      select coalesce(jsonb_agg(jsonb_build_object('lineNo', x.line_no, 'quantity', x.left_qty) order by x.line_no), '[]'::jsonb)
        into v_lines
        from (select l.line_no, l.quantity - coalesce((select sum(rl.quantity) from public.shop_refund_lines rl
                where rl.sale_id = l.sale_id and rl.line_no = l.line_no), 0) as left_qty
              from public.shop_sale_lines l where l.sale_id = v_sale.id) x
        where x.left_qty > 0;
      if jsonb_array_length(v_lines) = 0 then
        raise exception 'Everything on this sale has already been refunded' using errcode = '23514';
      end if;
    end if;

    -- Validate every line and price it from the sale before writing anything.
    for v_line in
      select (e->>'lineNo')::int as line_no, (e->>'quantity')::int as qty from jsonb_array_elements(v_lines) e order by 1
    loop
      select l.product_name, l.unit_price_minor, l.quantity - coalesce((select sum(rl.quantity) from public.shop_refund_lines rl
            where rl.sale_id = l.sale_id and rl.line_no = l.line_no), 0)
        into v_name, v_price, v_left
        from public.shop_sale_lines l where l.sale_id = v_sale.id and l.line_no = v_line.line_no;
      if not found then raise exception 'That item is not on this sale' using errcode = '22023'; end if;
      if v_line.qty > v_left then
        raise exception 'Only % of % can still be refunded', v_left, v_name using errcode = '23514';
      end if;
      v_amount := v_amount + v_line.qty::bigint * v_price;
    end loop;
    if v_amount <= 0 then raise exception 'Nothing to refund: these items were free' using errcode = '23514'; end if;

    select coalesce(max(refund_no), 0) + 1 into v_no from public.shop_refunds where sale_id = v_sale.id;
    if v_no > 100 then raise exception 'Too many refunds on one sale' using errcode = '23514'; end if;
    v_refund := gen_random_uuid();
    insert into public.shop_refunds (id, business_id, sale_id, refund_no, refund_key, request_sha256, method,
        amount_minor, returned_to_stock, reason, actor_id, recorded_at)
      select v_refund, v_company, v_sale.id, v_no, p_input->>'refundKey', v_hash, p.method,
        v_amount, v_restock, v_reason, p_actor, at_time
      from public.shop_payments p where p.sale_id = v_sale.id;

    for v_line in
      select (e->>'lineNo')::int as line_no, (e->>'quantity')::int as qty from jsonb_array_elements(v_lines) e order by 1
    loop
      select l.product_id, l.unit_price_minor into v_product, v_price
        from public.shop_sale_lines l where l.sale_id = v_sale.id and l.line_no = v_line.line_no;
      insert into public.shop_refund_lines (business_id, refund_id, sale_id, line_no, product_id, quantity,
          unit_price_minor, line_total_minor)
        values (v_company, v_refund, v_sale.id, v_line.line_no, v_product, v_line.qty, v_price, v_line.qty::bigint * v_price);
      if v_restock then
        insert into public.shop_store_stock (business_id, store_id, product_id, quantity)
          values (v_company, v_sale.store_id, v_product, 0) on conflict do nothing;
        update public.shop_store_stock set quantity = quantity + v_line.qty, updated_at = at_time
          where store_id = v_sale.store_id and product_id = v_product returning quantity into v_stock;
        insert into public.shop_stock_movements (business_id, store_id, product_id, delta, quantity_after,
            reason, sale_id, refund_id, actor_id, recorded_at)
          values (v_company, v_sale.store_id, v_product, v_line.qty, v_stock, 'refund', v_sale.id, v_refund, p_actor, at_time);
      end if;
    end loop;
    return private.shop_receipt(v_sale.id, false);
  end if;

  -- ---------------------------------------------------------------- opening import
  if p_action = 'importOpening' then
    v_source := p_input->>'sourceKey';
    if v_source is null or v_source !~ '^[A-Za-z0-9:_-]{4,128}$' then
      raise exception 'Invalid sourceKey' using errcode = '22023';
    end if;
    if upper(coalesce(p_input->>'currency', '')) <> v_ledger.currency then
      raise exception 'These books are in % but the shared shop sells in %. Nothing was imported.',
        coalesce(nullif(p_input->>'currency', ''), 'another currency'), v_ledger.currency using errcode = '22023';
    end if;
    if jsonb_typeof(coalesce(p_input->'stores', '[]')) <> 'array' or jsonb_array_length(coalesce(p_input->'stores', '[]')) > 50
       or jsonb_typeof(p_input->'products') is distinct from 'array' or jsonb_array_length(p_input->'products') not between 1 and 2000
       or jsonb_typeof(coalesce(p_input->'stock', '[]')) <> 'array' or jsonb_array_length(coalesce(p_input->'stock', '[]')) > 20000 then
      raise exception 'Import must have 1 to 2000 products, up to 50 stores and up to 20000 stock rows' using errcode = '22023';
    end if;
    if p_input ? 'defaultStoreId' then
      v_default_store := private.shop_uuid(p_input, 'defaultStoreId');
      perform 1 from public.shop_stores where id = v_default_store and business_id = v_company and status = 'active';
      if not found then raise exception 'Choose an open store for the stock' using errcode = '42501'; end if;
    end if;

    -- Stores: reuse an earlier import, else an open store with the same name, else create.
    for v_item in select * from jsonb_array_elements(coalesce(p_input->'stores', '[]'))
    loop
      v_local := v_item->>'localId';
      v_name := btrim(regexp_replace(coalesce(v_item->>'name', ''), '\s+', ' ', 'g'));
      if v_local is null or v_local !~ '^[A-Za-z0-9_-]{1,80}$' or length(v_name) not between 1 and 80 then
        raise exception 'Invalid store in import' using errcode = '22023';
      end if;
      v_store := private.shop_derived_uuid(v_company, 'store:' || v_local);
      if exists (select 1 from public.shop_stores where id = v_store and business_id = v_company) then
        n_stores_reused := n_stores_reused + 1;
      else
        v_op := null;
        select id into v_op from public.shop_stores
          where business_id = v_company and status = 'active' and lower(btrim(name)) = lower(v_name);
        if v_op is not null then
          v_store := v_op; n_stores_reused := n_stores_reused + 1;
        else
          insert into public.shop_stores (id, business_id, name, created_by) values (v_store, v_company, v_name, p_actor);
          n_stores_new := n_stores_new + 1;
        end if;
      end if;
      v_stores := v_stores || jsonb_build_object(v_local, v_store);
    end loop;

    -- Products: never overwrite a shared-shop product; reuse by import id or same name.
    for v_item in select * from jsonb_array_elements(p_input->'products')
    loop
      v_local := v_item->>'localId';
      v_name := btrim(regexp_replace(coalesce(v_item->>'name', ''), '\s+', ' ', 'g'));
      if v_local is null or v_local !~ '^[A-Za-z0-9_-]{1,80}$' or length(v_name) not between 1 and 120 then
        raise exception 'Invalid product in import' using errcode = '22023';
      end if;
      v_price := private.shop_int(v_item, 'unitPriceMinor', 0, 100000000000);
      v_product := private.shop_derived_uuid(v_company, 'product:' || v_local);
      if exists (select 1 from public.shop_products where id = v_product and business_id = v_company) then
        n_products_reused := n_products_reused + 1;
      else
        v_op := null;
        select id into v_op from public.shop_products
          where business_id = v_company and lower(btrim(name)) = lower(v_name) order by active desc, created_at limit 1;
        if v_op is not null then
          v_product := v_op; n_products_reused := n_products_reused + 1;
        else
          insert into public.shop_products (id, business_id, name, unit_price_minor)
            values (v_product, v_company, v_name, v_price);
          n_products_new := n_products_new + 1;
        end if;
      end if;
      v_products := v_products || jsonb_build_object(v_local, v_product);
    end loop;

    -- Opening stock only where that store/product has no shared-shop history,
    -- so an import can never double-count units the owner already entered.
    for v_item in select * from jsonb_array_elements(coalesce(p_input->'stock', '[]'))
    loop
      v_local := v_item->>'localProductId';
      if v_local is null or not (v_products ? v_local) then
        raise exception 'Stock row for a product not in the import' using errcode = '22023';
      end if;
      v_product := (v_products->>v_local)::uuid;
      if v_item ? 'localStoreId' then
        if not (v_stores ? (v_item->>'localStoreId')) then
          raise exception 'Stock row for a store not in the import' using errcode = '22023';
        end if;
        v_store := (v_stores->>(v_item->>'localStoreId'))::uuid;
      elsif v_default_store is not null then
        v_store := v_default_store;
      else
        raise exception 'Choose which store receives this stock' using errcode = '22023';
      end if;
      v_qty := private.shop_int(v_item, 'quantity', 0, 9999999);
      if v_qty = 0 then continue; end if;
      if exists (select 1 from public.shop_stock_movements where store_id = v_store and product_id = v_product) then
        n_stock_skipped := n_stock_skipped + 1; continue;
      end if;
      v_op := private.shop_derived_uuid(v_company, 'opening:' || v_store || ':' || v_product);
      insert into public.shop_store_stock (business_id, store_id, product_id, quantity)
        values (v_company, v_store, v_product, 0) on conflict do nothing;
      update public.shop_store_stock set quantity = quantity + v_qty, updated_at = at_time
        where store_id = v_store and product_id = v_product returning quantity into v_stock;
      insert into public.shop_stock_movements (business_id, store_id, product_id, delta, quantity_after, reason,
          operation_id, note, actor_id, recorded_at)
        values (v_company, v_store, v_product, v_qty, v_stock, 'opening', v_op,
          left('Opening balance from ' || v_source, 200), p_actor, at_time);
      n_stock_opened := n_stock_opened + 1; n_units := n_units + v_qty;
    end loop;

    v_summary := jsonb_build_object('storesCreated', n_stores_new, 'storesReused', n_stores_reused,
      'productsCreated', n_products_new, 'productsReused', n_products_reused,
      'stockOpened', n_stock_opened, 'stockSkipped', n_stock_skipped, 'unitsOpened', n_units);
    insert into public.shop_imports (business_id, source_key, summary, actor_id, recorded_at)
      values (v_company, v_source, v_summary, p_actor, at_time);
    return v_summary || jsonb_build_object('companyId', v_company, 'sourceKey', v_source);
  end if;

  raise exception 'Unrecognised shop action' using errcode = '42501';
end $fn$;

revoke all on function private.tallybook_shop_owner_action(text, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function private.shop_derived_uuid(uuid, text) from public, anon, authenticated;

create or replace function public.tallybook_shop(p_action text, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $body$
declare
  actor uuid := auth.uid();
  sid uuid;
begin
  begin
    sid := (auth.jwt()->>'session_id')::uuid;
  exception when others then sid := null;
  end;
  if p_action in ('refundSale', 'importOpening') then
    return private.tallybook_shop_owner_action(p_action, actor, sid, p_input);
  end if;
  return private.tallybook_shop_action(p_action, actor, sid, p_input);
end $body$;
revoke all on function public.tallybook_shop(text, jsonb) from public, anon;
grant execute on function public.tallybook_shop(text, jsonb) to authenticated;

commit;
