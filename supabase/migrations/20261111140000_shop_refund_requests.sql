-- Refund requests: a cashier asks, the owner decides.
--
-- An attendant can ask for a refund on a sale they made (the whole sale or
-- some items, with a reason and whether the goods go back to stock). Nothing
-- moves until the owner approves; approving runs the existing refund, with all
-- its policy checks, in the same transaction, so a request is only ever
-- "approved" if the refund was posted. Declined and cancelled requests change
-- nothing. A request is kept as history; only its single decision is recorded.
-- At most one open request per sale and five per attendant.
--
-- Rollback: supabase/rollback/20261111140000_shop_refund_requests_down.sql
begin;

create table public.shop_refund_requests (
  id uuid primary key,
  business_id uuid not null references public.businesses(id),
  sale_id uuid not null references public.shop_sales(id),
  requested_by uuid not null references auth.users(id),
  lines jsonb,
  return_to_stock boolean not null,
  reason text not null check (length(reason) between 1 and 200),
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  created_at timestamptz not null default clock_timestamp(),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 200),
  check ((status = 'pending') = (decided_at is null))
);
create unique index shop_refund_requests_one_pending on public.shop_refund_requests (sale_id) where status = 'pending';
create index shop_refund_requests_business on public.shop_refund_requests (business_id, status, created_at desc);
alter table public.shop_refund_requests enable row level security;
alter table public.shop_refund_requests force row level security;
revoke all on table public.shop_refund_requests from public, anon, authenticated;

-- A request is a record of what was asked: only its decision may ever change, once.
create function private.shop_refund_request_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Refund requests are kept as history' using errcode = '23514'; end if;
  if old.status <> 'pending' then raise exception 'This request has already been decided' using errcode = '23514'; end if;
  if (new.id, new.business_id, new.sale_id, new.requested_by, new.lines, new.return_to_stock, new.reason, new.request_sha256, new.created_at)
     is distinct from (old.id, old.business_id, old.sale_id, old.requested_by, old.lines, old.return_to_stock, old.reason, old.request_sha256, old.created_at) then
    raise exception 'A refund request cannot be changed' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.shop_refund_request_guard() from public, anon, authenticated;
create trigger shop_refund_requests_guard before update or delete on public.shop_refund_requests
  for each row execute function private.shop_refund_request_guard();

create function private.shop_stage_m_refund_requests(
  p_action text, p_actor uuid, p_session uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_company uuid;
  v_role text;
  v_id uuid;
  v_sale public.shop_sales;
  v_req public.shop_refund_requests;
  v_lines jsonb;
  v_reason text;
  v_restock boolean := true;
  v_hash text;
  v_note text;
  v_line record;
  v_done integer;
  v_qty integer;
  v_receipt jsonb;
  v_status text;
begin
  if jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'Valid request required' using errcode = '22023';
  end if;
  v_company := private.shop_uuid(p_input, 'companyId');
  v_role := private.shop_member_role(p_actor, p_session, v_company);

  if p_action = 'myRefundRequests' or (p_action = 'listRefundRequests' and v_role <> 'owner') then
    if p_action = 'listRefundRequests' then raise exception 'Only the business owner can do this' using errcode = '42501'; end if;
    return jsonb_build_object('requests', coalesce((
      select jsonb_agg(jsonb_build_object('requestId', r.id, 'saleId', r.sale_id, 'receiptNumber', s.receipt_number, 'status', r.status,
          'reason', r.reason, 'lines', r.lines, 'returnToStock', r.return_to_stock, 'createdAt', r.created_at,
          'decidedAt', r.decided_at, 'decisionNote', r.decision_note, 'items', (select coalesce(jsonb_agg(jsonb_build_object('name', l.product_name, 'quantity', coalesce((e.q)::int, l.quantity)) order by l.line_no), '[]'::jsonb)
            from public.shop_sale_lines l
            left join lateral (select x->>'quantity' as q from jsonb_array_elements(coalesce(r.lines, '[]'::jsonb)) x where (x->>'lineNo')::int = l.line_no) e on true
           where l.sale_id = r.sale_id and (r.lines is null or e.q is not null))) order by r.created_at desc, r.id)
      from (select * from public.shop_refund_requests where business_id = v_company and requested_by = p_actor
            order by created_at desc, id limit 50) r
      join public.shop_sales s on s.id = r.sale_id), '[]'::jsonb));
  end if;

  if p_action = 'requestRefund' then
    v_id := private.shop_uuid(p_input, 'requestId');
    select * into v_sale from public.shop_sales where id = private.shop_uuid(p_input, 'saleId') and business_id = v_company;
    if not found or (v_role <> 'owner' and v_sale.cashier_id <> p_actor) then
      raise exception 'Sale not found' using errcode = '42501';
    end if;
    v_reason := btrim(coalesce(p_input->>'reason', ''));
    if length(v_reason) not between 1 and 200 then raise exception 'Say why this should be refunded' using errcode = '22023'; end if;
    if p_input ? 'returnToStock' then
      if jsonb_typeof(p_input->'returnToStock') <> 'boolean' then raise exception 'Invalid returnToStock' using errcode = '22023'; end if;
      v_restock := (p_input->>'returnToStock')::boolean;
    end if;
    if p_input ? 'lines' and jsonb_typeof(p_input->'lines') <> 'null' then
      if jsonb_typeof(p_input->'lines') <> 'array' or jsonb_array_length(p_input->'lines') not between 1 and 100 then
        raise exception 'Choose what to refund' using errcode = '22023';
      end if;
      select jsonb_agg(jsonb_build_object('lineNo', x.line_no, 'quantity', x.qty) order by x.line_no) into v_lines
        from (select private.shop_int(l, 'lineNo', 1, 100) as line_no, sum(private.shop_int(l, 'quantity', 1, 100000)) as qty
              from jsonb_array_elements(p_input->'lines') l group by 1) x;
      for v_line in select (e->>'lineNo')::int as line_no, (e->>'quantity')::int as qty from jsonb_array_elements(v_lines) e loop
        select coalesce(sum(rl.quantity), 0) into v_done from public.shop_refund_lines rl where rl.sale_id = v_sale.id and rl.line_no = v_line.line_no;
        select l.quantity into v_qty from public.shop_sale_lines l where l.sale_id = v_sale.id and l.line_no = v_line.line_no;
        if v_qty is null then raise exception 'That item is not on this sale' using errcode = '22023'; end if;
        if v_line.qty > v_qty - v_done then raise exception 'More than what is left to refund on that item' using errcode = '23514'; end if;
      end loop;
    end if;
    v_hash := encode(sha256(convert_to(jsonb_build_object('sale', v_sale.id, 'lines', v_lines, 'restock', v_restock, 'reason', v_reason)::text, 'UTF8')), 'hex');
    select * into v_req from public.shop_refund_requests where id = v_id;
    if found then
      if v_req.business_id <> v_company or v_req.request_sha256 <> v_hash or v_req.requested_by <> p_actor then
        raise exception 'This request was already sent with different details' using errcode = '23505';
      end if;
      return jsonb_build_object('requestId', v_id, 'status', v_req.status, 'replayed', true);
    end if;
    if exists (select 1 from public.shop_refund_requests where sale_id = v_sale.id and status = 'pending') then
      raise exception 'A refund request for this sale is already waiting for the owner' using errcode = '23505';
    end if;
    if (select count(*) from public.shop_refund_requests where business_id = v_company and requested_by = p_actor and status = 'pending') >= 5 then
      raise exception 'You already have 5 refund requests waiting. Wait for the owner to decide.' using errcode = '23514';
    end if;
    insert into public.shop_refund_requests (id, business_id, sale_id, requested_by, lines, return_to_stock, reason, request_sha256)
      values (v_id, v_company, v_sale.id, p_actor, v_lines, v_restock, v_reason, v_hash);
    return jsonb_build_object('requestId', v_id, 'status', 'pending', 'replayed', false);
  end if;

  if p_action = 'cancelRefundRequest' then
    v_id := private.shop_uuid(p_input, 'requestId');
    select * into v_req from public.shop_refund_requests where id = v_id and business_id = v_company and (v_role = 'owner' or requested_by = p_actor) for update;
    if not found then raise exception 'Refund request not found' using errcode = '42501'; end if;
    if v_req.status = 'cancelled' then return jsonb_build_object('requestId', v_id, 'status', 'cancelled', 'replayed', true); end if;
    if v_req.status <> 'pending' then raise exception 'The owner has already decided this request' using errcode = '23514'; end if;
    update public.shop_refund_requests set status = 'cancelled', decided_by = p_actor, decided_at = clock_timestamp() where id = v_id;
    return jsonb_build_object('requestId', v_id, 'status', 'cancelled', 'replayed', false);
  end if;

  if v_role <> 'owner' then raise exception 'Only the business owner can do this' using errcode = '42501'; end if;

  if p_action = 'listRefundRequests' then
    v_status := coalesce(p_input->>'status', 'pending');
    if v_status not in ('pending', 'approved', 'declined', 'cancelled', 'all') then raise exception 'Invalid status' using errcode = '22023'; end if;
    return jsonb_build_object('requests', coalesce((
      select jsonb_agg(jsonb_build_object('requestId', r.id, 'saleId', r.sale_id, 'receiptNumber', s.receipt_number, 'totalMinor', s.total_minor::text,
          'requestedBy', r.requested_by, 'status', r.status, 'reason', r.reason, 'lines', r.lines, 'returnToStock', r.return_to_stock,
          'createdAt', r.created_at, 'decidedAt', r.decided_at, 'decisionNote', r.decision_note, 'items', (select coalesce(jsonb_agg(jsonb_build_object('name', l.product_name, 'quantity', coalesce((e.q)::int, l.quantity)) order by l.line_no), '[]'::jsonb)
            from public.shop_sale_lines l
            left join lateral (select x->>'quantity' as q from jsonb_array_elements(coalesce(r.lines, '[]'::jsonb)) x where (x->>'lineNo')::int = l.line_no) e on true
           where l.sale_id = r.sale_id and (r.lines is null or e.q is not null))) order by r.created_at desc, r.id)
      from (select * from public.shop_refund_requests where business_id = v_company and (v_status = 'all' or status = v_status)
            order by created_at desc, id limit 50) r
      join public.shop_sales s on s.id = r.sale_id), '[]'::jsonb));
  end if;

  v_id := private.shop_uuid(p_input, 'requestId');
  perform 1 from public.shop_ledgers where business_id = v_company for update;
  select * into v_req from public.shop_refund_requests where id = v_id and business_id = v_company for update;
  if not found then raise exception 'Refund request not found' using errcode = '42501'; end if;

  if p_action = 'declineRefundRequest' then
    v_note := nullif(btrim(coalesce(p_input->>'note', '')), '');
    if v_note is not null and length(v_note) > 200 then raise exception 'Keep the note under 200 characters' using errcode = '22023'; end if;
    if v_req.status = 'declined' then return jsonb_build_object('requestId', v_id, 'status', 'declined', 'replayed', true); end if;
    if v_req.status <> 'pending' then raise exception 'This request has already been decided' using errcode = '23514'; end if;
    update public.shop_refund_requests set status = 'declined', decided_by = p_actor, decided_at = clock_timestamp(), decision_note = v_note where id = v_id;
    return jsonb_build_object('requestId', v_id, 'status', 'declined', 'replayed', false);
  end if;

  -- approveRefundRequest: the refund itself is the existing refund, in this same transaction.
  if v_req.status = 'approved' then return jsonb_build_object('requestId', v_id, 'status', 'approved', 'replayed', true); end if;
  if v_req.status <> 'pending' then raise exception 'This request has already been decided' using errcode = '23514'; end if;
  v_receipt := private.shop_refund_sale(p_actor, p_session, jsonb_build_object(
    'companyId', v_company, 'saleId', v_req.sale_id, 'refundKey', 'rr' || replace(v_id::text, '-', ''),
    'reason', v_req.reason, 'returnToStock', v_req.return_to_stock)
    || case when v_req.lines is null then '{}'::jsonb else jsonb_build_object('lines', v_req.lines) end);
  update public.shop_refund_requests set status = 'approved', decided_by = p_actor, decided_at = clock_timestamp() where id = v_id;
  return jsonb_build_object('requestId', v_id, 'status', 'approved', 'replayed', false, 'receipt', v_receipt);
end $fn$;
revoke all on function private.shop_stage_m_refund_requests(text, uuid, uuid, jsonb) from public, anon, authenticated;

-- Router: previous baseline (20261111130000) plus the refund-request actions.
create or replace function public.tallybook_shop_ops(p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $body$
declare actor uuid:=auth.uid();sid uuid;
begin
  begin sid:=(auth.jwt()->>'session_id')::uuid;
  exception when others then sid:=null; end;
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
