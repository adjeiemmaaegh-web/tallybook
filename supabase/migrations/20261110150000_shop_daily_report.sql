-- Daily / end-of-day report for the shared shop: one read-only action,
-- dailyReport, for any day range up to 93 days.
--
-- For the range and (optionally) one store it returns sales count, gross and
-- discounts; money by payment method at the till; refunds recorded in the
-- range (whichever day the sale was made) with the cash that actually went
-- out; customer repayments by method; supplier payments (owners only); the
-- five best-selling products; sales per cashier (owners only); and the cash
-- that should be in the till: cash taken less cash paid out.
--
-- Same role rules as searchSales: an owner sees the whole business, an
-- attendant only their own sales and repayments, and never supplier data.
-- Amounts are returned as text so large totals stay exact. Nothing is written.
--
-- Rollback: supabase/rollback/20261110150000_shop_daily_report_down.sql
begin;

create function private.shop_stage_h_daily_report(
  p_actor uuid, p_session uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_company uuid;
  v_role text;
  v_store uuid;
  v_from timestamptz;
  v_to timestamptz;
  v_ids uuid[];
  v_sales jsonb;
  v_methods jsonb;
  v_repay jsonb;
  v_refunds jsonb;
  v_supplier jsonb := '{"cash":"0","mobile":"0","card":"0","bank":"0"}'::jsonb;
  v_top jsonb;
  v_cashiers jsonb := '[]'::jsonb;
  v_outstanding numeric;
  v_cash_in numeric;
  v_cash_out numeric;
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
    v_from := (p_input->>'from')::timestamptz;
  exception when others then raise exception 'Invalid from' using errcode = '22023'; end;
  begin
    v_to := (p_input->>'to')::timestamptz;
  exception when others then raise exception 'Invalid to' using errcode = '22023'; end;
  if v_from is null then raise exception 'Invalid from' using errcode = '22023'; end if;
  if v_to is null or v_to <= v_from or v_to - v_from > interval '93 days' then
    raise exception 'Invalid to' using errcode = '22023';
  end if;

  -- Sales in range (an attendant sees only their own).
  select coalesce(array_agg(s.id), '{}'::uuid[]) into v_ids
    from public.shop_sales s
   where s.business_id = v_company
     and (v_role = 'owner' or s.cashier_id = p_actor)
     and (v_store is null or s.store_id = v_store)
     and s.recorded_at >= v_from and s.recorded_at < v_to;

  select jsonb_build_object('count', count(*), 'grossMinor', coalesce(sum(total_minor), 0)::text,
           'discountMinor', coalesce(sum(discount_minor), 0)::text)
    into v_sales from public.shop_sales where id = any(v_ids);

  -- Where the money came from at the till. A sale made before split payments
  -- existed has no tender rows and is read from its single payment instead.
  select jsonb_build_object(
      'cash', coalesce(sum(amt) filter (where method = 'cash'), 0)::text,
      'mobile', coalesce(sum(amt) filter (where method = 'mobile'), 0)::text,
      'card', coalesce(sum(amt) filter (where method = 'card'), 0)::text,
      'credit', coalesce(sum(amt) filter (where method = 'credit'), 0)::text)
    into v_methods
    from (
      select t.method, t.amount_minor as amt from public.shop_sale_tenders t where t.sale_id = any(v_ids)
      union all
      select p.method, p.amount_due_minor from public.shop_payments p
       where p.sale_id = any(v_ids) and p.method in ('cash', 'mobile', 'card')
         and not exists (select 1 from public.shop_sale_tenders t where t.sale_id = p.sale_id)
    ) x;

  -- Refunds recorded in range, whichever day the sale was made. Money out is
  -- the refund less the part that only reduced what a customer owed.
  select jsonb_build_object(
      'count', count(*), 'totalMinor', coalesce(sum(r.amount_minor), 0)::text,
      'cash', coalesce(sum(r.amount_minor - r.credit_minor) filter (where r.method = 'cash'), 0)::text,
      'mobile', coalesce(sum(r.amount_minor - r.credit_minor) filter (where r.method = 'mobile'), 0)::text,
      'card', coalesce(sum(r.amount_minor - r.credit_minor) filter (where r.method = 'card'), 0)::text,
      'creditReducedMinor', coalesce(sum(r.credit_minor), 0)::text)
    into v_refunds
    from public.shop_refunds r
    join public.shop_sales rs on rs.id = r.sale_id and rs.business_id = r.business_id
   where r.business_id = v_company
     and r.recorded_at >= v_from and r.recorded_at < v_to
     and (v_role = 'owner' or rs.cashier_id = p_actor)
     and (v_store is null or rs.store_id = v_store);

  -- Customer repayments taken in range.
  select jsonb_build_object(
      'count', count(*), 'totalMinor', coalesce(sum(-e.amount_minor), 0)::text,
      'cash', coalesce(sum(-e.amount_minor) filter (where e.method = 'cash'), 0)::text,
      'mobile', coalesce(sum(-e.amount_minor) filter (where e.method = 'mobile'), 0)::text,
      'card', coalesce(sum(-e.amount_minor) filter (where e.method = 'card'), 0)::text)
    into v_repay
    from public.shop_customer_entries e
   where e.business_id = v_company and e.kind = 'repayment'
     and e.recorded_at >= v_from and e.recorded_at < v_to
     and (v_role = 'owner' or e.actor_id = p_actor)
     and (v_store is null or e.store_id = v_store);

  select coalesce(jsonb_agg(jsonb_build_object('name', x.product_name, 'quantity', x.qty, 'revenueMinor', x.revenue::text)
           order by x.revenue desc, x.product_name), '[]'::jsonb)
    into v_top
    from (select l.product_name, sum(l.quantity)::bigint as qty, sum(l.line_total_minor - l.line_discount_minor) as revenue
            from public.shop_sale_lines l where l.sale_id = any(v_ids)
           group by l.product_id, l.product_name
           order by sum(l.line_total_minor - l.line_discount_minor) desc, l.product_name limit 5) x;

  if v_role = 'owner' then
    select jsonb_build_object(
        'cash', coalesce(sum(m.amount_minor) filter (where m.method = 'cash'), 0)::text,
        'mobile', coalesce(sum(m.amount_minor) filter (where m.method = 'mobile'), 0)::text,
        'card', coalesce(sum(m.amount_minor) filter (where m.method = 'card'), 0)::text,
        'bank', coalesce(sum(m.amount_minor) filter (where m.method = 'bank'), 0)::text)
      into v_supplier
      from public.shop_supplier_settlements m
     where m.business_id = v_company and m.recorded_at >= v_from and m.recorded_at < v_to;

    select coalesce(jsonb_agg(jsonb_build_object('cashierId', c.cashier_id, 'count', c.n, 'grossMinor', c.gross::text)
             order by c.gross desc, c.cashier_id), '[]'::jsonb)
      into v_cashiers
      from (select cashier_id, count(*) as n, sum(total_minor) as gross from public.shop_sales where id = any(v_ids) group by cashier_id) c;

    select coalesce(sum(balance_minor), 0) into v_outstanding from public.shop_customers where business_id = v_company;
  end if;

  -- Cash that should be in the till for this period: cash taken (sales and
  -- repayments) less cash paid out (refunds and, for owners, supplier payments).
  v_cash_in := (v_methods->>'cash')::numeric + (v_repay->>'cash')::numeric;
  v_cash_out := (v_refunds->>'cash')::numeric + (v_supplier->>'cash')::numeric;

  return jsonb_build_object(
    'companyId', v_company, 'role', v_role, 'from', v_from, 'to', v_to, 'storeId', v_store,
    'sales', v_sales, 'byMethod', v_methods, 'refunds', v_refunds, 'repayments', v_repay,
    'supplierPayments', v_supplier, 'topProducts', v_top, 'byCashier', v_cashiers,
    'cashTakenMinor', v_cash_in::text, 'cashPaidOutMinor', v_cash_out::text,
    'cashExpectedMinor', (v_cash_in - v_cash_out)::text,
    'customerCreditOutstandingMinor', case when v_role = 'owner' then v_outstanding::text else null end);
end $fn$;

revoke all on function private.shop_stage_h_daily_report(uuid, uuid, jsonb)
  from public, anon, authenticated;

-- Router: the previous baseline (20261110140000) plus the new read action.
create or replace function public.tallybook_shop_ops(p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $body$
declare actor uuid:=auth.uid();sid uuid;
begin
  begin sid:=(auth.jwt()->>'session_id')::uuid;
  exception when others then sid:=null; end;
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
