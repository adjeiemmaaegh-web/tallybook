-- Sales search for the shared shop: filter by day range, store, payment type
-- and free text (receipt number, customer name, or - for owners - cashier
-- email), with newest-first paging.
--
-- Additive and read-only. The existing `listSales` action (latest 50, no
-- filters) is untouched, so older app versions keep working. Role rules match
-- listSales: an owner sees every sale of the company, an attendant only the
-- sales they rang up themselves.
--
-- "payment" describes how the sale was PAID at the till, not what is still
-- owed today (a customer's balance is tracked per customer, not per sale):
--   paid    - no part of the sale went on credit
--   partial - part on credit, part paid
--   credit  - the whole sale went on credit
-- "refunded" is a separate filter: the sale has at least one refund.
--
-- Rollback: supabase/rollback/20261110130000_shop_sales_search_down.sql
begin;

create function private.shop_stage_f_sales_search(
  p_actor uuid, p_session uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_company uuid;
  v_role text;
  v_store uuid;
  v_from timestamptz;
  v_to timestamptz;
  v_status text;
  v_q text;
  v_no bigint;
  v_like text;
  v_limit int := 25;
  v_before_at timestamptz;
  v_before_no bigint;
  v_ids uuid[];
  v_count bigint;
  v_gross numeric;
  v_refunded numeric;
  v_has_more boolean;
  v_next jsonb;
  v_sales jsonb;
begin
  if jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'Valid request required' using errcode = '22023';
  end if;
  v_company := private.shop_uuid(p_input, 'companyId');
  v_role := private.shop_member_role(p_actor, p_session, v_company);

  if p_input ? 'storeId' and jsonb_typeof(p_input->'storeId') <> 'null' then
    v_store := private.shop_uuid(p_input, 'storeId');
    perform 1 from public.shop_stores where business_id = v_company and id = v_store;
    if not found then raise exception 'Store access denied' using errcode = '42501'; end if;
    if v_role <> 'owner' and not exists (
      select 1 from public.shop_store_assignments
        where business_id = v_company and store_id = v_store and user_id = p_actor)
    then raise exception 'Store access denied' using errcode = '42501'; end if;
  end if;

  begin
    if p_input ? 'from' and jsonb_typeof(p_input->'from') = 'string' then v_from := (p_input->>'from')::timestamptz; end if;
  exception when others then raise exception 'Invalid from' using errcode = '22023'; end;
  begin
    if p_input ? 'to' and jsonb_typeof(p_input->'to') = 'string' then v_to := (p_input->>'to')::timestamptz; end if;
  exception when others then raise exception 'Invalid to' using errcode = '22023'; end;
  if v_from is not null and v_to is not null and v_to <= v_from then
    raise exception 'Invalid to' using errcode = '22023';
  end if;

  if p_input ? 'payment' and jsonb_typeof(p_input->'payment') = 'string' then
    v_status := p_input->>'payment';
    if v_status not in ('paid', 'partial', 'credit', 'refunded') then
      raise exception 'Invalid payment' using errcode = '22023';
    end if;
  end if;

  if p_input ? 'q' and jsonb_typeof(p_input->'q') = 'string' then
    v_q := btrim(p_input->>'q');
    if length(v_q) > 60 then raise exception 'Invalid q' using errcode = '22023'; end if;
    if v_q = '' then
      v_q := null;
    elsif v_q ~ '^#?[0-9]{1,12}$' then
      v_no := ltrim(v_q, '#')::bigint;
    else
      -- Escape LIKE wildcards so a search for "50%" matches the text, not everything.
      v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    end if;
  end if;

  if p_input ? 'limit' and jsonb_typeof(p_input->'limit') = 'number' then
    v_limit := private.shop_int(p_input, 'limit', 1, 50)::int;
  end if;

  if p_input ? 'beforeRecordedAt' or p_input ? 'beforeReceiptNumber' then
    begin
      v_before_at := (p_input->>'beforeRecordedAt')::timestamptz;
      v_before_no := private.shop_int(p_input, 'beforeReceiptNumber', 1, 9007199254740991);
    exception when others then raise exception 'Invalid cursor' using errcode = '22023'; end;
    if v_before_at is null then raise exception 'Invalid cursor' using errcode = '22023'; end if;
  end if;

  with f as (
    select s.id, s.recorded_at, s.receipt_number, s.total_minor,
           coalesce((select sum(r.amount_minor) from public.shop_refunds r where r.sale_id = s.id), 0) as refunded_minor
      from public.shop_sales s
      left join public.shop_customers c on c.business_id = s.business_id and c.id = s.customer_id
     where s.business_id = v_company
       and (v_role = 'owner' or s.cashier_id = p_actor)
       and (v_store is null or s.store_id = v_store)
       and (v_from is null or s.recorded_at >= v_from)
       and (v_to is null or s.recorded_at < v_to)
       and (v_no is null or s.receipt_number = v_no)
       and (v_like is null
            or c.name ilike v_like escape '\'
            or (v_role = 'owner' and exists (
                  select 1 from auth.users u where u.id = s.cashier_id and u.email ilike v_like escape '\')))
       and (v_status is null
            or (v_status = 'refunded' and exists (select 1 from public.shop_refunds r where r.sale_id = s.id))
            or (v_status in ('paid', 'partial', 'credit') and v_status = (
                  select case
                    when coalesce(sum(t.amount_minor) filter (where t.method = 'credit'), 0) = 0 then 'paid'
                    when coalesce(sum(t.amount_minor) filter (where t.method = 'credit'), 0) >= s.total_minor then 'credit'
                    else 'partial' end
                    from public.shop_sale_tenders t where t.sale_id = s.id)))
  ), totals as (
    select count(*) as n, coalesce(sum(total_minor), 0) as gross, coalesce(sum(refunded_minor), 0) as refunded from f
  ), page as (
    select f.id, f.recorded_at, f.receipt_number from f
     where v_before_at is null or (f.recorded_at, f.receipt_number) < (v_before_at, v_before_no)
     order by f.recorded_at desc, f.receipt_number desc
     limit v_limit + 1
  )
  select (select array_agg(p.id order by p.recorded_at desc, p.receipt_number desc) from page p),
         t.n, t.gross, t.refunded
    into v_ids, v_count, v_gross, v_refunded
    from totals t;

  v_has_more := coalesce(array_length(v_ids, 1), 0) > v_limit;
  if v_has_more then
    select jsonb_build_object('recordedAt', s.recorded_at, 'receiptNumber', s.receipt_number)
      into v_next from public.shop_sales s where s.id = v_ids[v_limit];
  end if;

  select coalesce(jsonb_agg(private.shop_receipt(x.i, false) order by x.ord), '[]'::jsonb)
    into v_sales
    from unnest(coalesce(v_ids[1:v_limit], '{}'::uuid[])) with ordinality as x(i, ord);

  return jsonb_build_object(
    'companyId', v_company, 'role', v_role, 'sales', v_sales,
    'hasMore', v_has_more, 'next', v_next,
    -- Totals cover every match for the filters (not only this page).
    'matchCount', v_count, 'grossMinor', v_gross::text, 'refundedMinor', v_refunded::text);
end $fn$;

revoke all on function private.shop_stage_f_sales_search(uuid, uuid, jsonb)
  from public, anon, authenticated;

-- Router: the previous baseline (20261109010000) plus the new read action.
create or replace function public.tallybook_shop_ops(p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $body$
declare actor uuid:=auth.uid();sid uuid;
begin
  begin sid:=(auth.jwt()->>'session_id')::uuid;
  exception when others then sid:=null; end;
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
