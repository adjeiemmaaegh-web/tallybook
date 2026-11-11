-- Expenses for the shared shop: money spent running the business.
--
-- Owner-only. An expense is an append-only record (category, amount, how it
-- was paid, date, optional store and note); it is cancelled with a recorded
-- reason, never edited or deleted. The daily report now includes expenses
-- (voided ones left out) and treats cash expenses as cash that left the till.
-- Expenses never touch stock, sales, customers or suppliers. Nothing here
-- calculates profit.
--
-- Rollback: supabase/rollback/20261111130000_shop_expenses_down.sql
begin;

create table public.shop_expenses (
  id uuid primary key,
  business_id uuid not null references public.businesses(id),
  store_id uuid references public.shop_stores(id),
  category text not null check (category in ('transport', 'rent', 'utilities', 'supplies', 'repairs', 'salaries', 'other')),
  amount_minor bigint not null check (amount_minor between 1 and 100000000000),
  method text not null check (method in ('cash', 'mobile', 'card', 'bank')),
  expense_date date not null,
  note text check (note is null or length(note) <= 240),
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default clock_timestamp()
);
create index shop_expenses_business_time on public.shop_expenses (business_id, recorded_at desc);
create table public.shop_expense_voids (
  expense_id uuid primary key references public.shop_expenses(id),
  business_id uuid not null,
  reason text not null check (length(reason) between 4 and 200),
  voided_by uuid not null references auth.users(id),
  voided_at timestamptz not null default clock_timestamp()
);
do $$
declare tbl text;
begin
  foreach tbl in array array['shop_expenses', 'shop_expense_voids'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('alter table public.%I force row level security', tbl);
    execute format('revoke all on table public.%I from public, anon, authenticated', tbl);
    execute format('create trigger %I before update or delete on public.%I for each row execute function private.shop_reject_history_change()', tbl || '_append_only', tbl);
  end loop;
end $$;

create function private.shop_stage_l_expenses(
  p_action text, p_actor uuid, p_session uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_company uuid;
  v_role text;
  v_id uuid;
  v_store uuid;
  v_category text;
  v_amount bigint;
  v_method text;
  v_date date;
  v_note text;
  v_hash text;
  v_row public.shop_expenses;
  v_reason text;
  v_from timestamptz;
  v_to timestamptz;
begin
  if jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'Valid request required' using errcode = '22023';
  end if;
  v_company := private.shop_uuid(p_input, 'companyId');
  v_role := private.shop_member_role(p_actor, p_session, v_company);
  if v_role <> 'owner' then raise exception 'Only the business owner can record expenses' using errcode = '42501'; end if;

  if p_action = 'listExpenses' then
    if p_input ? 'from' and jsonb_typeof(p_input->'from') <> 'null' then
      begin v_from := (p_input->>'from')::timestamptz; exception when others then raise exception 'Invalid from' using errcode = '22023'; end;
    end if;
    if p_input ? 'to' and jsonb_typeof(p_input->'to') <> 'null' then
      begin v_to := (p_input->>'to')::timestamptz; exception when others then raise exception 'Invalid to' using errcode = '22023'; end;
    end if;
    if p_input ? 'storeId' and jsonb_typeof(p_input->'storeId') <> 'null' then v_store := private.shop_uuid(p_input, 'storeId'); end if;
    return jsonb_build_object('expenses', coalesce((
      select jsonb_agg(jsonb_build_object('expenseId', x.id, 'storeId', x.store_id, 'category', x.category,
          'amountMinor', x.amount_minor::text, 'method', x.method, 'expenseDate', x.expense_date, 'note', x.note,
          'recordedBy', x.recorded_by, 'recordedAt', x.recorded_at,
          'voided', v.expense_id is not null, 'voidReason', v.reason) order by x.recorded_at desc, x.id)
      from (select * from public.shop_expenses e where e.business_id = v_company
              and (v_from is null or e.recorded_at >= v_from) and (v_to is null or e.recorded_at < v_to)
              and (v_store is null or e.store_id = v_store)
            order by e.recorded_at desc, e.id limit 100) x
      left join public.shop_expense_voids v on v.expense_id = x.id), '[]'::jsonb));
  end if;

  perform 1 from public.shop_ledgers where business_id = v_company for update;
  if not found then raise exception 'Set up this shop before recording expenses' using errcode = '42501'; end if;

  if p_action = 'voidExpense' then
    v_id := private.shop_uuid(p_input, 'expenseId');
    v_reason := btrim(coalesce(p_input->>'reason', ''));
    if length(v_reason) not between 4 and 200 then raise exception 'Say why this expense is being cancelled' using errcode = '22023'; end if;
    perform 1 from public.shop_expenses where id = v_id and business_id = v_company;
    if not found then raise exception 'Expense not found' using errcode = '42501'; end if;
    insert into public.shop_expense_voids (expense_id, business_id, reason, voided_by)
      values (v_id, v_company, v_reason, p_actor) on conflict do nothing;
    return jsonb_build_object('expenseId', v_id, 'voided', true);
  end if;

  -- recordExpense
  v_id := private.shop_uuid(p_input, 'expenseId');
  v_category := p_input->>'category';
  if v_category is null or v_category not in ('transport', 'rent', 'utilities', 'supplies', 'repairs', 'salaries', 'other') then
    raise exception 'Choose an expense category' using errcode = '22023';
  end if;
  v_amount := private.shop_int(p_input, 'amountMinor', 1, 100000000000);
  v_method := p_input->>'method';
  if v_method is null or v_method not in ('cash', 'mobile', 'card', 'bank') then
    raise exception 'Choose how it was paid' using errcode = '22023';
  end if;
  if coalesce(p_input->>'expenseDate', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Choose the date you spent this money' using errcode = '22023'; end if;
  begin v_date := (p_input->>'expenseDate')::date; exception when others then raise exception 'Choose the date you spent this money' using errcode = '22023'; end;
  if v_date is null or v_date > current_date + 1 or v_date < current_date - 366 then
    raise exception 'Choose a date within the last year, no later than today' using errcode = '22023';
  end if;
  v_note := nullif(btrim(coalesce(p_input->>'note', '')), '');
  if v_note is not null and length(v_note) > 240 then raise exception 'Keep the note under 240 characters' using errcode = '22023'; end if;
  if p_input ? 'storeId' and jsonb_typeof(p_input->'storeId') <> 'null' then
    v_store := private.shop_uuid(p_input, 'storeId');
    perform 1 from public.shop_stores where id = v_store and business_id = v_company;
    if not found then raise exception 'Store access denied' using errcode = '42501'; end if;
  end if;
  v_hash := encode(sha256(convert_to(jsonb_build_object('store', v_store, 'category', v_category, 'amount', v_amount,
    'method', v_method, 'date', v_date, 'note', v_note)::text, 'UTF8')), 'hex');
  select * into v_row from public.shop_expenses where id = v_id;
  if found then
    if v_row.business_id <> v_company or v_row.request_sha256 <> v_hash then
      raise exception 'This expense was already recorded with different details' using errcode = '23505';
    end if;
    return jsonb_build_object('expenseId', v_id, 'replayed', true);
  end if;
  insert into public.shop_expenses (id, business_id, store_id, category, amount_minor, method, expense_date, note, request_sha256, recorded_by)
    values (v_id, v_company, v_store, v_category, v_amount, v_method, v_date, v_note, v_hash, p_actor);
  return jsonb_build_object('expenseId', v_id, 'replayed', false);
end $fn$;
revoke all on function private.shop_stage_l_expenses(text, uuid, uuid, jsonb) from public, anon, authenticated;

-- The daily report with an expenses block; everything else is the deployed definition.
create or replace function private.shop_stage_h_daily_report(
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
  v_expenses jsonb := '{"count":0,"totalMinor":"0","cash":"0","mobile":"0","card":"0","bank":"0"}'::jsonb;
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

    -- Money spent on running the shop, recorded in the range (voided ones left out). A store filter keeps
    -- only that store's expenses; expenses not tied to a store belong to the whole business.
    select jsonb_build_object('count', count(*), 'totalMinor', coalesce(sum(x.amount_minor), 0)::text,
        'cash', coalesce(sum(x.amount_minor) filter (where x.method = 'cash'), 0)::text,
        'mobile', coalesce(sum(x.amount_minor) filter (where x.method = 'mobile'), 0)::text,
        'card', coalesce(sum(x.amount_minor) filter (where x.method = 'card'), 0)::text,
        'bank', coalesce(sum(x.amount_minor) filter (where x.method = 'bank'), 0)::text)
      into v_expenses
      from public.shop_expenses x
     where x.business_id = v_company and x.recorded_at >= v_from and x.recorded_at < v_to
       and (v_store is null or x.store_id = v_store)
       and not exists (select 1 from public.shop_expense_voids v where v.expense_id = x.id);
  end if;

  -- Cash that should be in the till for this period: cash taken (sales and
  -- repayments) less cash paid out (refunds and, for owners, supplier payments
  -- and cash expenses).
  v_cash_in := (v_methods->>'cash')::numeric + (v_repay->>'cash')::numeric;
  v_cash_out := (v_refunds->>'cash')::numeric + (v_supplier->>'cash')::numeric + (v_expenses->>'cash')::numeric;

  return jsonb_build_object(
    'companyId', v_company, 'role', v_role, 'from', v_from, 'to', v_to, 'storeId', v_store,
    'sales', v_sales, 'byMethod', v_methods, 'refunds', v_refunds, 'repayments', v_repay,
    'supplierPayments', v_supplier, 'expenses', v_expenses, 'topProducts', v_top, 'byCashier', v_cashiers,
    'cashTakenMinor', v_cash_in::text, 'cashPaidOutMinor', v_cash_out::text,
    'cashExpectedMinor', (v_cash_in - v_cash_out)::text,
    'customerCreditOutstandingMinor', case when v_role = 'owner' then v_outstanding::text else null end);
end $fn$;
revoke all on function private.shop_stage_h_daily_report(uuid, uuid, jsonb)
  from public, anon, authenticated;

-- Router: previous baseline (20261111120000) plus the expense actions.
create or replace function public.tallybook_shop_ops(p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $body$
declare actor uuid:=auth.uid();sid uuid;
begin
  begin sid:=(auth.jwt()->>'session_id')::uuid;
  exception when others then sid:=null; end;
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
