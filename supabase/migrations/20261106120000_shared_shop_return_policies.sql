-- Stage B: server-authoritative, company-specific return policy.
-- Additive migration; DO NOT apply to a production project without owner approval,
-- PGlite/real-Postgres QA and review of existing refund obligations.
-- Historic sales remain revision 0 (legacy, no automatic new refund permission).
begin;

create table public.shop_return_policy_revisions (
  business_id uuid not null references public.businesses(id) on delete cascade,
  revision integer not null check (revision between 1 and 4096),
  effective_at timestamptz not null default clock_timestamp(),
  enabled boolean not null,
  allow_full_reversal boolean not null,
  allow_partial_return boolean not null,
  max_age_days integer not null check (max_age_days between 1 and 3650),
  reason text not null check (length(btrim(reason)) between 5 and 200),
  actor_id uuid not null references auth.users(id),
  primary key (business_id, revision),
  unique (business_id, effective_at),
  constraint shop_policy_options_valid check (
    (enabled and (allow_full_reversal or allow_partial_return)) or
    (not enabled and not allow_full_reversal and not allow_partial_return)
  )
);
create index shop_policy_revision_latest on public.shop_return_policy_revisions (business_id, revision desc);
alter table public.shop_return_policy_revisions enable row level security;
alter table public.shop_return_policy_revisions force row level security;
revoke all on table public.shop_return_policy_revisions from public, anon, authenticated;
create trigger shop_return_policy_append_only
  before update or delete on public.shop_return_policy_revisions
  for each row execute function private.shop_reject_history_change();

alter table public.shop_sales
  add column return_policy_revision integer not null default 0,
  add column return_policy_enabled boolean not null default false,
  add column return_policy_full boolean not null default false,
  add column return_policy_partial boolean not null default false,
  add column return_policy_days integer not null default 30
    check (return_policy_days between 1 and 3650);
alter table public.shop_sales add constraint shop_sale_policy_snapshot_valid check (
  (return_policy_revision = 0 and not return_policy_enabled
    and not return_policy_full and not return_policy_partial) or
  (return_policy_revision > 0 and (
    (return_policy_enabled and (return_policy_full or return_policy_partial)) or
    (not return_policy_enabled and not return_policy_full and not return_policy_partial)))
);

-- Existing refund rows predate Stage B; NULL evidence denotes legacy-unverified.
alter table public.shop_refunds
  add column policy_sale_revision integer,
  add column policy_decision_revision integer,
  add column policy_kind text,
  add column policy_checked_at timestamptz;
alter table public.shop_refunds add constraint shop_refund_policy_evidence_coherent check (
  (policy_sale_revision is null and policy_decision_revision is null
    and policy_kind is null and policy_checked_at is null) or
  (policy_sale_revision > 0 and policy_decision_revision > 0
    and policy_kind in ('full','partial') and policy_checked_at is not null)
);

-- Snapshot policy in every new sale in the same SQL transaction as the sale.
-- The trigger intentionally overwrites any attempted caller-supplied snapshot.
create function private.shop_capture_return_policy() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare v_policy public.shop_return_policy_revisions;
begin
  -- The sale's effective posting timestamp must not predate a concurrent
  -- policy update completed while the sale waited for the company ledger lock.
  new.recorded_at := clock_timestamp();
  select * into v_policy from public.shop_return_policy_revisions
    where business_id = new.business_id order by revision desc limit 1;
  if found then
    new.return_policy_revision := v_policy.revision;
    new.return_policy_enabled := v_policy.enabled;
    new.return_policy_full := v_policy.allow_full_reversal;
    new.return_policy_partial := v_policy.allow_partial_return;
    new.return_policy_days := v_policy.max_age_days;
  else
    new.return_policy_revision := 0;
    new.return_policy_enabled := false;
    new.return_policy_full := false;
    new.return_policy_partial := false;
    new.return_policy_days := 30;
  end if;
  return new;
end $fn$;
create trigger shop_sale_return_policy_snapshot
  before insert on public.shop_sales
  for each row execute function private.shop_capture_return_policy();

create function private.shop_authorize_return_policy(
  p_company uuid, p_sale public.shop_sales, p_void boolean, p_at timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_current public.shop_return_policy_revisions;
begin
  select * into v_current from public.shop_return_policy_revisions
    where business_id = p_company order by revision desc limit 1;
  if p_sale.business_id <> p_company or not found or
      not v_current.enabled or not p_sale.return_policy_enabled or
      p_sale.return_policy_revision = 0 then
    raise exception 'This business does not authorize refunds for this sale' using errcode = '42501';
  end if;
  if (p_void and (not v_current.allow_full_reversal or not p_sale.return_policy_full))
      or (not p_void and (not v_current.allow_partial_return or not p_sale.return_policy_partial)) then
    raise exception 'This business does not authorize this kind of refund' using errcode = '42501';
  end if;
  if p_at < p_sale.recorded_at or
      v_current.effective_at > p_at or
      p_at > p_sale.recorded_at + make_interval(days => least(v_current.max_age_days, p_sale.return_policy_days)) then
    raise exception 'This sale is outside the authorized return window' using errcode = '23514';
  end if;
  return jsonb_build_object('revision',v_current.revision,
    'saleRevision',p_sale.return_policy_revision);
end $fn$;

-- Policy is changed only via a session-bound owner action, under the same
-- company ledger lock used by sales and refunds. Every revision is append-only.
create function private.shop_policy_action(
  p_action text, p_actor uuid, p_session uuid, p_input jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_company uuid;
  v_role text;
  v_revision integer;
  v_enabled boolean;
  v_full boolean;
  v_partial boolean;
  v_days integer;
  v_reason text;
  v_when timestamptz;
  v_current jsonb;
  v_history jsonb;
begin
  if jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'Invalid policy request' using errcode = '22023';
  end if;
  v_company := private.shop_uuid(p_input,'companyId');
  v_role := private.shop_member_role(p_actor,p_session,v_company);
  if v_role <> 'owner' then
    raise exception 'Only the business owner can manage return policies' using errcode = '42501';
  end if;
  if p_action = 'setRefundPolicy' then
    perform 1 from public.shop_ledgers where business_id = v_company for update;
    if not found then
      raise exception 'Set up this shop before configuring returns' using errcode = '42501';
    end if;
    if jsonb_typeof(p_input->'enabled') is distinct from 'boolean' or
        jsonb_typeof(p_input->'allowFullReversal') is distinct from 'boolean' or
        jsonb_typeof(p_input->'allowPartialReturn') is distinct from 'boolean' then
      raise exception 'Choose valid refund options' using errcode = '22023';
    end if;
    v_enabled := (p_input->>'enabled')::boolean;
    v_full := (p_input->>'allowFullReversal')::boolean;
    v_partial := (p_input->>'allowPartialReturn')::boolean;
    v_days := private.shop_int(p_input,'maxAgeDays',1,3650);
    v_reason := btrim(coalesce(p_input->>'reason',''));
    if length(v_reason) not between 5 and 200 or
        (v_enabled and not (v_full or v_partial)) or
        (not v_enabled and (v_full or v_partial)) then
      raise exception 'Choose consistent refund settings and a reason of 5–200 characters' using errcode = '22023';
    end if;
    select coalesce(max(revision),0)+1 into v_revision
      from public.shop_return_policy_revisions where business_id = v_company;
    if v_revision > 4096 then
      raise exception 'Return policy history is full' using errcode = '23514';
    end if;
    v_when := clock_timestamp();
    insert into public.shop_return_policy_revisions
      (business_id,revision,effective_at,enabled,allow_full_reversal,
       allow_partial_return,max_age_days,reason,actor_id)
    values (v_company,v_revision,v_when,v_enabled,v_full,v_partial,v_days,v_reason,p_actor);
  elsif p_action <> 'getRefundPolicyHistory' then
    raise exception 'Unknown policy action' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
     'revision',p.revision,'effectiveAt',p.effective_at,'enabled',p.enabled,
     'allowFullReversal',p.allow_full_reversal,'allowPartialReturn',p.allow_partial_return,
     'maxAgeDays',p.max_age_days,'reason',p.reason,'actorId',p.actor_id
  ) order by p.revision), '[]'::jsonb) into v_history
    from public.shop_return_policy_revisions p where p.business_id = v_company;
  v_current := coalesce(v_history->(jsonb_array_length(v_history)-1),
    jsonb_build_object('revision',0,'enabled',false,'allowFullReversal',false,
      'allowPartialReturn',false,'maxAgeDays',30));
  return jsonb_build_object('current',v_current,'history',v_history);
end $fn$;

create function private.shop_policy_overview(p_actor uuid,p_session uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_company uuid; v_current public.shop_return_policy_revisions;
begin
  v_company := private.shop_uuid(p_input,'companyId');
  perform private.shop_member_role(p_actor,p_session,v_company);
  select * into v_current from public.shop_return_policy_revisions
    where business_id = v_company order by revision desc limit 1;
  if not found then
    return jsonb_build_object('refundPolicy',jsonb_build_object('revision',0,
      'enabled',false,'allowFullReversal',false,'allowPartialReturn',false,'maxAgeDays',30));
  end if;
  return jsonb_build_object('refundPolicy', jsonb_build_object(
    'revision',v_current.revision,'enabled',v_current.enabled,
    'allowFullReversal',v_current.allow_full_reversal,
    'allowPartialReturn',v_current.allow_partial_return,'maxAgeDays',v_current.max_age_days));
end $fn$;

-- Expose immutable sale/refund policy evidence to audit and owner UI.
create or replace function private.shop_receipt(p_sale uuid, p_replayed boolean) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'saleId', s.id, 'companyId', s.business_id, 'storeId', s.store_id, 'storeName', st.name,
    'cashierId', s.cashier_id, 'submissionKey', s.submission_key,
    'receiptNumber', s.receipt_number, 'currency', s.currency, 'totalMinor', s.total_minor,
    'returnPolicyRevision', s.return_policy_revision,
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
        'policySaleRevision', r.policy_sale_revision, 'policyDecisionRevision', r.policy_decision_revision,
        'policyKind', r.policy_kind, 'policyCheckedAt', r.policy_checked_at,
        'lines', (select jsonb_agg(jsonb_build_object('lineNo', rl.line_no, 'productId', rl.product_id,
            'quantity', rl.quantity, 'lineTotalMinor', rl.line_total_minor) order by rl.line_no)
          from public.shop_refund_lines rl where rl.refund_id = r.id)) order by r.refund_no)
      from public.shop_refunds r where r.sale_id = s.id), '[]'::jsonb))
  from public.shop_sales s
  join public.shop_payments p on p.sale_id = s.id
  join public.shop_stores st on st.id = s.store_id
  where s.id = p_sale
$$;

-- Preserve existing receipt pricing, authorization, debt-first refunds,
-- stock movement and deduplication. Add only policy checks and evidence.
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
  v_policy jsonb;
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

  -- Authorize after idempotent replay so an already posted refund can be retried
  -- after a later policy revision, without posting new money/stock changes.
  v_policy := private.shop_authorize_return_policy(v_company, v_sale, v_void, at_time);

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
      amount_minor, credit_minor, returned_to_stock, reason, actor_id, recorded_at,
      policy_sale_revision, policy_decision_revision, policy_kind, policy_checked_at)
    values (v_refund, v_company, v_sale.id, v_no, p_input->>'refundKey', v_hash, v_method,
      v_amount, v_credit, v_restock, v_reason, p_actor, at_time,
      v_sale.return_policy_revision, (v_policy->>'revision')::int,
      case when v_void then 'full' else 'partial' end, at_time);

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

revoke all on function private.shop_capture_return_policy(),
  private.shop_authorize_return_policy(uuid,public.shop_sales,boolean,timestamptz),
  private.shop_policy_action(text,uuid,uuid,jsonb),
  private.shop_policy_overview(uuid,uuid,jsonb),
  private.shop_refund_sale(uuid,uuid,jsonb)
  from public,anon,authenticated;

-- Public RPC continues checking auth.uid(), JWT session and membership in the
-- called functions; direct table access remains unavailable to browser roles.
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
  if p_action = 'recordSale' then return private.shop_record_sale(actor,sid,p_input); end if;
  if p_action = 'refundSale' then return private.shop_refund_sale(actor,sid,p_input); end if;
  if p_action in ('setRefundPolicy','getRefundPolicyHistory') then
    return private.shop_policy_action(p_action,actor,sid,p_input);
  end if;
  if p_action = 'importOpening' then return private.tallybook_shop_owner_action(p_action,actor,sid,p_input); end if;
  if p_action in ('saveCustomer','recordRepayment','customerStatement','setMemberPermissions') then
    return private.shop_customer_action(p_action,actor,sid,p_input);
  end if;
  v_result := private.tallybook_shop_action(p_action,actor,sid,p_input);
  if p_action = 'overview' then
    v_result := v_result || private.shop_customer_action('overviewExtra',actor,sid,p_input)
      || private.shop_policy_overview(actor,sid,p_input);
  end if;
  return v_result;
end $body$;
revoke all on function public.tallybook_shop(text,jsonb) from public,anon;
grant execute on function public.tallybook_shop(text,jsonb) to authenticated;

commit;
