-- Quotations for the shared shop.
--
-- Anyone who sells can write a quotation: who it is for (a saved customer if
-- they may use them, or just a name), the items and quantities, and how long it
-- is good for. Prices are the shop's current prices, taken by the server, and
-- are kept on the quotation, so it shows what was offered even if prices change.
-- The owner sees every quotation; an attendant sees their own. A quotation can
-- be accepted, declined or cancelled, and is marked converted when it becomes a
-- sale. A quotation promises nothing and moves no stock or money. It is kept as
-- history: only its status moves, once it is closed it stays closed.
--
-- Rollback: supabase/rollback/20261111160000_shop_quotations_down.sql
begin;

create table public.shop_quotations (
  id uuid primary key,
  business_id uuid not null references public.businesses(id),
  quote_no integer not null check (quote_no >= 1),
  store_id uuid references public.shop_stores(id),
  customer_id uuid,
  customer_name text check (customer_name is null or length(customer_name) between 1 and 80),
  valid_until date not null,
  note text check (note is null or length(note) <= 240),
  total_minor bigint not null check (total_minor >= 0),
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'open' check (status in ('open', 'accepted', 'declined', 'cancelled', 'converted')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  sale_id uuid references public.shop_sales(id),
  unique (business_id, quote_no),
  foreign key (business_id, customer_id) references public.shop_customers(business_id, id),
  check (customer_id is not null or customer_name is not null),
  check ((status = 'open') = (decided_at is null)),
  check ((status = 'converted') = (sale_id is not null))
);
create index shop_quotations_business on public.shop_quotations (business_id, created_at desc);
create table public.shop_quotation_lines (
  quotation_id uuid not null references public.shop_quotations(id),
  line_no smallint not null check (line_no between 1 and 50),
  business_id uuid not null,
  product_id uuid not null,
  product_name text not null,
  quantity integer not null check (quantity between 1 and 100000),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  line_total_minor bigint not null check (line_total_minor = quantity::bigint * unit_price_minor),
  primary key (quotation_id, line_no),
  foreign key (business_id, product_id) references public.shop_products(business_id, id)
);
do $$
declare tbl text;
begin
  foreach tbl in array array['shop_quotations', 'shop_quotation_lines'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('alter table public.%I force row level security', tbl);
    execute format('revoke all on table public.%I from public, anon, authenticated', tbl);
  end loop;
end $$;
create trigger shop_quotation_lines_append_only before update or delete on public.shop_quotation_lines
  for each row execute function private.shop_reject_history_change();

-- A quotation is what was offered: only its status moves, forward, and never back out of a final one.
create function private.shop_quotation_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Quotations are kept as history' using errcode = '23514'; end if;
  if old.status in ('declined', 'cancelled', 'converted') then raise exception 'This quotation is already closed' using errcode = '23514'; end if;
  if (new.id, new.business_id, new.quote_no, new.store_id, new.customer_id, new.customer_name, new.valid_until, new.note, new.total_minor, new.request_sha256, new.created_by, new.created_at)
     is distinct from (old.id, old.business_id, old.quote_no, old.store_id, old.customer_id, old.customer_name, old.valid_until, old.note, old.total_minor, old.request_sha256, old.created_by, old.created_at) then
    raise exception 'A quotation cannot be changed' using errcode = '23514';
  end if;
  if old.status = 'accepted' and new.status = 'open' then raise exception 'A quotation cannot be reopened' using errcode = '23514'; end if;
  return new;
end $$;
revoke all on function private.shop_quotation_guard() from public, anon, authenticated;
create trigger shop_quotations_guard before update or delete on public.shop_quotations
  for each row execute function private.shop_quotation_guard();

create function private.shop_stage_o_quotations(
  p_action text, p_actor uuid, p_session uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_company uuid;
  v_role text;
  v_perm jsonb;
  v_id uuid;
  v_store uuid;
  v_customer uuid;
  v_name text;
  v_days integer := 14;
  v_note text;
  v_hash text;
  v_lines jsonb;
  v_line record;
  v_n integer := 0;
  v_total bigint := 0;
  v_no integer;
  v_q public.shop_quotations;
  v_prod record;
  v_decision text;
  v_sale public.shop_sales;
  v_status text;
begin
  if jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'Valid request required' using errcode = '22023';
  end if;
  v_company := private.shop_uuid(p_input, 'companyId');
  v_role := private.shop_member_role(p_actor, p_session, v_company);
  v_perm := private.shop_permissions(v_company, p_actor, v_role);

  if p_action = 'listQuotations' then
    v_status := coalesce(p_input->>'status', 'all');
    if v_status not in ('all', 'open', 'accepted', 'declined', 'cancelled', 'converted') then raise exception 'Invalid status' using errcode = '22023'; end if;
    return jsonb_build_object('quotations', coalesce((
      select jsonb_agg(jsonb_build_object('quotationId', q.id, 'quoteNo', q.quote_no, 'storeId', q.store_id, 'customerId', q.customer_id,
          'customerName', coalesce(q.customer_name, c.name), 'validUntil', q.valid_until, 'note', q.note, 'totalMinor', q.total_minor::text,
          'status', case when q.status in ('open', 'accepted') and q.valid_until < current_date then 'expired' else q.status end,
          'createdBy', q.created_by, 'createdAt', q.created_at, 'saleId', q.sale_id,
          'lines', (select jsonb_agg(jsonb_build_object('productId', l.product_id, 'name', l.product_name, 'quantity', l.quantity,
              'unitPriceMinor', l.unit_price_minor, 'lineTotalMinor', l.line_total_minor) order by l.line_no)
            from public.shop_quotation_lines l where l.quotation_id = q.id)) order by q.created_at desc, q.id)
      from (select * from public.shop_quotations where business_id = v_company
              and (v_role = 'owner' or created_by = p_actor) and (v_status = 'all' or status = v_status)
            order by created_at desc, id limit 50) q
      left join public.shop_customers c on c.business_id = q.business_id and c.id = q.customer_id), '[]'::jsonb));
  end if;

  if p_action = 'createQuotation' then
    v_id := private.shop_uuid(p_input, 'quotationId');
    if p_input ? 'storeId' and jsonb_typeof(p_input->'storeId') <> 'null' then
      v_store := private.shop_uuid(p_input, 'storeId');
      perform 1 from public.shop_stores where id = v_store and business_id = v_company and status = 'active';
      if not found then raise exception 'This store is not open' using errcode = '42501'; end if;
      if v_role <> 'owner' and not exists (select 1 from public.shop_store_assignments a where a.store_id = v_store and a.user_id = p_actor) then
        raise exception 'You are not assigned to this store' using errcode = '42501';
      end if;
    end if;
    if p_input ? 'customerId' and jsonb_typeof(p_input->'customerId') <> 'null' then
      v_customer := private.shop_uuid(p_input, 'customerId');
      if not (v_perm->>'canCredit')::boolean then raise exception 'You are not allowed to use saved customers. Type a name instead.' using errcode = '42501'; end if;
      perform 1 from public.shop_customers where id = v_customer and business_id = v_company;
      if not found then raise exception 'Customer not found' using errcode = '42501'; end if;
    end if;
    v_name := nullif(btrim(regexp_replace(coalesce(p_input->>'customerName', ''), '\s+', ' ', 'g')), '');
    if v_name is not null and length(v_name) > 80 then raise exception 'Customer name must be 1 to 80 characters' using errcode = '22023'; end if;
    if v_customer is null and v_name is null then raise exception 'Say who the quotation is for' using errcode = '22023'; end if;
    if p_input ? 'validDays' then v_days := private.shop_int(p_input, 'validDays', 1, 90)::integer; end if;
    v_note := nullif(btrim(coalesce(p_input->>'note', '')), '');
    if v_note is not null and length(v_note) > 240 then raise exception 'Keep the note under 240 characters' using errcode = '22023'; end if;
    if jsonb_typeof(p_input->'lines') is distinct from 'array' or jsonb_array_length(p_input->'lines') not between 1 and 50 then
      raise exception 'A quotation needs between 1 and 50 items' using errcode = '22023';
    end if;
    select jsonb_agg(jsonb_build_object('productId', x.product_id, 'quantity', x.qty) order by x.product_id) into v_lines
      from (select private.shop_uuid(l, 'productId') as product_id, sum(private.shop_int(l, 'quantity', 1, 100000)) as qty
            from jsonb_array_elements(p_input->'lines') l group by 1) x;
    v_hash := encode(sha256(convert_to(jsonb_build_object('store', v_store, 'customer', v_customer, 'name', v_name, 'days', v_days,
      'note', v_note, 'lines', v_lines)::text, 'UTF8')), 'hex');
    select * into v_q from public.shop_quotations where id = v_id;
    if found then
      if v_q.business_id <> v_company or v_q.created_by <> p_actor or v_q.request_sha256 <> v_hash then
        raise exception 'This quotation was already saved with different details' using errcode = '23505';
      end if;
      return jsonb_build_object('quotationId', v_id, 'quoteNo', v_q.quote_no, 'replayed', true);
    end if;
    perform 1 from public.shop_ledgers where business_id = v_company for update;
    if not found then raise exception 'The owner has not set up this shop yet' using errcode = '42501'; end if;
    select coalesce(max(quote_no), 0) + 1 into v_no from public.shop_quotations where business_id = v_company;
    for v_line in select (l->>'productId')::uuid as product_id, (l->>'quantity')::integer as qty from jsonb_array_elements(v_lines) l loop
      select pr.name, pr.unit_price_minor into v_prod from public.shop_products pr where pr.id = v_line.product_id and pr.business_id = v_company and pr.active;
      if not found then raise exception 'A product in this quotation is no longer available' using errcode = '22023'; end if;
      v_total := v_total + v_line.qty::bigint * v_prod.unit_price_minor;
    end loop;
    insert into public.shop_quotations (id, business_id, quote_no, store_id, customer_id, customer_name, valid_until, note, total_minor, request_sha256, created_by)
      values (v_id, v_company, v_no, v_store, v_customer, v_name, current_date + v_days, v_note, v_total, v_hash, p_actor);
    -- Lines keep the order the person wrote them in (the sorted copy above is only for the retry check).
    for v_line in select x.product_id, x.qty from (select (l->>'productId')::uuid as product_id, (l->>'quantity')::integer as qty from jsonb_array_elements(v_lines) l) x
        order by (select min(o.ord) from jsonb_array_elements(p_input->'lines') with ordinality o(e, ord) where (o.e->>'productId')::uuid = x.product_id) loop
      v_n := v_n + 1;
      select pr.name, pr.unit_price_minor into v_prod from public.shop_products pr where pr.id = v_line.product_id;
      insert into public.shop_quotation_lines (quotation_id, line_no, business_id, product_id, product_name, quantity, unit_price_minor, line_total_minor)
        values (v_id, v_n, v_company, v_line.product_id, v_prod.name, v_line.qty, v_prod.unit_price_minor, v_line.qty::bigint * v_prod.unit_price_minor);
    end loop;
    return jsonb_build_object('quotationId', v_id, 'quoteNo', v_no, 'totalMinor', v_total::text, 'validUntil', current_date + v_days, 'replayed', false);
  end if;

  -- decideQuotation, convertQuotation
  v_id := private.shop_uuid(p_input, 'quotationId');
  select * into v_q from public.shop_quotations where id = v_id and business_id = v_company and (v_role = 'owner' or created_by = p_actor) for update;
  if not found then raise exception 'Quotation not found' using errcode = '42501'; end if;

  if p_action = 'decideQuotation' then
    v_decision := p_input->>'decision';
    if v_decision is null or v_decision not in ('accepted', 'declined', 'cancelled') then raise exception 'Invalid decision' using errcode = '22023'; end if;
    if v_q.status = v_decision then return jsonb_build_object('quotationId', v_id, 'status', v_decision, 'replayed', true); end if;
    if v_q.status not in ('open', 'accepted') or (v_q.status = 'accepted' and v_decision = 'declined') then
      raise exception 'This quotation can no longer be changed' using errcode = '23514';
    end if;
    if v_decision = 'accepted' and v_q.valid_until < current_date then raise exception 'This quotation has expired' using errcode = '23514'; end if;
    update public.shop_quotations set status = v_decision, decided_by = p_actor, decided_at = clock_timestamp() where id = v_id;
    return jsonb_build_object('quotationId', v_id, 'status', v_decision, 'replayed', false);
  end if;

  if p_action = 'convertQuotation' then
    select * into v_sale from public.shop_sales where id = private.shop_uuid(p_input, 'saleId') and business_id = v_company;
    if not found or (v_role <> 'owner' and v_sale.cashier_id <> p_actor) then raise exception 'Sale not found' using errcode = '42501'; end if;
    if v_q.status = 'converted' then
      if v_q.sale_id <> v_sale.id then raise exception 'This quotation was already turned into a different sale' using errcode = '23505'; end if;
      return jsonb_build_object('quotationId', v_id, 'status', 'converted', 'replayed', true);
    end if;
    if v_q.status not in ('open', 'accepted') then raise exception 'This quotation is closed' using errcode = '23514'; end if;
    if v_q.valid_until < current_date then raise exception 'This quotation has expired' using errcode = '23514'; end if;
    update public.shop_quotations set status = 'converted', sale_id = v_sale.id, decided_by = p_actor, decided_at = clock_timestamp() where id = v_id;
    return jsonb_build_object('quotationId', v_id, 'status', 'converted', 'replayed', false);
  end if;
  raise exception 'Unknown quotation action' using errcode = '22023';
end $fn$;
revoke all on function private.shop_stage_o_quotations(text, uuid, uuid, jsonb) from public, anon, authenticated;

-- Router: previous baseline (20261111150000) plus the quotation actions.
create or replace function public.tallybook_shop_ops(p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $body$
declare actor uuid:=auth.uid();sid uuid;
begin
  begin sid:=(auth.jwt()->>'session_id')::uuid;
  exception when others then sid:=null; end;
  if p_action in ('createQuotation','listQuotations','decideQuotation','convertQuotation') then
    return private.shop_stage_o_quotations(p_action,actor,sid,p_input);
  end if;
  if p_action='profitReport' then
    return private.shop_stage_n_profit_report(actor,sid,p_input);
  end if;
  if p_action in ('requestRefund','myRefundRequests','cancelRefundRequest','listRefundRequests',
      'declineRefundRequest','approveRefundRequest') then
    return private.shop_stage_m_refund_requests(p_action,actor,sid,p_input);
  end if;
  if p_action in ('recordExpense','voidExpense','listExpenses') then
    return private.shop_stage_l_expenses(p_action,actor,sid,p_input);
  end if;
  if p_action in ('joinWithCode','createJoinCode','listJoinCodes','revokeJoinCode') then
    return private.shop_stage_k_join_code(p_action,actor,sid,p_input);
  end if;
  if p_action in ('archiveCustomer','unarchiveCustomer','archivedCustomers') then
    return private.shop_stage_j_customer_admin(p_action,actor,sid,p_input);
  end if;
  if p_action in ('stockAccess','setStockAccess','receivableOrders','listStockCounts','startStockCount',
      'applyStockCount','cancelStockCount','receivePurchase') then
    return private.shop_stage_i_attendant_stock(p_action,actor,sid,p_input);
  end if;
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

commit;
