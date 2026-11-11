-- Profit and margin for the shared shop (owner only).
--
-- Each sale line now remembers what the item cost when it was sold
-- (unit_cost_minor, from the product's cost at that moment), so changing a cost
-- later never rewrites past profit. Sales made before this have no snapshot and
-- are reported as "no cost recorded": profit and margin are worked out only on
-- the part of sales whose cost is known, and the rest is shown separately.
--
-- profitReport (read-only) for a day range and optionally one store:
--   net revenue (sales less refunds recorded in the range), the part with a
--   known cost, cost of goods (goods refunded back into stock give their cost
--   back; goods not restocked stay a cost), gross profit and margin on the
--   covered part, expenses (voided ones left out), net profit after expenses,
--   and the five products that earned most. Supplier payments are not an
--   expense (buying stock is not a cost until it is sold).
--
-- Rollback: supabase/rollback/20261111150000_shop_profit_report_down.sql
begin;

alter table public.shop_sale_lines add column unit_cost_minor bigint check (unit_cost_minor is null or unit_cost_minor >= 0);

-- Remember what the item cost when it was sold, so a later change of cost never
-- rewrites the profit of a sale already made. Sales before this have no snapshot.
create function private.shop_sale_line_cost() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.unit_cost_minor is null then
    select p.cost_minor into new.unit_cost_minor from public.shop_products p
      where p.id = new.product_id and p.business_id = new.business_id;
  end if;
  return new;
end $$;
revoke all on function private.shop_sale_line_cost() from public, anon, authenticated;
create trigger shop_sale_lines_cost before insert on public.shop_sale_lines
  for each row execute function private.shop_sale_line_cost();

create function private.shop_stage_n_profit_report(
  p_actor uuid, p_session uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_company uuid;
  v_role text;
  v_store uuid;
  v_from timestamptz;
  v_to timestamptz;
  v_rev_all numeric;
  v_rev_cov numeric;
  v_cogs numeric;
  v_ref_all numeric;
  v_ref_cov numeric;
  v_cogs_back numeric;
  v_expenses numeric;
  v_exp_count bigint;
  v_lines_all bigint;
  v_lines_cov bigint;
  v_cov_net numeric;
  v_gross numeric;
  v_top jsonb;
begin
  if jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'Valid request required' using errcode = '22023';
  end if;
  v_company := private.shop_uuid(p_input, 'companyId');
  v_role := private.shop_member_role(p_actor, p_session, v_company);
  if v_role <> 'owner' then raise exception 'Only the business owner can see profit' using errcode = '42501'; end if;

  if p_input ? 'storeId' and jsonb_typeof(p_input->'storeId') <> 'null' then
    v_store := private.shop_uuid(p_input, 'storeId');
    perform 1 from public.shop_stores where business_id = v_company and id = v_store;
    if not found then raise exception 'Store access denied' using errcode = '42501'; end if;
  end if;
  begin v_from := (p_input->>'from')::timestamptz; exception when others then raise exception 'Invalid from' using errcode = '22023'; end;
  begin v_to := (p_input->>'to')::timestamptz; exception when others then raise exception 'Invalid to' using errcode = '22023'; end;
  if v_from is null then raise exception 'Invalid from' using errcode = '22023'; end if;
  if v_to is null or v_to <= v_from or v_to - v_from > interval '93 days' then
    raise exception 'Invalid to' using errcode = '22023';
  end if;

  select coalesce(sum(l.line_total_minor - l.line_discount_minor), 0),
         coalesce(sum(l.line_total_minor - l.line_discount_minor) filter (where l.unit_cost_minor is not null), 0),
         coalesce(sum(l.quantity::numeric * l.unit_cost_minor) filter (where l.unit_cost_minor is not null), 0),
         count(*), count(*) filter (where l.unit_cost_minor is not null)
    into v_rev_all, v_rev_cov, v_cogs, v_lines_all, v_lines_cov
    from public.shop_sale_lines l join public.shop_sales s on s.id = l.sale_id and s.business_id = l.business_id
   where s.business_id = v_company and s.recorded_at >= v_from and s.recorded_at < v_to
     and (v_store is null or s.store_id = v_store);

  -- Refunds recorded in the range, whenever the sale was made. Goods put back in stock give their cost back.
  select coalesce(sum(rl.line_total_minor), 0),
         coalesce(sum(rl.line_total_minor) filter (where sl.unit_cost_minor is not null), 0),
         coalesce(sum(rl.quantity::numeric * sl.unit_cost_minor) filter (where r.returned_to_stock and sl.unit_cost_minor is not null), 0)
    into v_ref_all, v_ref_cov, v_cogs_back
    from public.shop_refund_lines rl
    join public.shop_refunds r on r.id = rl.refund_id and r.business_id = rl.business_id
    join public.shop_sales s on s.id = r.sale_id and s.business_id = r.business_id
    join public.shop_sale_lines sl on sl.sale_id = rl.sale_id and sl.line_no = rl.line_no
   where r.business_id = v_company and r.recorded_at >= v_from and r.recorded_at < v_to
     and (v_store is null or s.store_id = v_store);

  select coalesce(sum(x.amount_minor), 0), count(*) into v_expenses, v_exp_count
    from public.shop_expenses x
   where x.business_id = v_company and x.recorded_at >= v_from and x.recorded_at < v_to
     and (v_store is null or x.store_id = v_store)
     and not exists (select 1 from public.shop_expense_voids v where v.expense_id = x.id);

  select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'quantity', t.qty, 'revenueMinor', t.rev::text, 'profitMinor', t.profit::text)
           order by t.profit desc, t.name), '[]'::jsonb)
    into v_top
    from (select l.product_name as name, sum(l.quantity)::bigint as qty,
                 sum(l.line_total_minor - l.line_discount_minor) as rev,
                 sum(l.line_total_minor - l.line_discount_minor) - sum(l.quantity::numeric * l.unit_cost_minor) as profit
            from public.shop_sale_lines l join public.shop_sales s on s.id = l.sale_id and s.business_id = l.business_id
           where s.business_id = v_company and s.recorded_at >= v_from and s.recorded_at < v_to
             and (v_store is null or s.store_id = v_store) and l.unit_cost_minor is not null
           group by l.product_id, l.product_name
           order by sum(l.line_total_minor - l.line_discount_minor) - sum(l.quantity::numeric * l.unit_cost_minor) desc, l.product_name limit 5) t;

  v_cov_net := v_rev_cov - v_ref_cov;
  v_gross := v_cov_net - (v_cogs - v_cogs_back);
  return jsonb_build_object(
    'companyId', v_company, 'from', v_from, 'to', v_to, 'storeId', v_store,
    'netRevenueMinor', (v_rev_all - v_ref_all)::text,
    'coveredRevenueMinor', v_cov_net::text,
    'uncoveredRevenueMinor', ((v_rev_all - v_ref_all) - v_cov_net)::text,
    'costOfGoodsMinor', (v_cogs - v_cogs_back)::text,
    'grossProfitMinor', v_gross::text,
    'marginBps', case when v_cov_net > 0 then round(v_gross * 10000 / v_cov_net) else null end,
    'expenses', jsonb_build_object('count', v_exp_count, 'totalMinor', v_expenses::text),
    'netProfitMinor', (v_gross - v_expenses)::text,
    'saleLines', jsonb_build_object('total', v_lines_all, 'withCost', v_lines_cov),
    'topByProfit', v_top);
end $fn$;
revoke all on function private.shop_stage_n_profit_report(uuid, uuid, jsonb) from public, anon, authenticated;

-- Router: previous baseline (20261111140000) plus profitReport.
create or replace function public.tallybook_shop_ops(p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $body$
declare actor uuid:=auth.uid();sid uuid;
begin
  begin sid:=(auth.jwt()->>'session_id')::uuid;
  exception when others then sid:=null; end;
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
