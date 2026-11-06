-- Backend Stage C: read-only owner/employee readiness and scoped dashboard
-- projection. This is a NEW RPC; it never changes existing checkout routes.
-- Depends on the three shared-shop migrations and Stage B return policy.
-- Source-only: never apply to production without a reviewed staging migration.
begin;

create function private.shop_stage_c_action(
  p_action text, p_actor uuid, p_session uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_company uuid;
  v_role text;
  v_store uuid;
  v_days bigint;
  v_currency text;
  v_stores bigint;
  v_products bigint;
  v_stocked bigint;
  v_sales bigint;
  v_staff bigint;
  v_gross numeric;
  v_refunds numeric;
  v_credit numeric;
begin
  if jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'Valid request required' using errcode = '22023';
  end if;
  v_company := private.shop_uuid(p_input, 'companyId');
  -- Verifies active session, current membership and owner identity in DB,
  -- not a stale browser role or a client-controlled JWT metadata field.
  v_role := private.shop_member_role(p_actor, p_session, v_company);
  if p_action = 'readiness' then
    select l.currency into v_currency from public.shop_ledgers l where l.business_id=v_company;
    select count(*) into v_stores from public.shop_stores st
      where st.business_id=v_company and st.status='active'
      and (v_role='owner' or exists (
        select 1 from public.shop_store_assignments a
          where a.business_id=v_company and a.store_id=st.id and a.user_id=p_actor));
    select count(*) into v_products from public.shop_products p
      where p.business_id=v_company and p.active;
    select count(*) into v_stocked from public.shop_store_stock ss
      where ss.business_id=v_company and ss.quantity>0
      and (v_role='owner' or exists (
        select 1 from public.shop_store_assignments a
        where a.business_id=v_company and a.store_id=ss.store_id and a.user_id=p_actor));
    select count(*) into v_sales from public.shop_sales s where s.business_id=v_company
      and (v_role='owner' or exists (
        select 1 from public.shop_store_assignments a
        where a.business_id=v_company and a.store_id=s.store_id and a.user_id=p_actor));
    select count(*) into v_staff from public.business_members m
      where m.business_id=v_company and m.role='attendant';
    return jsonb_build_object(
      'companyId',v_company,'role',v_role,'currency',v_currency,
      'ledgerConfigured',v_currency is not null,
      'activeStoreCount',v_stores,'activeProductCount',v_products,
      'stockedSkuCount',v_stocked,'saleCount',v_sales,
      'staffCount',case when v_role='owner' then v_staff else null end,
      'canConfigure',v_role='owner',
      'steps',jsonb_build_array(
        jsonb_build_object('key','ledger','complete',v_currency is not null),
        jsonb_build_object('key','store','complete',v_stores>0),
        jsonb_build_object('key','product','complete',v_products>0),
        jsonb_build_object('key','stock','complete',v_stocked>0),
        jsonb_build_object('key','firstSale','complete',v_sales>0)));
  end if;
  if p_action = 'salesSummary' then
    v_days := case when p_input ? 'days'
      then private.shop_int(p_input,'days',1,31) else 7 end;
    if p_input ? 'storeId' then
      v_store := private.shop_uuid(p_input,'storeId');
      perform 1 from public.shop_stores where business_id=v_company and id=v_store;
      if not found then raise exception 'Store access denied' using errcode='42501'; end if;
      if v_role<>'owner' and not exists (
        select 1 from public.shop_store_assignments
          where business_id=v_company and store_id=v_store and user_id=p_actor)
      then raise exception 'Store access denied' using errcode='42501'; end if;
    end if;
    select currency into v_currency from public.shop_ledgers where business_id=v_company;
    select count(*),coalesce(sum(s.total_minor),0)
      into v_sales,v_gross from public.shop_sales s
      where s.business_id=v_company and s.recorded_at>=clock_timestamp()-make_interval(days=>v_days::int)
      and (v_store is null or s.store_id=v_store)
      and (v_role='owner' or exists (
        select 1 from public.shop_store_assignments a
          where a.business_id=v_company and a.store_id=s.store_id and a.user_id=p_actor));
    select coalesce(sum(r.amount_minor),0) into v_refunds
      from public.shop_refunds r
      join public.shop_sales s on s.id=r.sale_id and s.business_id=r.business_id
      where r.business_id=v_company and r.recorded_at>=clock_timestamp()-make_interval(days=>v_days::int)
      and (v_store is null or s.store_id=v_store)
      and (v_role='owner' or exists (
        select 1 from public.shop_store_assignments a
          where a.business_id=v_company and a.store_id=s.store_id and a.user_id=p_actor));
    -- Credit is a company-wide customer exposure; never leak it to attendants
    -- who are assigned only a subset of stores.
    if v_role='owner' then
      select coalesce(sum(balance_minor),0) into v_credit
        from public.shop_customers where business_id=v_company;
    end if;
    return jsonb_build_object('companyId',v_company,'role',v_role,
      'days',v_days,'storeId',v_store,'currency',v_currency,
      'salesCount',v_sales,'grossMinor',v_gross::text,
      'refundMinor',v_refunds::text,
      'netSalesMinor',(v_gross-v_refunds)::text,
      'customerCreditOutstandingMinor',case when v_role='owner' then v_credit::text else null end);
  end if;
  raise exception 'Unknown shop operations action' using errcode='42501';
end $fn$;

revoke all on function private.shop_stage_c_action(text,uuid,uuid,jsonb)
  from public,anon,authenticated;

create function public.tallybook_shop_ops(p_action text, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $body$
declare
  actor uuid := auth.uid();
  sid uuid;
begin
  begin sid := (auth.jwt()->>'session_id')::uuid;
  exception when others then sid := null;
  end;
  return private.shop_stage_c_action(p_action,actor,sid,p_input);
end $body$;

revoke all on function public.tallybook_shop_ops(text,jsonb) from public,anon;
grant execute on function public.tallybook_shop_ops(text,jsonb) to authenticated;

commit;
