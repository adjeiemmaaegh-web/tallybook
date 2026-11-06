-- Per-company cloud refund policy (PRD R3).
-- * Append-only policy history per company, default OFF (no row = refunds off).
-- * Each new sale snapshots the policy in force at the moment it is recorded.
-- * refundSale (authoritative, server side) requires BOTH the sale-time terms
--   and the current terms to allow the refund kind, and applies the stricter
--   age limit. Decision evidence is stored on the refund.
-- * Sales made before this migration have no snapshot and are never
--   auto-refundable (legacy). Replays of an already-posted refund still return
--   the stored receipt.
-- This is an application policy, not a waiver of statutory consumer rights.
-- Rollback: supabase/rollback/20261106120000_shop_refund_policy_down.sql
begin;

create table public.shop_refund_policy_history (
  business_id uuid not null references public.businesses(id),
  revision integer not null check (revision >= 1),
  effective_at timestamptz not null,
  refunds_enabled boolean not null,
  allow_void boolean not null,
  allow_partial boolean not null,
  max_age_days integer not null check (max_age_days between 1 and 3650),
  reason text not null check (length(btrim(reason)) between 1 and 200),
  actor_id uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  primary key (business_id, revision),
  check ((refunds_enabled and (allow_void or allow_partial)) or (not refunds_enabled and not allow_void and not allow_partial))
);
create index shop_refund_policy_actor on public.shop_refund_policy_history (actor_id);
alter table public.shop_refund_policy_history enable row level security;
alter table public.shop_refund_policy_history force row level security;
revoke all on public.shop_refund_policy_history from public, anon, authenticated;

create function private.shop_policy_history_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Refund policy history is append-only' using errcode = '42501';
end $$;
create trigger shop_refund_policy_history_append_only before update or delete on public.shop_refund_policy_history
  for each row execute function private.shop_policy_history_immutable();

alter table public.shop_sales
  add column refund_policy_revision integer,
  add column refund_policy_snapshot jsonb;
alter table public.shop_refunds
  add column policy_evidence jsonb;

-- shop_sales is already append-only, so the snapshot cannot change after insert.
create function private.shop_sale_policy_snapshot() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p public.shop_refund_policy_history;
begin
  select * into p from public.shop_refund_policy_history h
    where h.business_id = new.business_id and h.effective_at <= clock_timestamp() order by h.revision desc limit 1;
  if found then
    new.refund_policy_revision := p.revision;
    new.refund_policy_snapshot := jsonb_build_object('refundsEnabled', p.refunds_enabled, 'allowVoid', p.allow_void,
      'allowPartial', p.allow_partial, 'maxAgeDays', p.max_age_days);
  else
    new.refund_policy_revision := 0;
    new.refund_policy_snapshot := jsonb_build_object('refundsEnabled', false, 'allowVoid', false,
      'allowPartial', false, 'maxAgeDays', 30);
  end if;
  return new;
end $$;
create trigger shop_sales_policy_snapshot before insert on public.shop_sales
  for each row execute function private.shop_sale_policy_snapshot();

create function private.shop_refund_policy_json(p_company uuid, p_role text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare p public.shop_refund_policy_history;
begin
  select * into p from public.shop_refund_policy_history h
    where h.business_id = p_company and h.effective_at <= clock_timestamp() order by h.revision desc limit 1;
  return jsonb_build_object('companyId', p_company,
    'revision', coalesce(p.revision, 0),
    'refundsEnabled', coalesce(p.refunds_enabled, false),
    'allowVoid', coalesce(p.allow_void, false),
    'allowPartial', coalesce(p.allow_partial, false),
    'maxAgeDays', coalesce(p.max_age_days, 30),
    'effectiveAt', p.effective_at,
    'history', case when p_role = 'owner' then coalesce((select jsonb_agg(jsonb_build_object(
        'revision', x.revision, 'effectiveAt', x.effective_at, 'refundsEnabled', x.refunds_enabled,
        'allowVoid', x.allow_void, 'allowPartial', x.allow_partial, 'maxAgeDays', x.max_age_days,
        'reason', x.reason, 'actorId', x.actor_id) order by x.revision desc)
      from (select * from public.shop_refund_policy_history where business_id = p_company
            order by revision desc limit 50) x), '[]'::jsonb) else '[]'::jsonb end);
end $$;

create function private.shop_refund_policy_action(p_action text, p_actor uuid, p_session uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_company uuid;
  v_role text;
  v_cur public.shop_refund_policy_history;
  v_enabled boolean;
  v_void boolean;
  v_partial boolean;
  v_days integer;
  v_reason text;
  v_when timestamptz;
begin
  if jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'Authenticated account required' using errcode = '42501';
  end if;
  v_company := private.shop_uuid(p_input, 'companyId');
  v_role := private.shop_member_role(p_actor, p_session, v_company);
  if p_action = 'refundPolicy' then
    return private.shop_refund_policy_json(v_company, v_role);
  end if;
  if v_role <> 'owner' then raise exception 'Only the business owner can do this' using errcode = '42501'; end if;
  -- Same lock the refund action takes, so a policy change and a refund never interleave.
  perform 1 from public.shop_ledgers where business_id = v_company for update;
  if not found then raise exception 'The owner has not set up this shop yet' using errcode = '42501'; end if;

  foreach v_reason in array array['refundsEnabled', 'allowVoid', 'allowPartial', 'confirmed'] loop
    if jsonb_typeof(p_input->v_reason) is distinct from 'boolean' then
      raise exception 'Invalid %', v_reason using errcode = '22023';
    end if;
  end loop;
  if not (p_input->>'confirmed')::boolean then
    raise exception 'Confirm the refund policy change' using errcode = '22023';
  end if;
  v_enabled := (p_input->>'refundsEnabled')::boolean;
  v_void := (p_input->>'allowVoid')::boolean;
  v_partial := (p_input->>'allowPartial')::boolean;
  v_days := private.shop_int(p_input, 'maxAgeDays', 1, 3650);
  v_reason := btrim(coalesce(p_input->>'reason', ''));
  if length(v_reason) not between 1 and 200 then raise exception 'Say why the policy is changing' using errcode = '22023'; end if;
  if v_enabled and not (v_void or v_partial) then
    raise exception 'Choose which refunds are allowed' using errcode = '22023';
  end if;
  if not v_enabled then v_void := false; v_partial := false; end if;

  select * into v_cur from public.shop_refund_policy_history where business_id = v_company order by revision desc limit 1;
  -- Optimistic concurrency: the caller must have seen the current revision.
  if private.shop_int(p_input, 'expectedRevision', 0, 1000000) <> coalesce(v_cur.revision, 0) then
    raise exception 'The refund policy changed; reload and try again' using errcode = '40001';
  end if;
  v_when := greatest(clock_timestamp(), coalesce(v_cur.effective_at + interval '1 microsecond', '-infinity'::timestamptz));
  insert into public.shop_refund_policy_history (business_id, revision, effective_at, refunds_enabled, allow_void,
      allow_partial, max_age_days, reason, actor_id)
    values (v_company, coalesce(v_cur.revision, 0) + 1, v_when, v_enabled, v_void, v_partial, v_days, v_reason, p_actor);
  return private.shop_refund_policy_json(v_company, v_role);
end $fn$;

revoke all on function private.shop_policy_history_immutable(), private.shop_sale_policy_snapshot(),
  private.shop_refund_policy_json(uuid, text), private.shop_refund_policy_action(text, uuid, uuid, jsonb)
  from public, anon, authenticated;

-- Enforcement inside the authoritative refund transaction.
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
revoke all on function private.shop_refund_sale(uuid, uuid, jsonb) from public, anon, authenticated;

-- Router: add the two policy actions; everything else is unchanged.
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
  if p_action in ('refundPolicy', 'setRefundPolicy') then return private.shop_refund_policy_action(p_action, actor, sid, p_input); end if;
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
