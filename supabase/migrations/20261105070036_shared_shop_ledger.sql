-- Shared shop ledger: the cloud-authoritative record for businesses with
-- attendants. Owners manage stores, products, stock and store assignments;
-- owners and assigned attendants record sales. Every write goes through one
-- session-bound SECURITY DEFINER operation. Browser roles have no table access.
--
-- Exactly-once: a sale is keyed by (business, submission_key). A retry with the
-- same request returns the original receipt; a reused key with a different
-- request is refused. Stock rows are locked and checked in the same
-- transaction, so concurrent sales cannot oversell.
--
-- Requires: 20261013123347_business_identity and the invitation migration
-- (public.company_member_invites, private.tallybook_membership_action).
begin;

create table public.shop_ledgers (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  next_receipt bigint not null default 1 check (next_receipt >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shop_stores (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (business_id, id)
);
create unique index shop_stores_active_name
  on public.shop_stores (business_id, lower(btrim(name))) where status = 'active';

-- Cascades from business_members: revoking an attendant removes store access
-- in the same transaction as the membership removal.
create table public.shop_store_assignments (
  business_id uuid not null,
  store_id uuid not null,
  user_id uuid not null,
  assigned_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (store_id, user_id),
  foreign key (business_id, store_id) references public.shop_stores(business_id, id) on delete cascade,
  foreign key (business_id, user_id) references public.business_members(business_id, user_id) on delete cascade
);
create index shop_store_assignments_user on public.shop_store_assignments (business_id, user_id);

create table public.shop_products (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  unit_price_minor bigint not null check (unit_price_minor between 0 and 100000000000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id)
);

create table public.shop_store_stock (
  business_id uuid not null,
  store_id uuid not null,
  product_id uuid not null,
  quantity integer not null check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (store_id, product_id),
  foreign key (business_id, store_id) references public.shop_stores(business_id, id),
  foreign key (business_id, product_id) references public.shop_products(business_id, id)
);

create table public.shop_sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  store_id uuid not null,
  cashier_id uuid not null references auth.users(id),
  submission_key text not null check (submission_key ~ '^[A-Za-z0-9_-]{16,64}$'),
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  receipt_number bigint not null check (receipt_number >= 1),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  total_minor bigint not null check (total_minor >= 0),
  client_recorded_at timestamptz,
  recorded_at timestamptz not null default now(),
  unique (business_id, submission_key),
  unique (business_id, receipt_number),
  unique (business_id, id),
  foreign key (business_id, store_id) references public.shop_stores(business_id, id)
);
create index shop_sales_store_time on public.shop_sales (business_id, store_id, recorded_at desc);
create index shop_sales_cashier_time on public.shop_sales (business_id, cashier_id, recorded_at desc);

create table public.shop_sale_lines (
  business_id uuid not null,
  sale_id uuid not null,
  line_no smallint not null check (line_no between 1 and 100),
  product_id uuid not null,
  product_name text not null,
  quantity integer not null check (quantity between 1 and 100000),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  line_total_minor bigint not null,
  primary key (sale_id, line_no),
  check (line_total_minor = quantity::bigint * unit_price_minor),
  foreign key (business_id, sale_id) references public.shop_sales(business_id, id),
  foreign key (business_id, product_id) references public.shop_products(business_id, id)
);

create table public.shop_payments (
  sale_id uuid primary key,
  business_id uuid not null,
  method text not null check (method in ('cash','mobile','card')),
  amount_due_minor bigint not null check (amount_due_minor >= 0),
  amount_tendered_minor bigint not null,
  change_minor bigint not null,
  reference text check (reference is null or length(btrim(reference)) between 1 and 80),
  check (amount_tendered_minor >= amount_due_minor),
  check (change_minor = amount_tendered_minor - amount_due_minor),
  check (method <> 'mobile' or reference is not null),
  check (method = 'cash' or change_minor = 0),
  foreign key (business_id, sale_id) references public.shop_sales(business_id, id)
);

create table public.shop_stock_movements (
  id bigint generated always as identity primary key,
  business_id uuid not null,
  store_id uuid not null,
  product_id uuid not null,
  delta integer not null check (delta <> 0),
  quantity_after integer not null check (quantity_after >= 0),
  reason text not null check (reason in ('sale','restock','correction')),
  sale_id uuid,
  operation_id uuid unique,
  note text check (note is null or length(note) <= 200),
  actor_id uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  check ((reason = 'sale') = (sale_id is not null)),
  check (reason = 'sale' or operation_id is not null),
  foreign key (business_id, store_id) references public.shop_stores(business_id, id),
  foreign key (business_id, product_id) references public.shop_products(business_id, id),
  foreign key (business_id, sale_id) references public.shop_sales(business_id, id)
);
create index shop_stock_movements_store on public.shop_stock_movements (business_id, store_id, recorded_at desc);

do $$
declare t text;
begin
  foreach t in array array['shop_ledgers','shop_stores','shop_store_assignments','shop_products',
    'shop_store_stock','shop_sales','shop_sale_lines','shop_payments','shop_stock_movements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;
revoke all on sequence public.shop_stock_movements_id_seq from public, anon, authenticated;

-- Sales history is append-only, even for the definer role used by the RPC.
create function private.shop_reject_history_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Shop sales history is append-only' using errcode = '42501';
end $$;
create trigger shop_sales_append_only before update or delete on public.shop_sales
  for each row execute function private.shop_reject_history_change();
create trigger shop_sale_lines_append_only before update or delete on public.shop_sale_lines
  for each row execute function private.shop_reject_history_change();
create trigger shop_payments_append_only before update or delete on public.shop_payments
  for each row execute function private.shop_reject_history_change();
create trigger shop_stock_movements_append_only before update or delete on public.shop_stock_movements
  for each row execute function private.shop_reject_history_change();

create function private.shop_uuid(p_input jsonb, p_key text) returns uuid
language plpgsql immutable set search_path = '' as $$
declare v text := p_input->>p_key;
begin
  if v is null or v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Invalid %', p_key using errcode = '22023';
  end if;
  return v::uuid;
end $$;

create function private.shop_int(p_input jsonb, p_key text, p_min bigint, p_max bigint) returns bigint
language plpgsql immutable set search_path = '' as $$
declare v jsonb := p_input->p_key; n numeric;
begin
  if v is null or jsonb_typeof(v) <> 'number' then raise exception 'Invalid %', p_key using errcode = '22023'; end if;
  n := (v #>> '{}')::numeric;
  if n <> trunc(n) or n < p_min or n > p_max then raise exception 'Invalid %', p_key using errcode = '22023'; end if;
  return n::bigint;
end $$;

create function private.shop_receipt(p_sale uuid, p_replayed boolean) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'saleId', s.id, 'companyId', s.business_id, 'storeId', s.store_id, 'storeName', st.name,
    'cashierId', s.cashier_id, 'submissionKey', s.submission_key,
    'receiptNumber', s.receipt_number, 'currency', s.currency, 'totalMinor', s.total_minor,
    'recordedAt', s.recorded_at, 'replayed', p_replayed,
    'payment', jsonb_build_object('method', p.method, 'amountDueMinor', p.amount_due_minor,
      'amountTenderedMinor', p.amount_tendered_minor, 'changeMinor', p.change_minor, 'reference', p.reference),
    'lines', (select jsonb_agg(jsonb_build_object('productId', l.product_id, 'name', l.product_name,
        'quantity', l.quantity, 'unitPriceMinor', l.unit_price_minor, 'lineTotalMinor', l.line_total_minor)
        order by l.line_no) from public.shop_sale_lines l where l.sale_id = s.id))
  from public.shop_sales s
  join public.shop_payments p on p.sale_id = s.id
  join public.shop_stores st on st.id = s.store_id
  where s.id = p_sale
$$;

create function private.tallybook_shop_action(p_action text, p_actor uuid, p_session uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  at_time timestamptz := clock_timestamp();
  v_company uuid;
  v_role text;
  v_owner uuid;
  v_store uuid;
  v_product uuid;
  v_user uuid;
  v_name text;
  v_ledger public.shop_ledgers;
  v_existing public.shop_sales;
  v_sale uuid;
  v_hash text;
  v_lines jsonb;
  v_line record;
  v_stock integer;
  v_total bigint := 0;
  v_method text;
  v_tendered bigint;
  v_reference text;
  v_line_no integer := 0;
  v_qty bigint;
  v_delta bigint;
  v_client_time timestamptz;
  v_result jsonb;
  v_token text;
begin
  if p_actor is null or p_session is null or p_action is null or jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'Authenticated account required' using errcode = '42501';
  end if;
  -- A validated JWT alone is insufficient after sign-out or session revocation.
  perform 1 from auth.sessions s
    where s.id = p_session and s.user_id = p_actor and (s.not_after is null or s.not_after > at_time);
  if not found then raise exception 'Active Auth session required' using errcode = '42501'; end if;

  v_company := private.shop_uuid(p_input, 'companyId');
  select b.owner_id into v_owner from public.businesses b where b.id = v_company;
  select m.role into v_role from public.business_members m
    where m.business_id = v_company and m.user_id = p_actor;
  if v_owner is null or v_role is null then
    raise exception 'Business access denied' using errcode = '42501';
  end if;
  if v_role = 'owner' and v_owner <> p_actor then
    raise exception 'Business access denied' using errcode = '42501';
  end if;

  -- ---------------------------------------------------------------- reads
  if p_action = 'overview' then
    select * into v_ledger from public.shop_ledgers where business_id = v_company;
    return jsonb_build_object(
      'companyId', v_company,
      'role', v_role,
      'currency', v_ledger.currency,
      'stores', coalesce((select jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'status', st.status)
          order by lower(st.name), st.id)
        from public.shop_stores st where st.business_id = v_company
          and (v_role = 'owner' or (st.status = 'active' and exists (select 1 from public.shop_store_assignments a
            where a.store_id = st.id and a.user_id = p_actor)))), '[]'::jsonb),
      'products', coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.name,
          'unitPriceMinor', pr.unit_price_minor, 'active', pr.active) order by lower(pr.name), pr.id)
        from public.shop_products pr where pr.business_id = v_company and (v_role = 'owner' or pr.active)), '[]'::jsonb),
      'stock', coalesce((select jsonb_agg(jsonb_build_object('storeId', k.store_id, 'productId', k.product_id,
          'quantity', k.quantity))
        from public.shop_store_stock k where k.business_id = v_company
          and (v_role = 'owner' or exists (select 1 from public.shop_store_assignments a
            where a.store_id = k.store_id and a.user_id = p_actor))), '[]'::jsonb),
      'members', case when v_role = 'owner' then coalesce((select jsonb_agg(jsonb_build_object(
          'userId', m.user_id, 'role', m.role, 'email', u.email,
          'storeIds', coalesce((select jsonb_agg(a.store_id order by a.store_id) from public.shop_store_assignments a
            where a.business_id = v_company and a.user_id = m.user_id), '[]'::jsonb)) order by m.role desc, u.email)
        from public.business_members m join auth.users u on u.id = m.user_id
        where m.business_id = v_company), '[]'::jsonb) else '[]'::jsonb end,
      'pendingInvites', case when v_role = 'owner' then coalesce((select jsonb_agg(jsonb_build_object(
          'invitationId', i.id, 'email', u.email, 'expiresAt', i.expires_at) order by i.created_at)
        from public.company_member_invites i join auth.users u on u.id = i.target_user_id
        where i.company_id = v_company and i.status = 'pending' and i.expires_at > at_time), '[]'::jsonb)
        else '[]'::jsonb end);
  end if;

  if p_action = 'listSales' then
    v_store := case when p_input ? 'storeId' then private.shop_uuid(p_input, 'storeId') end;
    return jsonb_build_object('companyId', v_company, 'sales', coalesce((
      select jsonb_agg(private.shop_receipt(x.id, false) order by x.recorded_at desc, x.receipt_number desc)
      from (select s.id, s.recorded_at, s.receipt_number from public.shop_sales s
        where s.business_id = v_company
          and (v_store is null or s.store_id = v_store)
          and (v_role = 'owner' or s.cashier_id = p_actor)
        order by s.recorded_at desc, s.receipt_number desc limit 50) x), '[]'::jsonb));
  end if;

  -- ---------------------------------------------------------------- sales
  if p_action = 'recordSale' then
    v_store := private.shop_uuid(p_input, 'storeId');
    v_method := p_input->>'paymentMethod';
    if v_method is null or v_method not in ('cash','mobile','card') then
      raise exception 'Choose a payment method' using errcode = '22023';
    end if;
    v_tendered := private.shop_int(p_input, 'amountTenderedMinor', 0, 100000000000);
    v_reference := nullif(btrim(coalesce(p_input->>'paymentReference', '')), '');
    if v_reference is not null and length(v_reference) > 80 then
      raise exception 'Payment reference is too long' using errcode = '22023';
    end if;
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

    -- Merge repeated products and canonicalise the request for retry checks.
    select jsonb_agg(jsonb_build_object('productId', x.product_id, 'quantity', x.qty) order by x.product_id)
      into v_lines
      from (select private.shop_uuid(l, 'productId') as product_id,
                   sum(private.shop_int(l, 'quantity', 1, 100000)) as qty
            from jsonb_array_elements(p_input->'lines') l
            group by 1) x;
    if exists (select 1 from jsonb_array_elements(v_lines) l where (l->>'quantity')::bigint > 100000) then
      raise exception 'Quantity too large' using errcode = '22023';
    end if;
    v_hash := encode(sha256(convert_to(jsonb_build_object(
      'storeId', v_store, 'method', v_method, 'tendered', v_tendered,
      'reference', v_reference, 'lines', v_lines)::text, 'UTF8')), 'hex');

    -- One sale at a time per business: serialises receipt numbers and
    -- makes the retry check below race-free.
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

    -- Authorisation is checked at write time, so a revoked attendant or a
    -- removed store assignment takes effect immediately, including for
    -- sales queued offline before the change.
    perform 1 from public.shop_stores st where st.id = v_store and st.business_id = v_company and st.status = 'active';
    if not found then raise exception 'This store is not open for sales' using errcode = '42501'; end if;
    if v_role <> 'owner' then
      perform 1 from public.shop_store_assignments a where a.store_id = v_store and a.user_id = p_actor;
      if not found then raise exception 'You are not assigned to this store' using errcode = '42501'; end if;
    end if;

    v_sale := gen_random_uuid();
    for v_line in
      select (l->>'productId')::uuid as product_id, (l->>'quantity')::integer as qty
      from jsonb_array_elements(v_lines) l order by 1
    loop
      select pr.name, pr.unit_price_minor into v_name, v_delta
        from public.shop_products pr where pr.id = v_line.product_id and pr.business_id = v_company and pr.active;
      if not found then raise exception 'A product in this sale is no longer available' using errcode = '22023'; end if;
      select k.quantity into v_stock from public.shop_store_stock k
        where k.store_id = v_store and k.product_id = v_line.product_id for update;
      if coalesce(v_stock, 0) < v_line.qty then
        raise exception '% has only % left in this store', v_name, coalesce(v_stock, 0) using errcode = '23514';
      end if;
      v_total := v_total + v_line.qty::bigint * v_delta;
    end loop;

    if v_tendered < v_total then
      raise exception 'Amount paid is less than the total' using errcode = '22023';
    end if;
    if v_method <> 'cash' and v_tendered <> v_total then
      raise exception 'Mobile money and card payments must equal the total' using errcode = '22023';
    end if;
    if v_method = 'mobile' and v_reference is null then
      raise exception 'Enter the mobile money reference' using errcode = '22023';
    end if;

    insert into public.shop_sales (id, business_id, store_id, cashier_id, submission_key, request_sha256,
        receipt_number, currency, total_minor, client_recorded_at, recorded_at)
      values (v_sale, v_company, v_store, p_actor, p_input->>'submissionKey', v_hash,
        v_ledger.next_receipt, v_ledger.currency, v_total, v_client_time, at_time);

    for v_line in
      select (l->>'productId')::uuid as product_id, (l->>'quantity')::integer as qty
      from jsonb_array_elements(v_lines) l order by 1
    loop
      v_line_no := v_line_no + 1;
      select pr.name, pr.unit_price_minor into v_name, v_delta
        from public.shop_products pr where pr.id = v_line.product_id;
      insert into public.shop_sale_lines (business_id, sale_id, line_no, product_id, product_name, quantity,
          unit_price_minor, line_total_minor)
        values (v_company, v_sale, v_line_no, v_line.product_id, v_name, v_line.qty, v_delta, v_line.qty::bigint * v_delta);
      update public.shop_store_stock set quantity = quantity - v_line.qty, updated_at = at_time
        where store_id = v_store and product_id = v_line.product_id
        returning quantity into v_stock;
      insert into public.shop_stock_movements (business_id, store_id, product_id, delta, quantity_after,
          reason, sale_id, actor_id, recorded_at)
        values (v_company, v_store, v_line.product_id, -v_line.qty, v_stock, 'sale', v_sale, p_actor, at_time);
    end loop;

    insert into public.shop_payments (sale_id, business_id, method, amount_due_minor, amount_tendered_minor,
        change_minor, reference)
      values (v_sale, v_company, v_method, v_total, v_tendered, v_tendered - v_total, v_reference);
    update public.shop_ledgers set next_receipt = next_receipt + 1, updated_at = at_time
      where business_id = v_company;
    return private.shop_receipt(v_sale, false);
  end if;

  -- ---------------------------------------------------------------- owner only
  if v_role <> 'owner' then
    raise exception 'Only the business owner can do this' using errcode = '42501';
  end if;
  -- Serialise owner changes per business.
  perform 1 from public.businesses where id = v_company for update;

  if p_action = 'setupLedger' then
    v_name := upper(btrim(coalesce(p_input->>'currency', '')));
    if v_name !~ '^[A-Z]{3}$' then raise exception 'Invalid currency' using errcode = '22023'; end if;
    insert into public.shop_ledgers (business_id, currency) values (v_company, v_name)
      on conflict (business_id) do nothing;
    select * into v_ledger from public.shop_ledgers where business_id = v_company for update;
    if v_ledger.currency <> v_name then
      if exists (select 1 from public.shop_sales where business_id = v_company) then
        raise exception 'Currency cannot change after sales are recorded' using errcode = '42501';
      end if;
      update public.shop_ledgers set currency = v_name, updated_at = at_time where business_id = v_company;
    end if;
    return jsonb_build_object('companyId', v_company, 'currency', v_name);
  end if;

  if p_action = 'saveStore' then
    v_store := private.shop_uuid(p_input, 'storeId');
    v_name := btrim(coalesce(p_input->>'name', ''));
    if length(v_name) not between 1 and 80 then raise exception 'Store name must be 1 to 80 characters' using errcode = '22023'; end if;
    if exists (select 1 from public.shop_stores where id = v_store and business_id <> v_company) then
      raise exception 'Store access denied' using errcode = '42501';
    end if;
    if exists (select 1 from public.shop_stores where business_id = v_company and status = 'active'
        and lower(btrim(name)) = lower(v_name) and id <> v_store) then
      raise exception 'Another store already uses that name' using errcode = '23505';
    end if;
    insert into public.shop_stores (id, business_id, name, created_by) values (v_store, v_company, v_name, p_actor)
      on conflict (id) do update set name = excluded.name;
    return jsonb_build_object('storeId', v_store, 'name', v_name);
  end if;

  if p_action = 'setStoreStatus' then
    v_store := private.shop_uuid(p_input, 'storeId');
    v_name := p_input->>'status';
    if v_name is null or v_name not in ('active','archived') then raise exception 'Invalid status' using errcode = '22023'; end if;
    update public.shop_stores set status = v_name where id = v_store and business_id = v_company;
    if not found then raise exception 'Store access denied' using errcode = '42501'; end if;
    return jsonb_build_object('storeId', v_store, 'status', v_name);
  end if;

  if p_action in ('assignStore','unassignStore') then
    v_store := private.shop_uuid(p_input, 'storeId');
    v_user := private.shop_uuid(p_input, 'userId');
    perform 1 from public.shop_stores where id = v_store and business_id = v_company;
    if not found then raise exception 'Store access denied' using errcode = '42501'; end if;
    if p_action = 'assignStore' then
      perform 1 from public.business_members where business_id = v_company and user_id = v_user and role = 'attendant';
      if not found then raise exception 'Only an attendant of this business can be assigned' using errcode = '42501'; end if;
      insert into public.shop_store_assignments (business_id, store_id, user_id, assigned_by)
        values (v_company, v_store, v_user, p_actor) on conflict do nothing;
    else
      delete from public.shop_store_assignments where store_id = v_store and user_id = v_user and business_id = v_company;
    end if;
    return jsonb_build_object('storeId', v_store, 'userId', v_user, 'assigned', p_action = 'assignStore');
  end if;

  if p_action = 'saveProduct' then
    v_product := private.shop_uuid(p_input, 'productId');
    v_name := btrim(coalesce(p_input->>'name', ''));
    if length(v_name) not between 1 and 120 then raise exception 'Product name must be 1 to 120 characters' using errcode = '22023'; end if;
    v_qty := private.shop_int(p_input, 'unitPriceMinor', 0, 100000000000);
    if exists (select 1 from public.shop_products where id = v_product and business_id <> v_company) then
      raise exception 'Product access denied' using errcode = '42501';
    end if;
    insert into public.shop_products (id, business_id, name, unit_price_minor, active)
      values (v_product, v_company, v_name, v_qty, coalesce((p_input->>'active')::boolean, true))
      on conflict (id) do update set name = excluded.name, unit_price_minor = excluded.unit_price_minor,
        active = excluded.active, updated_at = at_time;
    return jsonb_build_object('productId', v_product, 'name', v_name, 'unitPriceMinor', v_qty);
  end if;

  if p_action = 'adjustStock' then
    v_store := private.shop_uuid(p_input, 'storeId');
    v_product := private.shop_uuid(p_input, 'productId');
    v_user := private.shop_uuid(p_input, 'operationId');
    v_delta := private.shop_int(p_input, 'delta', -1000000, 1000000);
    if v_delta = 0 then raise exception 'Change must not be zero' using errcode = '22023'; end if;
    v_name := nullif(btrim(coalesce(p_input->>'note', '')), '');
    -- Exact retry of the same adjustment is a no-op.
    select m.quantity_after into v_stock from public.shop_stock_movements m
      where m.operation_id = v_user and m.business_id = v_company and m.store_id = v_store
        and m.product_id = v_product and m.delta = v_delta;
    if found then return jsonb_build_object('storeId', v_store, 'productId', v_product, 'quantity', v_stock, 'replayed', true); end if;
    if exists (select 1 from public.shop_stock_movements where operation_id = v_user) then
      raise exception 'This stock change was already recorded with different details' using errcode = '23505';
    end if;
    perform 1 from public.shop_stores where id = v_store and business_id = v_company;
    if not found then raise exception 'Store access denied' using errcode = '42501'; end if;
    perform 1 from public.shop_products where id = v_product and business_id = v_company;
    if not found then raise exception 'Product access denied' using errcode = '42501'; end if;
    insert into public.shop_store_stock (business_id, store_id, product_id, quantity)
      values (v_company, v_store, v_product, 0) on conflict do nothing;
    select quantity into v_stock from public.shop_store_stock where store_id = v_store and product_id = v_product for update;
    if v_stock + v_delta < 0 then raise exception 'Stock cannot go below zero' using errcode = '23514'; end if;
    update public.shop_store_stock set quantity = quantity + v_delta, updated_at = at_time
      where store_id = v_store and product_id = v_product returning quantity into v_stock;
    insert into public.shop_stock_movements (business_id, store_id, product_id, delta, quantity_after, reason,
        operation_id, note, actor_id, recorded_at)
      values (v_company, v_store, v_product, v_delta, v_stock,
        case when v_delta > 0 then 'restock' else 'correction' end, v_user, left(v_name, 200), p_actor, at_time);
    return jsonb_build_object('storeId', v_store, 'productId', v_product, 'quantity', v_stock, 'replayed', false);
  end if;

  if p_action = 'inviteByEmail' then
    v_name := lower(btrim(coalesce(p_input->>'email', '')));
    if v_name !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address' using errcode = '22023'; end if;
    select u.id into v_user from auth.users u where lower(u.email) = v_name;
    if v_user is null then
      raise exception 'No Tallybook account uses that email yet. Ask them to sign up first.' using errcode = 'P0002';
    end if;
    v_token := 'v1.' || translate(rtrim(encode(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()), 'base64'), '='), '+/', '-_');
    v_result := private.tallybook_membership_action('invite', p_actor, p_session, v_company, v_user,
      encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), null);
    return v_result || jsonb_build_object('inviteToken', v_token, 'email', v_name);
  end if;

  raise exception 'Unrecognised shop action' using errcode = '42501';
end $fn$;

revoke all on function private.tallybook_shop_action(text, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function private.shop_receipt(uuid, boolean), private.shop_uuid(jsonb, text),
  private.shop_int(jsonb, text, bigint, bigint), private.shop_reject_history_change() from public, anon, authenticated;

create function public.tallybook_shop(p_action text, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $body$
declare
  actor uuid := auth.uid();
  sid uuid;
begin
  begin
    sid := (auth.jwt()->>'session_id')::uuid;
  exception when others then sid := null;
  end;
  return private.tallybook_shop_action(p_action, actor, sid, p_input);
end $body$;
revoke all on function public.tallybook_shop(text, jsonb) from public, anon;
grant execute on function public.tallybook_shop(text, jsonb) to authenticated;

commit;
