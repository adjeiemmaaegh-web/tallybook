-- Shared Shop: server-owned shift handover and owner-only activity chronology.
-- No automatic accusation or inferred reconciliation: cash counted by staff and
-- server-posted transactions are separate facts. This is not the device ledger.
begin;

create table public.shop_staff_shifts (
  id uuid primary key,
  business_id uuid not null references public.businesses(id),
  store_id uuid not null,
  staff_id uuid not null references auth.users(id),
  opened_at timestamptz not null default clock_timestamp(),
  opening_cash_minor bigint not null check (opening_cash_minor between 0 and 100000000000000),
  opening_note text check (opening_note is null or length(opening_note) between 4 and 240),
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  forced_close boolean not null default false,
  closing_cash_minor bigint check (closing_cash_minor between 0 and 100000000000000),
  closing_note text check (closing_note is null or length(closing_note) between 4 and 240),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  review_decision text check (review_decision in ('accepted','needs-investigation')),
  review_note text check (review_note is null or length(review_note) between 4 and 240),
  unique (business_id,id),
  foreign key (business_id,store_id) references public.shop_stores(business_id,id),
  check ((closed_at is null) = (closed_by is null)),
  check ((closed_at is null) = (closing_cash_minor is null)),
  check (not forced_close or closed_at is not null),
  check ((reviewed_at is null) = (reviewed_by is null)),
  check ((reviewed_at is null) = (review_decision is null)),
  check (reviewed_at is null or closed_at is not null)
);
create unique index shop_one_open_shift_per_staff
  on public.shop_staff_shifts(business_id,staff_id) where closed_at is null;
create index shop_staff_shifts_time on public.shop_staff_shifts(business_id,store_id,opened_at desc);
create index shop_staff_shifts_actor on public.shop_staff_shifts(business_id,staff_id,opened_at desc);

-- Immutable audit events, separate from the mutable current-shift projection.
create table public.shop_staff_shift_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  shift_id uuid not null,
  actor_id uuid not null references auth.users(id),
  event_type text not null check (event_type in ('opened','closed','force_closed','reviewed')),
  occurred_at timestamptz not null default clock_timestamp(),
  facts jsonb not null default '{}'::jsonb check (jsonb_typeof(facts)='object'),
  foreign key (business_id,shift_id) references public.shop_staff_shifts(business_id,id),
  unique (shift_id,event_type)
);
create index shop_shift_events_time on public.shop_staff_shift_events(business_id,occurred_at desc,id desc);
alter table public.shop_staff_shifts enable row level security;
alter table public.shop_staff_shifts force row level security;
alter table public.shop_staff_shift_events enable row level security;
alter table public.shop_staff_shift_events force row level security;
revoke all on table public.shop_staff_shifts, public.shop_staff_shift_events from public,anon,authenticated;
create trigger shop_staff_shift_events_append_only
  before update or delete on public.shop_staff_shift_events
  for each row execute function private.shop_reject_history_change();

create function private.shop_stage_q_shift_action(
  p_action text,p_actor uuid,p_session uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_company uuid;
  v_role text;
  v_store uuid;
  v_shift_id uuid;
  v_shift public.shop_staff_shifts;
  v_open_cash bigint;
  v_close_cash bigint;
  v_note text;
  v_decision text;
  v_limit integer := 40;
  v_before timestamptz;
  v_before_key text;
  v_result jsonb;
begin
  if jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'Valid request required' using errcode='22023';
  end if;
  v_company := private.shop_uuid(p_input,'companyId');
  v_role := private.shop_member_role(p_actor,p_session,v_company);

  if p_action = 'listShifts' then
    return jsonb_build_object('shifts',coalesce((
      select jsonb_agg(jsonb_build_object(
        'shiftId',s.id,'companyId',s.business_id,'storeId',s.store_id,
        'staffId',s.staff_id,'openedAt',s.opened_at,'openingCashMinor',s.opening_cash_minor::text,
        'openingNote',s.opening_note,'closedAt',s.closed_at,'closedBy',s.closed_by,
        'forcedClose',s.forced_close,'closingCashMinor',s.closing_cash_minor::text,
        'closingNote',s.closing_note,'reviewedAt',s.reviewed_at,'reviewedBy',s.reviewed_by,
        'reviewDecision',s.review_decision,'reviewNote',s.review_note)
        order by s.opened_at desc,s.id desc)
      from (select * from public.shop_staff_shifts
        where business_id=v_company and (v_role='owner' or staff_id=p_actor)
        order by opened_at desc,id desc limit 100) s),'[]'::jsonb));
  end if;

  if p_action = 'auditEvents' then
    if v_role <> 'owner' then raise exception 'Only the business owner can inspect staff activity' using errcode='42501'; end if;
    if p_input ? 'storeId' and p_input->>'storeId' is not null then
      v_store := private.shop_uuid(p_input,'storeId');
      perform 1 from public.shop_stores where business_id=v_company and id=v_store;
      if not found then raise exception 'Store access denied' using errcode='42501'; end if;
    end if;
    if p_input ? 'limit' then v_limit := private.shop_int(p_input,'limit',1,100)::integer; end if;
    if p_input ? 'beforeAt' or p_input ? 'beforeKey' then
      if not (p_input ? 'beforeAt' and p_input ? 'beforeKey')
         or jsonb_typeof(p_input->'beforeAt') <> 'string'
         or jsonb_typeof(p_input->'beforeKey') <> 'string'
         or length(p_input->>'beforeKey') not between 4 and 120 then
        raise exception 'Invalid audit cursor' using errcode='22023';
      end if;
      begin v_before := (p_input->>'beforeAt')::timestamptz;
      exception when others then raise exception 'Invalid audit cursor' using errcode='22023'; end;
      v_before_key := p_input->>'beforeKey';
    end if;
    with events as (
      select 'sale'::text as kind,'sale:'||s.id::text as event_key,s.cashier_id as actor_id,
        s.store_id,null::uuid as product_id,null::bigint as quantity_delta,
        null::bigint as quantity_after,'Receipt #'||s.receipt_number::text as detail,
        s.id::text as source_id,s.total_minor::text as amount_minor,
        s.recorded_at as occurred_at,s.client_recorded_at as device_reported_at
      from public.shop_sales s where s.business_id=v_company
      union all
      select 'stock'::text,'movement:'||m.id::text,m.actor_id,m.store_id,m.product_id,
        m.delta::bigint,m.quantity_after::bigint,
        m.reason||coalesce(' · '||m.note,''),coalesce(m.sale_id::text,m.operation_id::text,m.id::text),
        null::text,m.recorded_at,null::timestamptz
      from public.shop_stock_movements m where m.business_id=v_company
      union all
      select 'refund'::text,'refund:'||r.id::text,r.actor_id,s.store_id,null::uuid,
        null::bigint,null::bigint,coalesce(r.reason,'Refund'),r.id::text,r.amount_minor::text,
        r.recorded_at,null::timestamptz
      from public.shop_refunds r join public.shop_sales s on s.id=r.sale_id and s.business_id=r.business_id
      where r.business_id=v_company
      union all
      select 'stock_count_open'::text,'stock-count-open:'||c.id::text,c.created_by,c.store_id,c.product_id,
        null::bigint,c.expected_quantity::bigint,'Physical count opened',c.id::text,null::text,
        c.created_at,null::timestamptz
      from public.shop_stock_counts c where c.business_id=v_company
      union all
      select 'stock_count_applied'::text,'stock-count-applied:'||c.id::text,c.applied_by,c.store_id,c.product_id,
        (c.counted_quantity-c.expected_quantity)::bigint,c.counted_quantity::bigint,
        'Physical count applied',c.id::text,null::text,c.applied_at,null::timestamptz
      from public.shop_stock_counts c where c.business_id=v_company and c.status='applied'
      union all
      select 'stock_received'::text,'purchase-receipt:'||r.id::text,r.actor_id,o.store_id,null::uuid,
        null::bigint,null::bigint,'Supplier goods received',r.id::text,null::text,r.recorded_at,null::timestamptz
      from public.shop_purchase_receipts r join public.shop_purchase_orders o on o.id=r.order_id
        and o.business_id=r.business_id where r.business_id=v_company
      union all
      select 'expense'::text,'expense:'||e.id::text,e.recorded_by,e.store_id,null::uuid,
        null::bigint,null::bigint,e.category||coalesce(' · '||e.note,''),e.id::text,
        e.amount_minor::text,e.recorded_at,null::timestamptz
      from public.shop_expenses e where e.business_id=v_company
      union all
      select 'shift_'||e.event_type,'shift-event:'||e.id::text,e.actor_id,s.store_id,null::uuid,
        null::bigint,null::bigint,'Shift '||e.event_type,e.shift_id::text,null::text,
        e.occurred_at,null::timestamptz
      from public.shop_staff_shift_events e join public.shop_staff_shifts s on s.id=e.shift_id
        where e.business_id=v_company
    ), filtered as (
      select * from events
      where (v_store is null or store_id=v_store)
        and (v_before is null or (occurred_at,event_key)<(v_before,v_before_key))
      order by occurred_at desc,event_key desc limit (v_limit+1)
    ), page as (
      select * from filtered order by occurred_at desc,event_key desc limit v_limit
    )
    select jsonb_build_object(
      'events',coalesce((select jsonb_agg(jsonb_build_object(
        'kind',p.kind,'eventKey',p.event_key,'actorId',p.actor_id,
        'storeId',p.store_id,'productId',p.product_id,'delta',p.quantity_delta,
        'quantityAfter',p.quantity_after,'detail',p.detail,'sourceId',p.source_id,
        'amountMinor',p.amount_minor,'serverRecordedAt',p.occurred_at,
        'deviceReportedAt',p.device_reported_at) order by p.occurred_at desc,p.event_key desc)
        from page p),'[]'::jsonb),
      'hasMore',(select count(*)>v_limit from filtered),
      'next',case when (select count(*)>v_limit from filtered) then
        (select jsonb_build_object('beforeAt',p.occurred_at,'beforeKey',p.event_key)
         from page p order by p.occurred_at,p.event_key limit 1) else null end
    ) into v_result;
    return v_result;
  end if;

  -- Serialize transitions: concurrent tabs cannot open two shifts or
  -- acknowledge two different closing amounts.
  perform 1 from public.businesses where id=v_company for update;
  if not found then raise exception 'Business access denied' using errcode='42501'; end if;

  if p_action = 'openShift' then
    v_shift_id := private.shop_uuid(p_input,'shiftId');
    v_store := private.shop_uuid(p_input,'storeId');
    v_open_cash := private.shop_int(p_input,'openingCashMinor',0,100000000000000);
    v_note := nullif(btrim(coalesce(p_input->>'note','')),'');
    if v_note is not null and length(v_note) not between 4 and 240 then
      raise exception 'Opening note must be 4 to 240 characters' using errcode='22023'; end if;
    perform 1 from public.shop_stores where business_id=v_company and id=v_store and status='active';
    if not found then raise exception 'Store unavailable' using errcode='42501'; end if;
    if v_role='attendant' and not exists (
        select 1 from public.shop_store_assignments where business_id=v_company
          and store_id=v_store and user_id=p_actor) then
      raise exception 'You are not assigned to this store' using errcode='42501'; end if;
    select * into v_shift from public.shop_staff_shifts where id=v_shift_id for update;
    if found then
      if v_shift.business_id<>v_company or v_shift.staff_id<>p_actor
         or v_shift.store_id<>v_store or v_shift.opening_cash_minor<>v_open_cash
         or v_shift.opening_note is distinct from v_note then
        raise exception 'Shift ID already belongs to a different opening' using errcode='23505';
      end if;
      return jsonb_build_object('shiftId',v_shift_id,'openedAt',v_shift.opened_at,
        'closedAt',v_shift.closed_at,'replayed',true);
    end if;
    if exists (select 1 from public.shop_staff_shifts
        where business_id=v_company and staff_id=p_actor and closed_at is null) then
      raise exception 'Close your existing shift before starting another' using errcode='23505'; end if;
    insert into public.shop_staff_shifts(id,business_id,store_id,staff_id,opening_cash_minor,opening_note)
      values(v_shift_id,v_company,v_store,p_actor,v_open_cash,v_note) returning * into v_shift;
    insert into public.shop_staff_shift_events(business_id,shift_id,actor_id,event_type,facts)
      values(v_company,v_shift_id,p_actor,'opened',jsonb_build_object('openingCashMinor',v_open_cash::text,'note',v_note));
    return jsonb_build_object('shiftId',v_shift_id,'openedAt',v_shift.opened_at,'closedAt',null,'replayed',false);
  end if;

  if p_action in ('closeShift','forceCloseShift') then
    v_shift_id := private.shop_uuid(p_input,'shiftId');
    v_close_cash := private.shop_int(p_input,'closingCashMinor',0,100000000000000);
    v_note := nullif(btrim(coalesce(p_input->>'note','')),'');
    if p_action='forceCloseShift' then
      if v_role<>'owner' then raise exception 'Only the owner can close another employee shift' using errcode='42501'; end if;
      if v_note is null or length(v_note) not between 10 and 240 then
        raise exception 'An owner override requires a reason of 10 to 240 characters' using errcode='22023'; end if;
    elsif v_note is not null and length(v_note) not between 4 and 240 then
      raise exception 'Closing note must be 4 to 240 characters' using errcode='22023'; end if;
    select * into v_shift from public.shop_staff_shifts where business_id=v_company and id=v_shift_id for update;
    if not found then raise exception 'Shift does not exist' using errcode='42501'; end if;
    if p_action='closeShift' and v_shift.staff_id<>p_actor then
      raise exception 'Only the original cashier can close this shift' using errcode='42501'; end if;
    if v_shift.closed_at is not null then
      if v_shift.closed_by<>p_actor or v_shift.forced_close<>(p_action='forceCloseShift')
         or v_shift.closing_cash_minor<>v_close_cash or v_shift.closing_note is distinct from v_note then
        raise exception 'Shift was already closed with different details' using errcode='23505'; end if;
      return jsonb_build_object('shiftId',v_shift_id,'closedAt',v_shift.closed_at,'replayed',true);
    end if;
    update public.shop_staff_shifts set closed_at=clock_timestamp(),closed_by=p_actor,
      forced_close=p_action='forceCloseShift',closing_cash_minor=v_close_cash,closing_note=v_note
      where business_id=v_company and id=v_shift_id returning * into v_shift;
    insert into public.shop_staff_shift_events(business_id,shift_id,actor_id,event_type,facts)
      values(v_company,v_shift_id,p_actor,case when p_action='forceCloseShift' then 'force_closed' else 'closed' end,
        jsonb_build_object('closingCashMinor',v_close_cash::text,'note',v_note));
    return jsonb_build_object('shiftId',v_shift_id,'closedAt',v_shift.closed_at,'replayed',false);
  end if;

  if p_action = 'reviewShift' then
    if v_role<>'owner' then raise exception 'Only the business owner can review a shift' using errcode='42501'; end if;
    v_shift_id := private.shop_uuid(p_input,'shiftId');
    v_decision := p_input->>'decision';
    v_note := nullif(btrim(coalesce(p_input->>'note','')),'');
    if v_decision not in ('accepted','needs-investigation') or v_decision is null then
      raise exception 'Invalid review decision' using errcode='22023'; end if;
    if v_note is null or length(v_note) not between 4 and 240 then
      raise exception 'A review note of 4 to 240 characters is required' using errcode='22023'; end if;
    select * into v_shift from public.shop_staff_shifts where business_id=v_company and id=v_shift_id for update;
    if not found then raise exception 'Shift does not exist' using errcode='42501'; end if;
    if v_shift.closed_at is null then raise exception 'Close the shift before reviewing it' using errcode='23514'; end if;
    if v_shift.reviewed_at is not null then
      if v_shift.reviewed_by<>p_actor or v_shift.review_decision<>v_decision
         or v_shift.review_note<>v_note then
        raise exception 'Shift already reviewed with different details' using errcode='23505'; end if;
      return jsonb_build_object('shiftId',v_shift_id,'reviewedAt',v_shift.reviewed_at,'replayed',true);
    end if;
    update public.shop_staff_shifts set reviewed_at=clock_timestamp(),reviewed_by=p_actor,
      review_decision=v_decision,review_note=v_note
      where business_id=v_company and id=v_shift_id returning * into v_shift;
    insert into public.shop_staff_shift_events(business_id,shift_id,actor_id,event_type,facts)
      values(v_company,v_shift_id,p_actor,'reviewed',jsonb_build_object('decision',v_decision,'note',v_note));
    return jsonb_build_object('shiftId',v_shift_id,'reviewedAt',v_shift.reviewed_at,'replayed',false);
  end if;
  raise exception 'Unknown shift action' using errcode='22023';
end $fn$;
revoke all on function private.shop_stage_q_shift_action(text,uuid,uuid,jsonb) from public,anon,authenticated;

create function public.tallybook_shop_shifts(p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare actor uuid:=auth.uid();sid uuid;
begin
  begin sid:=(auth.jwt()->>'session_id')::uuid;
  exception when others then sid:=null; end;
  return private.shop_stage_q_shift_action(p_action,actor,sid,p_input);
end $fn$;
revoke all on function public.tallybook_shop_shifts(text,jsonb) from public,anon,authenticated;
grant execute on function public.tallybook_shop_shifts(text,jsonb) to authenticated;

commit;
