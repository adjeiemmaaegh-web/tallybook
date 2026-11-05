-- Shared shop, part 3: the full till. Discounts, split payments, credit sales
-- to named customers, repayments, and per-attendant permissions for both.
--
-- Rules (all enforced here, never trusted from the browser):
-- * Discount is per sale, needs a reason, and is spread across the lines so a
--   refund pays back exactly what was paid. The owner may always discount; an
--   attendant only if the owner allowed it, up to their own maximum percent.
-- * A sale is paid by 1 to 5 tenders (cash, mobile, card, credit) that add up to
--   the total. Change comes only from cash. Mobile money needs its reference.
-- * Credit goes only to a customer of this business, within the credit limit
--   the owner set, and only by the owner or an attendant allowed to give credit.
--   Customer balances move only through append-only entries.
-- * Repayments are exactly-once (repayment key) and can't exceed what is owed.
-- * A refund on a credit sale first reduces what the customer owes, the rest
--   goes back as money.
-- * Sales queued in the earlier request shape keep their earlier retry hash.
--
-- Requires: 20261105110003_shared_shop_refunds_and_opening_import.
begin;

-- ---------------------------------------------------------------- tables
create table public.shop_customers (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  phone text check (phone is null or phone ~ '^\+?[0-9 ]{6,20}$'),
  credit_limit_minor bigint not null default 0 check (credit_limit_minor between 0 and 100000000000),
  balance_minor bigint not null default 0 check (balance_minor >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id)
);
create unique index shop_customers_phone on public.shop_customers (business_id, phone) where phone is not null;

create table public.shop_member_permissions (
  business_id uuid not null,
  user_id uuid not null,
  can_discount boolean not null default false,
  max_discount_bps integer not null default 0 check (max_discount_bps between 0 and 10000),
  can_credit boolean not null default false,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (business_id, user_id),
  foreign key (business_id, user_id) references public.business_members(business_id, user_id) on delete cascade
);

alter table public.shop_sales
  add column subtotal_minor bigint check (subtotal_minor is null or subtotal_minor >= 0),
  add column discount_minor bigint not null default 0 check (discount_minor >= 0),
  add column discount_reason text check (discount_reason is null or length(btrim(discount_reason)) between 1 and 120),
  add column customer_id uuid,
  add constraint shop_sales_customer_fk foreign key (business_id, customer_id) references public.shop_customers(business_id, id),
  add constraint shop_sales_discount_total check (subtotal_minor is null or total_minor = subtotal_minor - discount_minor),
  add constraint shop_sales_discount_reason check (discount_minor = 0 or discount_reason is not null);

alter table public.shop_sale_lines
  add column line_discount_minor bigint not null default 0,
  add constraint shop_sale_lines_discount_valid check (line_discount_minor between 0 and line_total_minor);

create table public.shop_sale_tenders (
  business_id uuid not null,
  sale_id uuid not null,
  tender_no smallint not null check (tender_no between 1 and 5),
  method text not null check (method in ('cash','mobile','card','credit')),
  amount_minor bigint not null check (amount_minor > 0),
  tendered_minor bigint not null,
  reference text check (reference is null or length(btrim(reference)) between 1 and 80),
  customer_id uuid,
  primary key (sale_id, tender_no),
  check (tendered_minor >= amount_minor),
  check (method = 'cash' or tendered_minor = amount_minor),
  check (method <> 'mobile' or reference is not null),
  check ((method = 'credit') = (customer_id is not null)),
  foreign key (business_id, sale_id) references public.shop_sales(business_id, id),
  foreign key (business_id, customer_id) references public.shop_customers(business_id, id)
);

create table public.shop_customer_entries (
  id bigint generated always as identity primary key,
  business_id uuid not null,
  customer_id uuid not null,
  kind text not null check (kind in ('credit_sale','repayment','refund')),
  amount_minor bigint not null check (amount_minor <> 0),
  balance_after_minor bigint not null check (balance_after_minor >= 0),
  sale_id uuid,
  refund_id uuid,
  repayment_key text check (repayment_key is null or repayment_key ~ '^[A-Za-z0-9_-]{16,64}$'),
  request_sha256 text check (request_sha256 is null or request_sha256 ~ '^[a-f0-9]{64}$'),
  method text check (method is null or method in ('cash','mobile','card')),
  reference text check (reference is null or length(btrim(reference)) between 1 and 80),
  store_id uuid,
  actor_id uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  unique (business_id, repayment_key),
  check ((kind = 'credit_sale') = (sale_id is not null and refund_id is null and amount_minor > 0)),
  check ((kind = 'refund') = (refund_id is not null and amount_minor < 0)),
  check ((kind = 'repayment') = (repayment_key is not null and request_sha256 is not null and method is not null and amount_minor < 0)),
  check (method <> 'mobile' or reference is not null),
  foreign key (business_id, customer_id) references public.shop_customers(business_id, id),
  foreign key (business_id, sale_id) references public.shop_sales(business_id, id),
  foreign key (business_id, refund_id) references public.shop_refunds(business_id, id),
  foreign key (business_id, store_id) references public.shop_stores(business_id, id)
);
create index shop_customer_entries_customer on public.shop_customer_entries (business_id, customer_id, id desc);

-- Payment summary now also describes split and credit sales.
alter table public.shop_payments
  drop constraint if exists shop_payments_method_check,
  drop constraint if exists shop_payments_check3,
  add constraint shop_payments_method_valid check (method in ('cash','mobile','card','credit','split')),
  add constraint shop_payments_change_only_cash check (change_minor = 0 or method in ('cash','split'));

-- Refunds record how much reduced a customer's debt; refund lines carry the
-- discounted amount actually paid.
alter table public.shop_refunds
  drop constraint if exists shop_refunds_method_check,
  add column credit_minor bigint not null default 0,
  add constraint shop_refunds_method_valid check (method in ('cash','mobile','card','credit')),
  add constraint shop_refunds_credit_valid check (credit_minor between 0 and amount_minor),
  add constraint shop_refunds_credit_method check ((method = 'credit') = (credit_minor = amount_minor));
alter table public.shop_refund_lines
  drop constraint if exists shop_refund_lines_check,
  add constraint shop_refund_lines_total_valid check (line_total_minor between 0 and quantity::bigint * unit_price_minor);

do $$
declare t text;
begin
  foreach t in array array['shop_customers','shop_member_permissions','shop_sale_tenders','shop_customer_entries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;
revoke all on sequence public.shop_customer_entries_id_seq from public, anon, authenticated;
create trigger shop_sale_tenders_append_only before update or delete on public.shop_sale_tenders
  for each row execute function private.shop_reject_history_change();
create trigger shop_customer_entries_append_only before update or delete on public.shop_customer_entries
  for each row execute function private.shop_reject_history_change();

-- ---------------------------------------------------------------- helpers
-- Session + membership check shared by the new operations. Returns the role.
create function private.shop_member_role(p_actor uuid, p_session uuid, p_company uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare v_owner uuid; v_role text;
begin
  if p_actor is null or p_session is null then
    raise exception 'Authenticated account required' using errcode = '42501';
  end if;
  perform 1 from auth.sessions s
    where s.id = p_session and s.user_id = p_actor and (s.not_after is null or s.not_after > clock_timestamp());
  if not found then raise exception 'Active Auth session required' using errcode = '42501'; end if;
  select b.owner_id into v_owner from public.businesses b where b.id = p_company;
  select m.role into v_role from public.business_members m where m.business_id = p_company and m.user_id = p_actor;
  if v_owner is null or v_role is null or (v_role = 'owner' and v_owner <> p_actor) then
    raise exception 'Business access denied' using errcode = '42501';
  end if;
  return v_role;
end $$;

-- What this person may do at the till. The owner may do everything.
create function private.shop_permissions(p_company uuid, p_actor uuid, p_role text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when p_role = 'owner'
    then jsonb_build_object('canDiscount', true, 'maxDiscountBps', 10000, 'canCredit', true)
    else coalesce((select jsonb_build_object('canDiscount', p.can_discount, 'maxDiscountBps', p.max_discount_bps, 'canCredit', p.can_credit)
      from public.shop_member_permissions p where p.business_id = p_company and p.user_id = p_actor),
      jsonb_build_object('canDiscount', false, 'maxDiscountBps', 0, 'canCredit', false)) end
$$;

create function private.shop_customer_json(p_customer uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone,
    'creditLimitMinor', c.credit_limit_minor, 'balanceMinor', c.balance_minor)
  from public.shop_customers c where c.id = p_customer
$$;

-- Receipts carry discount, tenders, customer and refunds' debt reduction.
create or replace function private.shop_receipt(p_sale uuid, p_replayed boolean) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'saleId', s.id, 'companyId', s.business_id, 'storeId', s.store_id, 'storeName', st.name,
    'cashierId', s.cashier_id, 'submissionKey', s.submission_key,
    'receiptNumber', s.receipt_number, 'currency', s.currency, 'totalMinor', s.total_minor,
    'subtotalMinor', coalesce(s.subtotal_minor, s.total_minor), 'discountMinor', s.discount_minor,
    'discountReason', s.discount_reason,
    'customer', case when s.customer_id is null then null else private.shop_customer_json(s.customer_id) end,
    'recordedAt', s.recorded_at, 'replayed', p_replayed,
    'payment', jsonb_build_object('method', p.method, 'amountDueMinor', p.amount_due_minor,
      'amountTenderedMinor', p.amount_tendered_minor, 'changeMinor', p.change_minor, 'reference', p.reference),
    'tenders', coalesce((select jsonb_agg(jsonb_build_object('method', t.method, 'amountMinor', t.amount_minor,
        'tenderedMinor', t.tendered_minor, 'reference', t.reference) order by t.tender_no)
      from public.shop_sale_tenders t where t.sale_id = s.id),
      jsonb_build_array(jsonb_build_object('method', p.method, 'amountMinor', p.amount_due_minor,
        'tenderedMinor', p.amount_tendered_minor, 'reference', p.reference))),
    'lines', (select jsonb_agg(jsonb_build_object('lineNo', l.line_no, 'productId', l.product_id, 'name', l.product_name,
        'quantity', l.quantity, 'unitPriceMinor', l.unit_price_minor, 'lineTotalMinor', l.line_total_minor,
        'lineDiscountMinor', l.line_discount_minor,
        'refundedQuantity', coalesce((select sum(rl.quantity) from public.shop_refund_lines rl
          where rl.sale_id = l.sale_id and rl.line_no = l.line_no), 0))
        order by l.line_no) from public.shop_sale_lines l where l.sale_id = s.id),
    'refundedMinor', coalesce((select sum(r.amount_minor) from public.shop_refunds r where r.sale_id = s.id), 0),
    'refunds', coalesce((select jsonb_agg(jsonb_build_object('refundId', r.id, 'refundNo', r.refund_no,
        'amountMinor', r.amount_minor, 'creditMinor', r.credit_minor, 'method', r.method,
        'returnedToStock', r.returned_to_stock, 'reason', r.reason, 'actorId', r.actor_id, 'recordedAt', r.recorded_at,
        'lines', (select jsonb_agg(jsonb_build_object('lineNo', rl.line_no, 'productId', rl.product_id,
            'quantity', rl.quantity, 'lineTotalMinor', rl.line_total_minor) order by rl.line_no)
          from public.shop_refund_lines rl where rl.refund_id = r.id)) order by r.refund_no)
      from public.shop_refunds r where r.sale_id = s.id), '[]'::jsonb))
  from public.shop_sales s
  join public.shop_payments p on p.sale_id = s.id
  join public.shop_stores st on st.id = s.store_id
  where s.id = p_sale
$$;

-- ---------------------------------------------------------------- sale
create function private.shop_record_sale(p_actor uuid, p_session uuid, p_input jsonb)
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
    select pr.name, pr.unit_price_minor into v_name, v_price
      from public.shop_products pr where pr.id = v_line.product_id and pr.business_id = v_company and pr.active;
    if not found then raise exception 'A product in this sale is no longer available' using errcode = '22023'; end if;
    select k.quantity into v_stock from public.shop_store_stock k
      where k.store_id = v_store and k.product_id = v_line.product_id for update;
    if coalesce(v_stock, 0) < v_line.qty then
      raise exception '% has only % left in this store', v_name, coalesce(v_stock, 0) using errcode = '23514';
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
    select pr.name, pr.unit_price_minor into v_name, v_price from public.shop_products pr where pr.id = v_line.product_id;
    insert into public.shop_sale_lines (business_id, sale_id, line_no, product_id, product_name, quantity,
        unit_price_minor, line_total_minor, line_discount_minor)
      values (v_company, v_sale, v_line_no, v_line.product_id, v_name, v_line.qty, v_price, v_line.qty::bigint * v_price,
        coalesce((v_alloc->>v_line.product_id::text)::bigint, 0));
    update public.shop_store_stock set quantity = quantity - v_line.qty, updated_at = at_time
      where store_id = v_store and product_id = v_line.product_id returning quantity into v_stock;
    insert into public.shop_stock_movements (business_id, store_id, product_id, delta, quantity_after,
        reason, sale_id, actor_id, recorded_at)
      values (v_company, v_store, v_line.product_id, -v_line.qty, v_stock, 'sale', v_sale, p_actor, at_time);
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

-- ---------------------------------------------------------------- refund
-- Owner only. Prices refunded units from what was actually paid (after
-- discount); a credit sale's refund reduces the customer's debt first.
create function private.shop_refund_sale(p_actor uuid, p_session uuid, p_input jsonb)
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
      amount_minor, credit_minor, returned_to_stock, reason, actor_id, recorded_at)
    values (v_refund, v_company, v_sale.id, v_no, p_input->>'refundKey', v_hash, v_method,
      v_amount, v_credit, v_restock, v_reason, p_actor, at_time);

  for v_item in select * from jsonb_array_elements(v_priced)
  loop
    insert into public.shop_refund_lines (business_id, refund_id, sale_id, line_no, product_id, quantity,
        unit_price_minor, line_total_minor)
      values (v_company, v_refund, v_sale.id, (v_item->>'lineNo')::int, (v_item->>'productId')::uuid,
        (v_item->>'quantity')::int, (v_item->>'unitPrice')::bigint, (v_item->>'amount')::bigint);
    if v_restock then
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

-- ---------------------------------------------------------------- customers, permissions, extra overview
create function private.shop_customer_action(p_action text, p_actor uuid, p_session uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  at_time timestamptz := clock_timestamp();
  v_company uuid;
  v_role text;
  v_perm jsonb;
  v_customer uuid;
  v_cust public.shop_customers;
  v_name text;
  v_phone text;
  v_limit bigint;
  v_amount bigint;
  v_method text;
  v_reference text;
  v_store uuid;
  v_hash text;
  v_entry public.shop_customer_entries;
  v_user uuid;
  v_bps integer;
begin
  if jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'Authenticated account required' using errcode = '42501';
  end if;
  v_company := private.shop_uuid(p_input, 'companyId');
  v_role := private.shop_member_role(p_actor, p_session, v_company);
  v_perm := private.shop_permissions(v_company, p_actor, v_role);

  if p_action = 'overviewExtra' then
    return jsonb_build_object(
      'myPermissions', v_perm,
      'memberPermissions', case when v_role = 'owner' then coalesce((select jsonb_object_agg(p.user_id::text,
          jsonb_build_object('canDiscount', p.can_discount, 'maxDiscountBps', p.max_discount_bps, 'canCredit', p.can_credit))
        from public.shop_member_permissions p where p.business_id = v_company), '{}'::jsonb) else '{}'::jsonb end,
      'customers', case when (v_perm->>'canCredit')::boolean then coalesce((select jsonb_agg(private.shop_customer_json(c.id)
          order by lower(c.name), c.id) from public.shop_customers c where c.business_id = v_company), '[]'::jsonb)
        else '[]'::jsonb end);
  end if;

  if p_action = 'setMemberPermissions' then
    if v_role <> 'owner' then raise exception 'Only the business owner can do this' using errcode = '42501'; end if;
    v_user := private.shop_uuid(p_input, 'userId');
    perform 1 from public.business_members where business_id = v_company and user_id = v_user and role = 'attendant';
    if not found then raise exception 'Only an attendant of this business can be given permissions' using errcode = '42501'; end if;
    if jsonb_typeof(p_input->'canDiscount') is distinct from 'boolean' or jsonb_typeof(p_input->'canCredit') is distinct from 'boolean' then
      raise exception 'Invalid permissions' using errcode = '22023';
    end if;
    v_bps := private.shop_int(p_input, 'maxDiscountBps', 0, 10000);
    insert into public.shop_member_permissions (business_id, user_id, can_discount, max_discount_bps, can_credit, updated_by, updated_at)
      values (v_company, v_user, (p_input->>'canDiscount')::boolean,
        case when (p_input->>'canDiscount')::boolean then v_bps else 0 end, (p_input->>'canCredit')::boolean, p_actor, at_time)
      on conflict (business_id, user_id) do update set can_discount = excluded.can_discount,
        max_discount_bps = excluded.max_discount_bps, can_credit = excluded.can_credit,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at;
    return jsonb_build_object('userId', v_user) || private.shop_permissions(v_company, v_user, 'attendant');
  end if;

  if not (v_perm->>'canCredit')::boolean then
    raise exception 'You are not allowed to manage customer credit. Ask the owner.' using errcode = '42501';
  end if;

  if p_action = 'saveCustomer' then
    v_customer := private.shop_uuid(p_input, 'customerId');
    v_name := btrim(regexp_replace(coalesce(p_input->>'name', ''), '\s+', ' ', 'g'));
    if length(v_name) not between 1 and 80 then raise exception 'Customer name must be 1 to 80 characters' using errcode = '22023'; end if;
    v_phone := nullif(btrim(regexp_replace(coalesce(p_input->>'phone', ''), '\s+', ' ', 'g')), '');
    if v_phone is not null and v_phone !~ '^\+?[0-9 ]{6,20}$' then raise exception 'Enter a valid phone number' using errcode = '22023'; end if;
    select * into v_cust from public.shop_customers where id = v_customer for update;
    if found and v_cust.business_id <> v_company then raise exception 'Customer not found' using errcode = '42501'; end if;
    if p_input ? 'creditLimitMinor' then
      if v_role <> 'owner' then raise exception 'Only the owner can set a credit limit' using errcode = '42501'; end if;
      v_limit := private.shop_int(p_input, 'creditLimitMinor', 0, 100000000000);
    else
      v_limit := coalesce(v_cust.credit_limit_minor, 0);
    end if;
    if v_cust.id is not null and v_role <> 'owner' and (v_cust.name <> v_name or v_cust.phone is distinct from v_phone) then
      raise exception 'Only the owner can change a customer' using errcode = '42501';
    end if;
    if v_phone is not null and exists (select 1 from public.shop_customers where business_id = v_company and phone = v_phone and id <> v_customer) then
      raise exception 'Another customer already uses that phone number' using errcode = '23505';
    end if;
    insert into public.shop_customers (id, business_id, name, phone, credit_limit_minor, created_by)
      values (v_customer, v_company, v_name, v_phone, v_limit, p_actor)
      on conflict (id) do update set name = excluded.name, phone = excluded.phone,
        credit_limit_minor = excluded.credit_limit_minor, updated_at = at_time;
    return private.shop_customer_json(v_customer);
  end if;

  if p_action = 'recordRepayment' then
    v_customer := private.shop_uuid(p_input, 'customerId');
    if (p_input->>'repaymentKey') is null or (p_input->>'repaymentKey') !~ '^[A-Za-z0-9_-]{16,64}$' then
      raise exception 'Invalid repaymentKey' using errcode = '22023';
    end if;
    v_amount := private.shop_int(p_input, 'amountMinor', 1, 100000000000);
    v_method := p_input->>'method';
    if v_method is null or v_method not in ('cash','mobile','card') then raise exception 'Choose a payment method' using errcode = '22023'; end if;
    v_reference := nullif(btrim(coalesce(p_input->>'reference', '')), '');
    if v_method = 'mobile' and v_reference is null then raise exception 'Enter the mobile money reference' using errcode = '22023'; end if;
    if v_reference is not null and length(v_reference) > 80 then raise exception 'Payment reference is too long' using errcode = '22023'; end if;
    v_store := case when p_input ? 'storeId' then private.shop_uuid(p_input, 'storeId') end;
    if v_store is not null and not exists (select 1 from public.shop_stores where id = v_store and business_id = v_company) then
      raise exception 'Store access denied' using errcode = '42501';
    end if;
    v_hash := encode(sha256(convert_to(jsonb_build_object('customerId', v_customer, 'amount', v_amount,
      'method', v_method, 'reference', v_reference, 'storeId', v_store)::text, 'UTF8')), 'hex');
    select * into v_cust from public.shop_customers where id = v_customer and business_id = v_company for update;
    if not found then raise exception 'Customer not found' using errcode = '42501'; end if;
    select * into v_entry from public.shop_customer_entries
      where business_id = v_company and repayment_key = p_input->>'repaymentKey';
    if found then
      if v_entry.request_sha256 <> v_hash or v_entry.actor_id <> p_actor then
        raise exception 'This repayment was already recorded with different details' using errcode = '23505';
      end if;
      return private.shop_customer_json(v_customer) || jsonb_build_object('replayed', true);
    end if;
    if v_amount > v_cust.balance_minor then
      raise exception '% only owes %', v_cust.name, v_cust.balance_minor using errcode = '23514';
    end if;
    update public.shop_customers set balance_minor = balance_minor - v_amount, updated_at = at_time
      where id = v_customer returning balance_minor into v_amount;
    insert into public.shop_customer_entries (business_id, customer_id, kind, amount_minor, balance_after_minor,
        repayment_key, request_sha256, method, reference, store_id, actor_id, recorded_at)
      values (v_company, v_customer, 'repayment', v_amount - v_cust.balance_minor, v_amount,
        p_input->>'repaymentKey', v_hash, v_method, v_reference, v_store, p_actor, at_time);
    return private.shop_customer_json(v_customer) || jsonb_build_object('replayed', false);
  end if;

  if p_action = 'customerStatement' then
    v_customer := private.shop_uuid(p_input, 'customerId');
    perform 1 from public.shop_customers where id = v_customer and business_id = v_company;
    if not found then raise exception 'Customer not found' using errcode = '42501'; end if;
    return private.shop_customer_json(v_customer) || jsonb_build_object('entries', coalesce((
      select jsonb_agg(jsonb_build_object('kind', e.kind, 'amountMinor', e.amount_minor, 'balanceAfterMinor', e.balance_after_minor,
        'receiptNumber', s.receipt_number, 'method', e.method, 'reference', e.reference, 'recordedAt', e.recorded_at) order by e.id desc)
      from (select * from public.shop_customer_entries where business_id = v_company and customer_id = v_customer
            order by id desc limit 100) e
      left join public.shop_sales s on s.id = e.sale_id), '[]'::jsonb));
  end if;

  raise exception 'Unrecognised shop action' using errcode = '42501';
end $fn$;

revoke all on function private.shop_member_role(uuid, uuid, uuid), private.shop_permissions(uuid, uuid, text),
  private.shop_customer_json(uuid), private.shop_record_sale(uuid, uuid, jsonb), private.shop_refund_sale(uuid, uuid, jsonb),
  private.shop_customer_action(text, uuid, uuid, jsonb) from public, anon, authenticated;

create or replace function public.tallybook_shop(p_action text, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $body$
declare
  actor uuid := auth.uid();
  sid uuid;
  v_result jsonb;
begin
  begin
    sid := (auth.jwt()->>'session_id')::uuid;
  exception when others then sid := null;
  end;
  if p_action = 'recordSale' then return private.shop_record_sale(actor, sid, p_input); end if;
  if p_action = 'refundSale' then return private.shop_refund_sale(actor, sid, p_input); end if;
  if p_action = 'importOpening' then return private.tallybook_shop_owner_action(p_action, actor, sid, p_input); end if;
  if p_action in ('saveCustomer', 'recordRepayment', 'customerStatement', 'setMemberPermissions') then
    return private.shop_customer_action(p_action, actor, sid, p_input);
  end if;
  v_result := private.tallybook_shop_action(p_action, actor, sid, p_input);
  if p_action = 'overview' then
    v_result := v_result || private.shop_customer_action('overviewExtra', actor, sid, p_input);
  end if;
  return v_result;
end $body$;
revoke all on function public.tallybook_shop(text, jsonb) from public, anon;
grant execute on function public.tallybook_shop(text, jsonb) to authenticated;

commit;
