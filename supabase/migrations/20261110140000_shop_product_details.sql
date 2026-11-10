-- Product details for the shared shop: barcode, category, goods or service,
-- stock tracking, low-stock level and cost.
--
-- * One atomic owner action, saveProductFull, writes name, price, active and
--   every new field together; productCatalog reads them back. Cost is returned
--   to owners only. The older saveProduct action is untouched.
-- * track_stock = false (services, and goods the owner does not count) means a
--   sale does not need stock and does not move it, and a refund never puts the
--   item "back in stock". Switching tracking off is refused while stock is on
--   hand, so no counted stock is silently orphaned.
-- * shop_record_sale and shop_refund_sale are re-declared with only those
--   stock branches changed; everything else is byte-for-byte the deployed
--   definition.
--
-- Rollback: supabase/rollback/20261110140000_shop_product_details_down.sql
begin;

alter table public.shop_products
  add column barcode text,
  add column category text,
  add column kind text not null default 'good',
  add column track_stock boolean not null default true,
  add column low_stock_threshold integer,
  add column cost_minor bigint,
  add constraint shop_products_barcode_valid check (barcode is null or barcode ~ '^[A-Za-z0-9._/-]{1,64}$'),
  add constraint shop_products_category_valid check (category is null or length(btrim(category)) between 1 and 60),
  add constraint shop_products_kind_valid check (kind in ('good','service')),
  add constraint shop_products_service_untracked check (kind = 'good' or track_stock = false),
  add constraint shop_products_low_stock_valid check (low_stock_threshold is null or (track_stock and low_stock_threshold between 0 and 1000000)),
  add constraint shop_products_cost_valid check (cost_minor is null or cost_minor between 0 and 100000000000);

create unique index shop_products_barcode on public.shop_products (business_id, barcode) where barcode is not null;

create function private.shop_stage_g_product_action(
  p_action text, p_actor uuid, p_session uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_company uuid;
  v_role text;
  v_id uuid;
  v_name text;
  v_price bigint;
  v_active boolean := true;
  v_barcode text;
  v_category text;
  v_kind text := 'good';
  v_track boolean;
  v_threshold integer;
  v_cost bigint;
  v_row public.shop_products;
  v_old public.shop_products;
begin
  if jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'Valid request required' using errcode = '22023';
  end if;
  v_company := private.shop_uuid(p_input, 'companyId');
  v_role := private.shop_member_role(p_actor, p_session, v_company);

  if p_action = 'productCatalog' then
    return jsonb_build_object('products', coalesce((
      select jsonb_agg(
        jsonb_build_object('productId', p.id, 'name', p.name, 'unitPriceMinor', p.unit_price_minor,
          'active', p.active, 'barcode', p.barcode, 'category', p.category, 'kind', p.kind,
          'trackStock', p.track_stock, 'lowStockThreshold', p.low_stock_threshold)
        || case when v_role = 'owner' then jsonb_build_object('costMinor', p.cost_minor) else '{}'::jsonb end
        order by lower(p.name), p.id)
      from public.shop_products p
      where p.business_id = v_company and (v_role = 'owner' or p.active)), '[]'::jsonb));
  end if;

  -- saveProductFull
  if v_role <> 'owner' then raise exception 'Only the business owner can change products' using errcode = '42501'; end if;
  v_id := private.shop_uuid(p_input, 'productId');
  v_name := btrim(coalesce(p_input->>'name', ''));
  if length(v_name) not between 1 and 120 then raise exception 'Product name must be 1 to 120 characters' using errcode = '22023'; end if;
  v_price := private.shop_int(p_input, 'unitPriceMinor', 0, 100000000000);
  if p_input ? 'active' then
    if jsonb_typeof(p_input->'active') <> 'boolean' then raise exception 'Invalid active' using errcode = '22023'; end if;
    v_active := (p_input->>'active')::boolean;
  end if;

  if p_input ? 'barcode' and jsonb_typeof(p_input->'barcode') = 'string' then
    v_barcode := nullif(btrim(p_input->>'barcode'), '');
    if v_barcode is not null and v_barcode !~ '^[A-Za-z0-9._/-]{1,64}$' then
      raise exception 'Invalid barcode: use letters, numbers and . _ / - only (up to 64)' using errcode = '22023';
    end if;
  elsif p_input ? 'barcode' and jsonb_typeof(p_input->'barcode') <> 'null' then
    raise exception 'Invalid barcode' using errcode = '22023';
  end if;

  if p_input ? 'category' and jsonb_typeof(p_input->'category') = 'string' then
    v_category := nullif(btrim(p_input->>'category'), '');
    if v_category is not null and length(v_category) > 60 then raise exception 'Invalid category' using errcode = '22023'; end if;
  elsif p_input ? 'category' and jsonb_typeof(p_input->'category') <> 'null' then
    raise exception 'Invalid category' using errcode = '22023';
  end if;

  if p_input ? 'kind' then
    v_kind := p_input->>'kind';
    if jsonb_typeof(p_input->'kind') <> 'string' or v_kind not in ('good', 'service') then raise exception 'Invalid kind' using errcode = '22023'; end if;
  end if;
  v_track := v_kind = 'good';
  if p_input ? 'trackStock' then
    if jsonb_typeof(p_input->'trackStock') <> 'boolean' then raise exception 'Invalid trackStock' using errcode = '22023'; end if;
    v_track := (p_input->>'trackStock')::boolean;
  end if;
  if v_kind = 'service' and v_track then raise exception 'Services do not track stock' using errcode = '22023'; end if;

  if p_input ? 'lowStockThreshold' and jsonb_typeof(p_input->'lowStockThreshold') <> 'null' then
    v_threshold := private.shop_int(p_input, 'lowStockThreshold', 0, 1000000)::integer;
    if not v_track then raise exception 'A low-stock level needs stock tracking' using errcode = '22023'; end if;
  end if;
  if p_input ? 'costMinor' and jsonb_typeof(p_input->'costMinor') <> 'null' then
    v_cost := private.shop_int(p_input, 'costMinor', 0, 100000000000);
  end if;

  -- Same lock the sale and stock actions take, so a save never interleaves with a sale.
  perform 1 from public.shop_ledgers where business_id = v_company for update;
  if not found then raise exception 'Set up this shop before adding products' using errcode = '42501'; end if;
  if exists (select 1 from public.shop_products where id = v_id and business_id <> v_company) then
    raise exception 'Product access denied' using errcode = '42501';
  end if;

  select * into v_old from public.shop_products where id = v_id and business_id = v_company for update;
  if found and v_old.track_stock and not v_track
     and exists (select 1 from public.shop_store_stock where product_id = v_id and quantity > 0) then
    raise exception 'Remove the remaining stock before turning stock tracking off' using errcode = '23514';
  end if;

  begin
    insert into public.shop_products (id, business_id, name, unit_price_minor, active, barcode, category, kind,
        track_stock, low_stock_threshold, cost_minor)
      values (v_id, v_company, v_name, v_price, v_active, v_barcode, v_category, v_kind, v_track, v_threshold, v_cost)
      on conflict (id) do update set name = excluded.name, unit_price_minor = excluded.unit_price_minor,
        active = excluded.active, barcode = excluded.barcode, category = excluded.category, kind = excluded.kind,
        track_stock = excluded.track_stock, low_stock_threshold = excluded.low_stock_threshold,
        cost_minor = excluded.cost_minor, updated_at = clock_timestamp()
      returning * into v_row;
  exception when unique_violation then
    raise exception 'Another product already uses that barcode' using errcode = '23505';
  end;

  return jsonb_build_object('productId', v_row.id, 'name', v_row.name, 'unitPriceMinor', v_row.unit_price_minor,
    'active', v_row.active, 'barcode', v_row.barcode, 'category', v_row.category, 'kind', v_row.kind,
    'trackStock', v_row.track_stock, 'lowStockThreshold', v_row.low_stock_threshold, 'costMinor', v_row.cost_minor);
end $fn$;


revoke all on function private.shop_stage_g_product_action(text, uuid, uuid, jsonb)
  from public, anon, authenticated;

create or replace function private.shop_record_sale(p_actor uuid, p_session uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  at_time timestamptz := clock_timestamp();
  v_company uuid;
  v_role text;
  v_perm jsonb;
  v_ledger public.shop_ledgers;
  v_existing public.shop_sales;
  v_store uuid;
  v_sale uuid;
  v_hash text;
  v_lines jsonb;
  v_line record;
  v_legacy boolean;
  v_tenders jsonb := '[]'::jsonb;
  v_t jsonb;
  v_method text;
  v_amount bigint;
  v_tendered bigint;
  v_reference text;
  v_customer uuid;
  v_cust public.shop_customers;
  v_credit bigint := 0;
  v_cash_count integer := 0;
  v_subtotal bigint := 0;
  v_discount bigint := 0;
  v_discount_reason text;
  v_total bigint;
  v_sum bigint := 0;
  v_sum_tendered bigint := 0;
  v_name text;
  v_price bigint;
  v_stock integer;
  v_track boolean;
  v_line_no integer := 0;
  v_alloc jsonb := '{}'::jsonb;
  v_rem bigint;
  v_share bigint;
  v_client_time timestamptz;
  v_n integer := 0;
begin
  if jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'Authenticated account required' using errcode = '42501';
  end if;
  v_company := private.shop_uuid(p_input, 'companyId');
  v_role := private.shop_member_role(p_actor, p_session, v_company);
  v_perm := private.shop_permissions(v_company, p_actor, v_role);
  v_store := private.shop_uuid(p_input, 'storeId');
  if (p_input->>'submissionKey') is null or (p_input->>'submissionKey') !~ '^[A-Za-z0-9_-]{16,64}$' then
    raise exception 'Invalid submissionKey' using errcode = '22023';
  end if;
  if jsonb_typeof(p_input->'lines') is distinct from 'array'
     or jsonb_array_length(p_input->'lines') not between 1 and 100 then
    raise exception 'A sale needs between 1 and 100 lines' using errcode = '22023';
  end if;
  begin
    v_client_time := (p_input->>'clientRecordedAt')::timestamptz;
  exception when others then v_client_time := null;
  end;
  select jsonb_agg(jsonb_build_object('productId', x.product_id, 'quantity', x.qty) order by x.product_id)
    into v_lines
    from (select private.shop_uuid(l, 'productId') as product_id,
                 sum(private.shop_int(l, 'quantity', 1, 100000)) as qty
          from jsonb_array_elements(p_input->'lines') l group by 1) x;
  if exists (select 1 from jsonb_array_elements(v_lines) l where (l->>'quantity')::bigint > 100000) then
    raise exception 'Quantity too large' using errcode = '22023';
  end if;

  -- The earlier single-payment request shape (still queued on some phones).
  v_legacy := not (p_input ? 'tenders');
  if v_legacy then
    v_method := p_input->>'paymentMethod';
    if v_method is null or v_method not in ('cash','mobile','card') then
      raise exception 'Choose a payment method' using errcode = '22023';
    end if;
    v_tendered := private.shop_int(p_input, 'amountTenderedMinor', 0, 100000000000);
    v_reference := nullif(btrim(coalesce(p_input->>'paymentReference', '')), '');
    if v_reference is not null and length(v_reference) > 80 then
      raise exception 'Payment reference is too long' using errcode = '22023';
    end if;
    if p_input ? 'discountMinor' then raise exception 'Use tenders with a discount' using errcode = '22023'; end if;
    v_hash := encode(sha256(convert_to(jsonb_build_object(
      'storeId', v_store, 'method', v_method, 'tendered', v_tendered,
      'reference', v_reference, 'lines', v_lines)::text, 'UTF8')), 'hex');
  else
    if jsonb_typeof(p_input->'tenders') <> 'array' or jsonb_array_length(p_input->'tenders') > 5 then
      raise exception 'A sale can be paid in up to 5 parts' using errcode = '22023';
    end if;
    for v_t in select * from jsonb_array_elements(p_input->'tenders')
    loop
      v_method := v_t->>'method';
      if v_method is null or v_method not in ('cash','mobile','card','credit') then
        raise exception 'Choose a payment method' using errcode = '22023';
      end if;
      v_amount := private.shop_int(v_t, 'amountMinor', 1, 100000000000);
      v_tendered := case when v_method = 'cash' and v_t ? 'tenderedMinor'
        then private.shop_int(v_t, 'tenderedMinor', 1, 100000000000) else v_amount end;
      if v_tendered < v_amount then raise exception 'Cash received is less than the cash part' using errcode = '22023'; end if;
      v_reference := nullif(btrim(coalesce(v_t->>'reference', '')), '');
      if v_reference is not null and length(v_reference) > 80 then
        raise exception 'Payment reference is too long' using errcode = '22023';
      end if;
      if v_method = 'mobile' and v_reference is null then
        raise exception 'Enter the mobile money reference' using errcode = '22023';
      end if;
      v_customer := case when v_method = 'credit' then private.shop_uuid(v_t, 'customerId') end;
      if v_method = 'cash' then v_cash_count := v_cash_count + 1; end if;
      if v_method = 'credit' then v_credit := v_credit + v_amount; end if;
      v_tenders := v_tenders || jsonb_build_array(jsonb_build_object('method', v_method, 'amount', v_amount,
        'tendered', v_tendered, 'reference', case when v_method in ('mobile','card') then v_reference end,
        'customerId', v_customer));
    end loop;
    if v_cash_count > 1 then raise exception 'Combine the cash into one part' using errcode = '22023'; end if;
    if (select count(*) from jsonb_array_elements(v_tenders) t where t->>'method' = 'credit') > 1 then
      raise exception 'Only one credit part per sale' using errcode = '22023';
    end if;
    select (t->>'customerId')::uuid into v_customer from jsonb_array_elements(v_tenders) t where t->>'method' = 'credit';
    v_discount := case when p_input ? 'discountMinor' then private.shop_int(p_input, 'discountMinor', 0, 100000000000) else 0 end;
    v_discount_reason := nullif(btrim(regexp_replace(coalesce(p_input->>'discountReason', ''), '\s+', ' ', 'g')), '');
    if v_discount > 0 and (v_discount_reason is null or length(v_discount_reason) > 120) then
      raise exception 'Say why you are giving this discount' using errcode = '22023';
    end if;
    if v_discount = 0 then v_discount_reason := null; end if;
    v_hash := encode(sha256(convert_to(jsonb_build_object('v', 2,
      'storeId', v_store, 'lines', v_lines, 'discount', v_discount, 'discountReason', v_discount_reason,
      'tenders', v_tenders)::text, 'UTF8')), 'hex');
  end if;

  -- One sale at a time per business: serialises receipts and the retry check.
  select * into v_ledger from public.shop_ledgers where business_id = v_company for update;
  if not found then raise exception 'The owner has not set up this shop yet' using errcode = '42501'; end if;
  select * into v_existing from public.shop_sales
    where business_id = v_company and submission_key = p_input->>'submissionKey';
  if found then
    if v_existing.request_sha256 <> v_hash or v_existing.cashier_id <> p_actor then
      raise exception 'This sale was already recorded with different details. Start a new sale.' using errcode = '23505';
    end if;
    return private.shop_receipt(v_existing.id, true);
  end if;

  perform 1 from public.shop_stores st where st.id = v_store and st.business_id = v_company and st.status = 'active';
  if not found then raise exception 'This store is not open for sales' using errcode = '42501'; end if;
  if v_role <> 'owner' then
    perform 1 from public.shop_store_assignments a where a.store_id = v_store and a.user_id = p_actor;
    if not found then raise exception 'You are not assigned to this store' using errcode = '42501'; end if;
  end if;

  -- Server prices the cart and checks stock under lock.
  for v_line in
    select (l->>'productId')::uuid as product_id, (l->>'quantity')::integer as qty
    from jsonb_array_elements(v_lines) l order by 1
  loop
    select pr.name, pr.unit_price_minor, pr.track_stock into v_name, v_price, v_track
      from public.shop_products pr where pr.id = v_line.product_id and pr.business_id = v_company and pr.active;
    if not found then raise exception 'A product in this sale is no longer available' using errcode = '22023'; end if;
    -- Services and other untracked items are sold without a stock check.
    if v_track then
      select k.quantity into v_stock from public.shop_store_stock k
        where k.store_id = v_store and k.product_id = v_line.product_id for update;
      if coalesce(v_stock, 0) < v_line.qty then
        raise exception '% has only % left in this store', v_name, coalesce(v_stock, 0) using errcode = '23514';
      end if;
    end if;
    v_subtotal := v_subtotal + v_line.qty::bigint * v_price;
  end loop;

  if v_discount > v_subtotal then raise exception 'The discount is more than the sale' using errcode = '22023'; end if;
  if v_discount > 0 and not (v_perm->>'canDiscount')::boolean then
    raise exception 'You are not allowed to give discounts. Ask the owner.' using errcode = '42501';
  end if;
  if v_discount * 10000 > v_subtotal * (v_perm->>'maxDiscountBps')::bigint then
    raise exception 'That discount is more than the % %% you are allowed to give',
      round((v_perm->>'maxDiscountBps')::numeric / 100, 2) using errcode = '42501';
  end if;
  v_total := v_subtotal - v_discount;

  if v_legacy then
    if v_tendered < v_total then raise exception 'Amount paid is less than the total' using errcode = '22023'; end if;
    if v_method <> 'cash' and v_tendered <> v_total then
      raise exception 'Mobile money and card payments must equal the total' using errcode = '22023';
    end if;
    if v_method = 'mobile' and v_reference is null then
      raise exception 'Enter the mobile money reference' using errcode = '22023';
    end if;
    if v_total > 0 then
      v_tenders := jsonb_build_array(jsonb_build_object('method', v_method, 'amount', v_total, 'tendered', v_tendered,
        'reference', case when v_method in ('mobile','card') then v_reference end, 'customerId', null));
    elsif v_tendered > 0 then
      raise exception 'Nothing to pay for this sale' using errcode = '22023';
    end if;
  end if;

  select coalesce(sum((t->>'amount')::bigint), 0), coalesce(sum((t->>'tendered')::bigint), 0)
    into v_sum, v_sum_tendered from jsonb_array_elements(v_tenders) t;
  if v_sum <> v_total then
    raise exception 'The payments add up to % but the total is %', v_sum, v_total using errcode = '22023';
  end if;

  if v_customer is not null then
    if not (v_perm->>'canCredit')::boolean then
      raise exception 'You are not allowed to sell on credit. Ask the owner.' using errcode = '42501';
    end if;
    select * into v_cust from public.shop_customers where id = v_customer and business_id = v_company for update;
    if not found then raise exception 'Customer not found' using errcode = '42501'; end if;
    if v_cust.balance_minor + v_credit > v_cust.credit_limit_minor then
      raise exception '% can owe up to % and already owes %. Take more payment now or ask the owner to raise the limit.',
        v_cust.name, v_cust.credit_limit_minor, v_cust.balance_minor using errcode = '23514';
    end if;
  end if;

  v_sale := gen_random_uuid();
  insert into public.shop_sales (id, business_id, store_id, cashier_id, submission_key, request_sha256,
      receipt_number, currency, total_minor, subtotal_minor, discount_minor, discount_reason, customer_id,
      client_recorded_at, recorded_at)
    values (v_sale, v_company, v_store, p_actor, p_input->>'submissionKey', v_hash,
      v_ledger.next_receipt, v_ledger.currency, v_total, v_subtotal, v_discount, v_discount_reason, v_customer,
      v_client_time, at_time);

  -- Spread the discount across lines in proportion, remainder to lines with room.
  if v_discount > 0 then
    v_rem := v_discount;
    for v_line in
      select (l->>'productId')::uuid as product_id, (l->>'quantity')::bigint * pr.unit_price_minor as line_total
      from jsonb_array_elements(v_lines) l join public.shop_products pr on pr.id = (l->>'productId')::uuid
      order by 1
    loop
      v_share := (v_discount * v_line.line_total) / v_subtotal;
      v_alloc := v_alloc || jsonb_build_object(v_line.product_id::text, v_share);
      v_rem := v_rem - v_share;
    end loop;
    for v_line in
      select (l->>'productId')::uuid as product_id, (l->>'quantity')::bigint * pr.unit_price_minor as line_total
      from jsonb_array_elements(v_lines) l join public.shop_products pr on pr.id = (l->>'productId')::uuid
      order by 2 desc, 1
    loop
      exit when v_rem = 0;
      v_share := least(v_rem, v_line.line_total - (v_alloc->>v_line.product_id::text)::bigint);
      v_alloc := v_alloc || jsonb_build_object(v_line.product_id::text, (v_alloc->>v_line.product_id::text)::bigint + v_share);
      v_rem := v_rem - v_share;
    end loop;
  end if;

  for v_line in
    select (l->>'productId')::uuid as product_id, (l->>'quantity')::integer as qty
    from jsonb_array_elements(v_lines) l order by 1
  loop
    v_line_no := v_line_no + 1;
    select pr.name, pr.unit_price_minor, pr.track_stock into v_name, v_price, v_track from public.shop_products pr where pr.id = v_line.product_id;
    insert into public.shop_sale_lines (business_id, sale_id, line_no, product_id, product_name, quantity,
        unit_price_minor, line_total_minor, line_discount_minor)
      values (v_company, v_sale, v_line_no, v_line.product_id, v_name, v_line.qty, v_price, v_line.qty::bigint * v_price,
        coalesce((v_alloc->>v_line.product_id::text)::bigint, 0));
    if v_track then
      update public.shop_store_stock set quantity = quantity - v_line.qty, updated_at = at_time
        where store_id = v_store and product_id = v_line.product_id returning quantity into v_stock;
      insert into public.shop_stock_movements (business_id, store_id, product_id, delta, quantity_after,
          reason, sale_id, actor_id, recorded_at)
        values (v_company, v_store, v_line.product_id, -v_line.qty, v_stock, 'sale', v_sale, p_actor, at_time);
    end if;
  end loop;

  for v_t in select * from jsonb_array_elements(v_tenders)
  loop
    v_n := v_n + 1;
    insert into public.shop_sale_tenders (business_id, sale_id, tender_no, method, amount_minor, tendered_minor, reference, customer_id)
      values (v_company, v_sale, v_n, v_t->>'method', (v_t->>'amount')::bigint, (v_t->>'tendered')::bigint,
        v_t->>'reference', (v_t->>'customerId')::uuid);
  end loop;
  insert into public.shop_payments (sale_id, business_id, method, amount_due_minor, amount_tendered_minor, change_minor, reference)
    values (v_sale, v_company,
      case when v_n = 0 then 'cash' when v_n = 1 then v_tenders->0->>'method' else 'split' end,
      v_total, v_sum_tendered, v_sum_tendered - v_total,
      case when v_n = 1 then v_tenders->0->>'reference' end);

  if v_customer is not null then
    update public.shop_customers set balance_minor = balance_minor + v_credit, updated_at = at_time
      where id = v_customer returning balance_minor into v_amount;
    insert into public.shop_customer_entries (business_id, customer_id, kind, amount_minor, balance_after_minor,
        sale_id, store_id, actor_id, recorded_at)
      values (v_company, v_customer, 'credit_sale', v_credit, v_amount, v_sale, v_store, p_actor, at_time);
  end if;

  update public.shop_ledgers set next_receipt = next_receipt + 1, updated_at = at_time where business_id = v_company;
  return private.shop_receipt(v_sale, false);
end $fn$;
revoke all on function private.shop_record_sale(uuid, uuid, jsonb) from public, anon, authenticated;

create or replace function private.shop_refund_sale(p_actor uuid, p_session uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  at_time timestamptz := clock_timestamp();
  v_company uuid;
  v_role text;
  v_sale public.shop_sales;
  v_existing public.shop_refunds;
  v_refund uuid;
  v_hash text;
  v_lines jsonb;
  v_line record;
  v_l record;
  v_reason text;
  v_restock boolean;
  v_void boolean;
  v_amount bigint := 0;
  v_part bigint;
  v_no integer;
  v_stock integer;
  v_credit_paid bigint;
  v_credit_back bigint;
  v_credit bigint := 0;
  v_method text;
  v_balance bigint;
  v_priced jsonb := '[]'::jsonb;
  v_item jsonb;
  v_pol public.shop_refund_policy_history;
  v_snap jsonb;
  v_limit integer;
  v_evidence jsonb;
begin
  if jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'Authenticated account required' using errcode = '42501';
  end if;
  v_company := private.shop_uuid(p_input, 'companyId');
  v_role := private.shop_member_role(p_actor, p_session, v_company);
  if v_role <> 'owner' then raise exception 'Only the business owner can do this' using errcode = '42501'; end if;
  perform 1 from public.shop_ledgers where business_id = v_company for update;
  if not found then raise exception 'The owner has not set up this shop yet' using errcode = '42501'; end if;

  select * into v_sale from public.shop_sales where id = private.shop_uuid(p_input, 'saleId') and business_id = v_company;
  if not found then raise exception 'Sale not found' using errcode = '42501'; end if;
  if (p_input->>'refundKey') is null or (p_input->>'refundKey') !~ '^[A-Za-z0-9_-]{16,64}$' then
    raise exception 'Invalid refundKey' using errcode = '22023';
  end if;
  v_reason := btrim(coalesce(p_input->>'reason', ''));
  if length(v_reason) not between 1 and 200 then raise exception 'Say why this is being refunded' using errcode = '22023'; end if;
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
  v_hash := encode(sha256(convert_to(jsonb_build_object('saleId', v_sale.id, 'void', v_void,
    'lines', v_lines, 'restock', v_restock, 'reason', v_reason)::text, 'UTF8')), 'hex');
  select * into v_existing from public.shop_refunds where business_id = v_company and refund_key = p_input->>'refundKey';
  if found then
    if v_existing.request_sha256 <> v_hash then
      raise exception 'This refund was already recorded with different details' using errcode = '23505';
    end if;
    return private.shop_receipt(v_sale.id, true);
  end if;

  -- Company refund policy. Both the terms in force when the sale was made and
  -- the terms in force now must allow this kind of refund (stricter age limit
  -- wins). A policy enabled later never reopens an older sale, and turning it
  -- off later never undoes a refund already posted. Replays above are exempt.
  v_snap := v_sale.refund_policy_snapshot;
  if v_snap is null then
    raise exception 'This sale pre-dates refund policies and cannot be refunded here' using errcode = '42501';
  end if;
  select * into v_pol from public.shop_refund_policy_history h
    where h.business_id = v_company and h.effective_at <= at_time order by h.revision desc limit 1;
  if not found or not v_pol.refunds_enabled or not (v_snap->>'refundsEnabled')::boolean then
    raise exception 'Refunds are turned off for this business or were not allowed when this sale was made' using errcode = '42501';
  end if;
  if v_void and not (v_pol.allow_void and (v_snap->>'allowVoid')::boolean) then
    raise exception 'Refunding a whole sale is not allowed by this business''s refund policy' using errcode = '42501';
  end if;
  if not v_void and not (v_pol.allow_partial and (v_snap->>'allowPartial')::boolean) then
    raise exception 'Refunding part of a sale is not allowed by this business''s refund policy' using errcode = '42501';
  end if;
  v_limit := least(v_pol.max_age_days, (v_snap->>'maxAgeDays')::integer);
  if at_time > v_sale.recorded_at + make_interval(days => v_limit) then
    raise exception 'This sale is past the % day refund window', v_limit using errcode = '42501';
  end if;
  v_evidence := jsonb_build_object('kind', case when v_void then 'void' else 'partial' end,
    'saleRevision', v_sale.refund_policy_revision, 'saleTerms', v_snap,
    'decisionRevision', v_pol.revision,
    'decisionTerms', jsonb_build_object('refundsEnabled', v_pol.refunds_enabled, 'allowVoid', v_pol.allow_void,
      'allowPartial', v_pol.allow_partial, 'maxAgeDays', v_pol.max_age_days),
    'effectiveLimitDays', v_limit, 'decidedAt', at_time);

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

  -- Price each refunded line from what was paid: the first n units of a line
  -- are worth floor(n * paid / quantity), so refunds always sum to what was paid.
  for v_line in
    select (e->>'lineNo')::int as line_no, (e->>'quantity')::int as qty from jsonb_array_elements(v_lines) e order by 1
  loop
    select l.product_id, l.product_name, l.quantity, l.unit_price_minor, l.line_total_minor - l.line_discount_minor as paid,
        coalesce((select sum(rl.quantity) from public.shop_refund_lines rl
          where rl.sale_id = l.sale_id and rl.line_no = l.line_no), 0) as done
      into v_l
      from public.shop_sale_lines l where l.sale_id = v_sale.id and l.line_no = v_line.line_no;
    if not found then raise exception 'That item is not on this sale' using errcode = '22023'; end if;
    if v_line.qty > v_l.quantity - v_l.done then
      raise exception 'Only % of % can still be refunded', v_l.quantity - v_l.done, v_l.product_name using errcode = '23514';
    end if;
    v_part := ((v_l.done + v_line.qty) * v_l.paid) / v_l.quantity - (v_l.done * v_l.paid) / v_l.quantity;
    v_amount := v_amount + v_part;
    v_priced := v_priced || jsonb_build_array(jsonb_build_object('lineNo', v_line.line_no, 'quantity', v_line.qty,
      'productId', v_l.product_id, 'unitPrice', v_l.unit_price_minor, 'amount', v_part));
  end loop;
  if v_amount <= 0 then raise exception 'Nothing to refund: these items were free' using errcode = '23514'; end if;

  -- Debt first: up to the credit still outstanding on this sale and what the customer still owes.
  if v_sale.customer_id is not null then
    select coalesce(sum(amount_minor), 0) into v_credit_paid from public.shop_sale_tenders where sale_id = v_sale.id and method = 'credit';
    select coalesce(sum(credit_minor), 0) into v_credit_back from public.shop_refunds where sale_id = v_sale.id;
    select balance_minor into v_balance from public.shop_customers where id = v_sale.customer_id for update;
    v_credit := greatest(0, least(v_amount, v_credit_paid - v_credit_back, v_balance));
  end if;
  if v_credit = v_amount then
    v_method := 'credit';
  else
    select t.method into v_method from public.shop_sale_tenders t
      where t.sale_id = v_sale.id and t.method <> 'credit'
      order by case t.method when 'cash' then 1 when 'mobile' then 2 else 3 end, t.tender_no limit 1;
    if v_method is null then
      select case when p.method in ('cash','mobile','card') then p.method else 'cash' end into v_method
        from public.shop_payments p where p.sale_id = v_sale.id;
    end if;
  end if;

  select coalesce(max(refund_no), 0) + 1 into v_no from public.shop_refunds where sale_id = v_sale.id;
  if v_no > 100 then raise exception 'Too many refunds on one sale' using errcode = '23514'; end if;
  v_refund := gen_random_uuid();
  insert into public.shop_refunds (id, business_id, sale_id, refund_no, refund_key, request_sha256, method,
      amount_minor, credit_minor, returned_to_stock, reason, actor_id, recorded_at, policy_evidence)
    values (v_refund, v_company, v_sale.id, v_no, p_input->>'refundKey', v_hash, v_method,
      v_amount, v_credit, v_restock, v_reason, p_actor, at_time, v_evidence);

  for v_item in select * from jsonb_array_elements(v_priced)
  loop
    insert into public.shop_refund_lines (business_id, refund_id, sale_id, line_no, product_id, quantity,
        unit_price_minor, line_total_minor)
      values (v_company, v_refund, v_sale.id, (v_item->>'lineNo')::int, (v_item->>'productId')::uuid,
        (v_item->>'quantity')::int, (v_item->>'unitPrice')::bigint, (v_item->>'amount')::bigint);
    if v_restock and (select pr.track_stock from public.shop_products pr where pr.id = (v_item->>'productId')::uuid) then
      insert into public.shop_store_stock (business_id, store_id, product_id, quantity)
        values (v_company, v_sale.store_id, (v_item->>'productId')::uuid, 0) on conflict do nothing;
      update public.shop_store_stock set quantity = quantity + (v_item->>'quantity')::int, updated_at = at_time
        where store_id = v_sale.store_id and product_id = (v_item->>'productId')::uuid returning quantity into v_stock;
      insert into public.shop_stock_movements (business_id, store_id, product_id, delta, quantity_after,
          reason, sale_id, refund_id, actor_id, recorded_at)
        values (v_company, v_sale.store_id, (v_item->>'productId')::uuid, (v_item->>'quantity')::int, v_stock,
          'refund', v_sale.id, v_refund, p_actor, at_time);
    end if;
  end loop;

  if v_credit > 0 then
    update public.shop_customers set balance_minor = balance_minor - v_credit, updated_at = at_time
      where id = v_sale.customer_id returning balance_minor into v_balance;
    insert into public.shop_customer_entries (business_id, customer_id, kind, amount_minor, balance_after_minor,
        sale_id, refund_id, store_id, actor_id, recorded_at)
      values (v_company, v_sale.customer_id, 'refund', -v_credit, v_balance, v_sale.id, v_refund, v_sale.store_id, p_actor, at_time);
  end if;
  return private.shop_receipt(v_sale.id, false);
end $fn$;
revoke all on function private.shop_refund_sale(uuid, uuid, jsonb) from public, anon, authenticated;

-- Router: the previous baseline (20261110130000) plus the two product actions.
create or replace function public.tallybook_shop_ops(p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $body$
declare actor uuid:=auth.uid();sid uuid;
begin
  begin sid:=(auth.jwt()->>'session_id')::uuid;
  exception when others then sid:=null; end;
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

commit;
