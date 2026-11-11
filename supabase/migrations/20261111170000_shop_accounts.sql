-- Accounts for the shared shop: where the money is, and whether it matches.
--
-- Owner only. Money is followed through four accounts: cash, mobile money,
-- card and bank. For any period, accountsOverview shows what came in and went
-- out of each, built only from records the shop already keeps: sales by how
-- they were paid, customers' repayments, refunds paid back, supplier payments,
-- expenses, and transfers between accounts (for example cash banked, or card
-- settlements arriving in the bank). Money that is only owed (credit, unpaid
-- goods) is not an account movement; it is shown as what customers owe and what
-- the shop owes suppliers, beside the stock at cost.
--
-- Reconciliation: the owner counts what is really there (the drawer, the mobile
-- money wallet, the card settlement, the bank statement) and records it. The
-- first count for an account sets its opening balance. Each later count is
-- compared with the previous count plus everything recorded since, and the
-- difference (over or short) is kept with the count. Counts and transfers are
-- append-only; a transfer is cancelled with a reason, never edited.
--
-- Rollback: supabase/rollback/20261111170000_shop_accounts_down.sql
begin;

create table public.shop_account_transfers (
  id uuid primary key,
  business_id uuid not null references public.businesses(id),
  from_account text not null check (from_account in ('cash', 'mobile', 'card', 'bank')),
  to_account text not null check (to_account in ('cash', 'mobile', 'card', 'bank')),
  amount_minor bigint not null check (amount_minor between 1 and 100000000000),
  note text check (note is null or length(note) <= 240),
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default clock_timestamp(),
  check (from_account <> to_account)
);
create index shop_account_transfers_business on public.shop_account_transfers (business_id, recorded_at desc);
create table public.shop_account_transfer_voids (
  transfer_id uuid primary key references public.shop_account_transfers(id),
  business_id uuid not null,
  reason text not null check (length(reason) between 4 and 200),
  voided_by uuid not null references auth.users(id),
  voided_at timestamptz not null default clock_timestamp()
);
create table public.shop_reconciliations (
  id uuid primary key,
  business_id uuid not null references public.businesses(id),
  account text not null check (account in ('cash', 'mobile', 'card', 'bank')),
  as_of timestamptz not null default clock_timestamp(),
  actual_minor bigint not null check (actual_minor between 0 and 100000000000000),
  expected_minor bigint,
  difference_minor bigint,
  previous_id uuid references public.shop_reconciliations(id),
  note text check (note is null or length(note) <= 240),
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  recorded_by uuid not null references auth.users(id),
  check ((expected_minor is null) = (difference_minor is null) and (expected_minor is null) = (previous_id is null))
);
create index shop_reconciliations_account on public.shop_reconciliations (business_id, account, as_of desc);
do $$
declare tbl text;
begin
  foreach tbl in array array['shop_account_transfers', 'shop_account_transfer_voids', 'shop_reconciliations'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('alter table public.%I force row level security', tbl);
    execute format('revoke all on table public.%I from public, anon, authenticated', tbl);
    execute format('create trigger %I before update or delete on public.%I for each row execute function private.shop_reject_history_change()', tbl || '_append_only', tbl);
  end loop;
end $$;

-- What moved through one money account in a window [p_from, p_to). Every figure is a sum of records
-- the shop already keeps; nothing is estimated. Money that was only owed (credit, unpaid goods) is not here.
create function private.shop_account_components(p_company uuid, p_account text, p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'sales', coalesce((select sum(amt) from (
        select t.amount_minor as amt from public.shop_sale_tenders t join public.shop_sales s on s.id = t.sale_id
          where s.business_id = p_company and t.method = p_account and s.recorded_at >= p_from and s.recorded_at < p_to
        union all
        select p.amount_due_minor from public.shop_payments p join public.shop_sales s on s.id = p.sale_id
          where s.business_id = p_company and p.method = p_account and s.recorded_at >= p_from and s.recorded_at < p_to
            and not exists (select 1 from public.shop_sale_tenders t where t.sale_id = p.sale_id)) x), 0)::text,
    'repayments', coalesce((select sum(-e.amount_minor) from public.shop_customer_entries e
        where e.business_id = p_company and e.kind = 'repayment' and e.method = p_account and e.recorded_at >= p_from and e.recorded_at < p_to), 0)::text,
    'transfersIn', coalesce((select sum(x.amount_minor) from public.shop_account_transfers x
        where x.business_id = p_company and x.to_account = p_account and x.recorded_at >= p_from and x.recorded_at < p_to
          and not exists (select 1 from public.shop_account_transfer_voids v where v.transfer_id = x.id)), 0)::text,
    'refunds', coalesce((select sum(r.amount_minor - r.credit_minor) from public.shop_refunds r
        where r.business_id = p_company and r.method = p_account and r.recorded_at >= p_from and r.recorded_at < p_to), 0)::text,
    'suppliers', coalesce((select sum(m.amount_minor) from public.shop_supplier_settlements m
        where m.business_id = p_company and m.method = p_account and m.recorded_at >= p_from and m.recorded_at < p_to), 0)::text,
    'expenses', coalesce((select sum(x.amount_minor) from public.shop_expenses x
        where x.business_id = p_company and x.method = p_account and x.recorded_at >= p_from and x.recorded_at < p_to
          and not exists (select 1 from public.shop_expense_voids v where v.expense_id = x.id)), 0)::text,
    'transfersOut', coalesce((select sum(x.amount_minor) from public.shop_account_transfers x
        where x.business_id = p_company and x.from_account = p_account and x.recorded_at >= p_from and x.recorded_at < p_to
          and not exists (select 1 from public.shop_account_transfer_voids v where v.transfer_id = x.id)), 0)::text)
$$;
revoke all on function private.shop_account_components(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;

create function private.shop_account_net(p_components jsonb) returns numeric
language sql immutable set search_path = '' as $$
  select (p_components->>'sales')::numeric + (p_components->>'repayments')::numeric + (p_components->>'transfersIn')::numeric
       - (p_components->>'refunds')::numeric - (p_components->>'suppliers')::numeric - (p_components->>'expenses')::numeric - (p_components->>'transfersOut')::numeric
$$;
revoke all on function private.shop_account_net(jsonb) from public, anon, authenticated;

create function private.shop_stage_p_accounts(
  p_action text, p_actor uuid, p_session uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_now timestamptz := clock_timestamp();
  v_company uuid;
  v_role text;
  v_accounts constant text[] := array['cash', 'mobile', 'card', 'bank'];
  v_a text;
  v_from timestamptz;
  v_to timestamptz;
  v_out jsonb := '{}'::jsonb;
  v_comp jsonb;
  v_last public.shop_reconciliations;
  v_since jsonb;
  v_expected numeric;
  v_id uuid;
  v_account text;
  v_from_acc text;
  v_to_acc text;
  v_amount bigint;
  v_note text;
  v_hash text;
  v_prev public.shop_reconciliations;
  v_actual bigint;
  v_diff bigint;
  v_row public.shop_reconciliations;
  v_tr public.shop_account_transfers;
  v_reason text;
  v_recv numeric; v_pay numeric; v_inv numeric; v_nocost bigint;
begin
  if jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'Valid request required' using errcode = '22023';
  end if;
  v_company := private.shop_uuid(p_input, 'companyId');
  v_role := private.shop_member_role(p_actor, p_session, v_company);
  if v_role <> 'owner' then raise exception 'Only the business owner can see the accounts' using errcode = '42501'; end if;

  if p_action = 'accountsOverview' then
    begin v_from := (p_input->>'from')::timestamptz; exception when others then raise exception 'Invalid from' using errcode = '22023'; end;
    begin v_to := (p_input->>'to')::timestamptz; exception when others then raise exception 'Invalid to' using errcode = '22023'; end;
    if v_from is null then raise exception 'Invalid from' using errcode = '22023'; end if;
    if v_to is null or v_to <= v_from or v_to - v_from > interval '93 days' then raise exception 'Invalid to' using errcode = '22023'; end if;
    foreach v_a in array v_accounts loop
      v_comp := private.shop_account_components(v_company, v_a, v_from, v_to);
      select * into v_last from public.shop_reconciliations where business_id = v_company and account = v_a order by as_of desc, id desc limit 1;
      v_expected := null; v_since := null;
      if found then
        v_since := private.shop_account_components(v_company, v_a, v_last.as_of + interval '1 microsecond', v_now + interval '1 microsecond');
        v_expected := v_last.actual_minor + private.shop_account_net(v_since);
      end if;
      v_out := v_out || jsonb_build_object(v_a, jsonb_build_object(
        'components', v_comp,
        'inMinor', ((v_comp->>'sales')::numeric + (v_comp->>'repayments')::numeric + (v_comp->>'transfersIn')::numeric)::text,
        'outMinor', ((v_comp->>'refunds')::numeric + (v_comp->>'suppliers')::numeric + (v_comp->>'expenses')::numeric + (v_comp->>'transfersOut')::numeric)::text,
        'netMinor', private.shop_account_net(v_comp)::text,
        'lastReconciliation', case when v_last.id is null then null else jsonb_build_object('reconciliationId', v_last.id, 'asOf', v_last.as_of,
            'actualMinor', v_last.actual_minor::text, 'differenceMinor', v_last.difference_minor::text) end,
        'expectedNowMinor', v_expected::text));
    end loop;
    select coalesce(sum(balance_minor), 0) into v_recv from public.shop_customers where business_id = v_company;
    select coalesce((select sum(r.total_minor) from public.shop_purchase_receipts r join public.shop_purchase_orders o on o.id = r.order_id where o.business_id = v_company), 0)
         - coalesce((select sum(s.amount_minor) from public.shop_supplier_settlements s where s.business_id = v_company), 0) into v_pay;
    select coalesce(sum(k.quantity::numeric * p.cost_minor) filter (where p.cost_minor is not null), 0),
           count(*) filter (where p.cost_minor is null and k.quantity > 0)
      into v_inv, v_nocost
      from public.shop_store_stock k join public.shop_products p on p.id = k.product_id and p.business_id = k.business_id
     where k.business_id = v_company and p.active and p.track_stock and k.quantity > 0;
    return jsonb_build_object('companyId', v_company, 'from', v_from, 'to', v_to, 'accounts', v_out,
      'position', jsonb_build_object('customersOweMinor', v_recv::text, 'oweSuppliersMinor', v_pay::text,
        'stockAtCostMinor', v_inv::text, 'stockLinesWithoutCost', v_nocost));
  end if;

  if p_action = 'listReconciliations' then
    v_account := p_input->>'account';
    if v_account is not null and v_account <> all (v_accounts) then raise exception 'Choose an account' using errcode = '22023'; end if;
    return jsonb_build_object('reconciliations', coalesce((
      select jsonb_agg(jsonb_build_object('reconciliationId', r.id, 'account', r.account, 'asOf', r.as_of, 'actualMinor', r.actual_minor::text,
          'expectedMinor', r.expected_minor::text, 'differenceMinor', r.difference_minor::text, 'note', r.note, 'recordedBy', r.recorded_by) order by r.as_of desc, r.id)
      from (select * from public.shop_reconciliations where business_id = v_company and (v_account is null or account = v_account)
            order by as_of desc, id desc limit 50) r), '[]'::jsonb));
  end if;

  if p_action = 'listAccountTransfers' then
    return jsonb_build_object('transfers', coalesce((
      select jsonb_agg(jsonb_build_object('transferId', x.id, 'from', x.from_account, 'to', x.to_account, 'amountMinor', x.amount_minor::text, 'note', x.note,
          'recordedAt', x.recorded_at, 'voided', v.transfer_id is not null, 'voidReason', v.reason) order by x.recorded_at desc, x.id)
      from (select * from public.shop_account_transfers where business_id = v_company order by recorded_at desc, id desc limit 50) x
      left join public.shop_account_transfer_voids v on v.transfer_id = x.id), '[]'::jsonb));
  end if;

  -- Everything below writes: one at a time per business, in step with sales.
  perform 1 from public.shop_ledgers where business_id = v_company for update;
  if not found then raise exception 'Set up this shop before using the accounts' using errcode = '42501'; end if;

  if p_action = 'recordAccountTransfer' then
    v_id := private.shop_uuid(p_input, 'transferId');
    v_from_acc := p_input->>'from'; v_to_acc := p_input->>'to';
    if v_from_acc is null or v_from_acc <> all (v_accounts) or v_to_acc is null or v_to_acc <> all (v_accounts) then raise exception 'Choose both accounts' using errcode = '22023'; end if;
    if v_from_acc = v_to_acc then raise exception 'Choose two different accounts' using errcode = '22023'; end if;
    v_amount := private.shop_int(p_input, 'amountMinor', 1, 100000000000);
    v_note := nullif(btrim(coalesce(p_input->>'note', '')), '');
    if v_note is not null and length(v_note) > 240 then raise exception 'Keep the note under 240 characters' using errcode = '22023'; end if;
    v_hash := encode(sha256(convert_to(jsonb_build_object('from', v_from_acc, 'to', v_to_acc, 'amount', v_amount, 'note', v_note)::text, 'UTF8')), 'hex');
    select * into v_tr from public.shop_account_transfers where id = v_id;
    if found then
      if v_tr.business_id <> v_company or v_tr.request_sha256 <> v_hash then raise exception 'This transfer was already recorded with different details' using errcode = '23505'; end if;
      return jsonb_build_object('transferId', v_id, 'replayed', true);
    end if;
    insert into public.shop_account_transfers (id, business_id, from_account, to_account, amount_minor, note, request_sha256, recorded_by)
      values (v_id, v_company, v_from_acc, v_to_acc, v_amount, v_note, v_hash, p_actor);
    return jsonb_build_object('transferId', v_id, 'replayed', false);
  end if;

  if p_action = 'voidAccountTransfer' then
    v_id := private.shop_uuid(p_input, 'transferId');
    v_reason := btrim(coalesce(p_input->>'reason', ''));
    if length(v_reason) not between 4 and 200 then raise exception 'Say why this transfer is being cancelled' using errcode = '22023'; end if;
    perform 1 from public.shop_account_transfers where id = v_id and business_id = v_company;
    if not found then raise exception 'Transfer not found' using errcode = '42501'; end if;
    insert into public.shop_account_transfer_voids (transfer_id, business_id, reason, voided_by) values (v_id, v_company, v_reason, p_actor) on conflict do nothing;
    return jsonb_build_object('transferId', v_id, 'voided', true);
  end if;

  -- reconcileAccount: the owner counted what is really there; compare it with what the records say should be.
  v_id := private.shop_uuid(p_input, 'reconciliationId');
  v_account := p_input->>'account';
  if v_account is null or v_account <> all (v_accounts) then raise exception 'Choose an account' using errcode = '22023'; end if;
  v_actual := private.shop_int(p_input, 'actualMinor', 0, 100000000000000);
  v_note := nullif(btrim(coalesce(p_input->>'note', '')), '');
  if v_note is not null and length(v_note) > 240 then raise exception 'Keep the note under 240 characters' using errcode = '22023'; end if;
  v_hash := encode(sha256(convert_to(jsonb_build_object('account', v_account, 'actual', v_actual, 'note', v_note)::text, 'UTF8')), 'hex');
  select * into v_row from public.shop_reconciliations where id = v_id;
  if found then
    if v_row.business_id <> v_company or v_row.request_sha256 <> v_hash then raise exception 'This count was already recorded with different details' using errcode = '23505'; end if;
    return jsonb_build_object('reconciliationId', v_id, 'expectedMinor', v_row.expected_minor::text, 'differenceMinor', v_row.difference_minor::text, 'replayed', true);
  end if;
  select * into v_prev from public.shop_reconciliations where business_id = v_company and account = v_account order by as_of desc, id desc limit 1;
  if found then
    v_since := private.shop_account_components(v_company, v_account, v_prev.as_of + interval '1 microsecond', v_now + interval '1 microsecond');
    v_expected := v_prev.actual_minor + private.shop_account_net(v_since);
    v_diff := v_actual - v_expected;
    insert into public.shop_reconciliations (id, business_id, account, as_of, actual_minor, expected_minor, difference_minor, previous_id, note, request_sha256, recorded_by)
      values (v_id, v_company, v_account, v_now, v_actual, v_expected::bigint, v_diff, v_prev.id, v_note, v_hash, p_actor);
    return jsonb_build_object('reconciliationId', v_id, 'expectedMinor', v_expected::text, 'differenceMinor', v_diff::text, 'replayed', false);
  end if;
  insert into public.shop_reconciliations (id, business_id, account, as_of, actual_minor, note, request_sha256, recorded_by)
    values (v_id, v_company, v_account, v_now, v_actual, v_note, v_hash, p_actor);
  return jsonb_build_object('reconciliationId', v_id, 'expectedMinor', null, 'differenceMinor', null, 'opening', true, 'replayed', false);
end $fn$;
revoke all on function private.shop_stage_p_accounts(text, uuid, uuid, jsonb) from public, anon, authenticated;

-- Router: previous baseline (20261111160000) plus the account actions.
create or replace function public.tallybook_shop_ops(p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $body$
declare actor uuid:=auth.uid();sid uuid;
begin
  begin sid:=(auth.jwt()->>'session_id')::uuid;
  exception when others then sid:=null; end;
  if p_action in ('accountsOverview','reconcileAccount','listReconciliations',
      'recordAccountTransfer','voidAccountTransfer','listAccountTransfers') then
    return private.shop_stage_p_accounts(p_action,actor,sid,p_input);
  end if;
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
