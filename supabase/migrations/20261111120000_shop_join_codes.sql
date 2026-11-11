-- Short join codes: an employee types an 8-character code to join a shop.
--
-- The owner makes a code (Team tab). It is shown once, kept only as a hash,
-- works once, and expires after 24 hours; at most 5 can be open at a time and
-- the owner can cancel any. Whoever is signed in and enters it becomes an
-- attendant, with no permissions and no store until the owner grants them.
-- Wrong guesses are recorded; five in 15 minutes lock that account out for the
-- rest of the 15 minutes. The email invitation flow is untouched.
--
-- Rollback: supabase/rollback/20261111120000_shop_join_codes_down.sql
begin;

create table public.shop_join_codes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  code_sha256 text not null unique check (code_sha256 ~ '^[a-f0-9]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'used', 'revoked')),
  used_by uuid references auth.users(id),
  used_at timestamptz,
  check ((status = 'used') = (used_by is not null))
);
create index shop_join_codes_business on public.shop_join_codes (business_id, created_at desc);
create table public.shop_join_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  attempted_at timestamptz not null default now()
);
create index shop_join_attempts_user on public.shop_join_attempts (user_id, attempted_at desc);
do $$
declare tbl text;
begin
  foreach tbl in array array['shop_join_codes', 'shop_join_attempts'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('alter table public.%I force row level security', tbl);
    execute format('revoke all on table public.%I from public, anon, authenticated', tbl);
  end loop;
end $$;

create function private.shop_stage_k_join_code(
  p_action text, p_actor uuid, p_session uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  at_time timestamptz := clock_timestamp();
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_company uuid;
  v_role text;
  v_owner uuid;
  v_code text;
  v_hash text;
  v_bytes bytea;
  v_idx integer;
  v_row public.shop_join_codes;
  v_id uuid;
  v_n integer;
begin
  if jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'Valid request required' using errcode = '22023';
  end if;

  if p_action = 'joinWithCode' then
    if p_actor is null or p_session is null then raise exception 'Authenticated account required' using errcode = '42501'; end if;
    perform 1 from auth.sessions s where s.id = p_session and s.user_id = p_actor
      and (s.not_after is null or s.not_after > at_time) for share;
    if not found then raise exception 'Active Auth session required' using errcode = '42501'; end if;
    delete from public.shop_join_attempts where attempted_at < at_time - interval '1 day';
    select count(*) into v_n from public.shop_join_attempts
      where user_id = p_actor and attempted_at > at_time - interval '15 minutes';
    -- Wrong guesses are recorded and answered normally (never raised), so they survive the transaction.
    if v_n >= 5 then return jsonb_build_object('joined', false, 'reason', 'locked'); end if;
    v_code := upper(regexp_replace(coalesce(p_input->>'code', ''), '[\s-]', '', 'g'));
    if v_code !~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$' then
      insert into public.shop_join_attempts (user_id) values (p_actor);
      return jsonb_build_object('joined', false, 'reason', 'invalid');
    end if;
    v_hash := encode(sha256(convert_to('tallybook-join-v1:' || v_code, 'UTF8')), 'hex');
    select * into v_row from public.shop_join_codes where code_sha256 = v_hash for update;
    if not found or v_row.status <> 'pending' or v_row.expires_at <= at_time then
      insert into public.shop_join_attempts (user_id) values (p_actor);
      return jsonb_build_object('joined', false, 'reason', 'invalid');
    end if;
    select b.owner_id into v_owner from public.businesses b where b.id = v_row.business_id for update;
    if v_owner is null or v_owner <> v_row.created_by or not exists (
        select 1 from public.business_members m where m.business_id = v_row.business_id and m.user_id = v_owner and m.role = 'owner') then
      insert into public.shop_join_attempts (user_id) values (p_actor);
      return jsonb_build_object('joined', false, 'reason', 'invalid');
    end if;
    if p_actor = v_owner or exists (select 1 from public.business_members m where m.business_id = v_row.business_id and m.user_id = p_actor) then
      return jsonb_build_object('joined', false, 'reason', 'already-member');
    end if;
    insert into public.business_members (business_id, user_id, role) values (v_row.business_id, p_actor, 'attendant');
    update public.shop_join_codes set status = 'used', used_by = p_actor, used_at = at_time where id = v_row.id;
    insert into public.company_membership_audit (company_id, actor_id, target_user_id, event_type, invitation_id, event_at)
      values (v_row.business_id, p_actor, p_actor, 'accepted', null, at_time);
    return jsonb_build_object('joined', true, 'companyId', v_row.business_id, 'userId', p_actor);
  end if;

  v_company := private.shop_uuid(p_input, 'companyId');
  v_role := private.shop_member_role(p_actor, p_session, v_company);
  if v_role <> 'owner' then raise exception 'Only the business owner can do this' using errcode = '42501'; end if;

  if p_action = 'listJoinCodes' then
    return jsonb_build_object('codes', coalesce((
      select jsonb_agg(jsonb_build_object('codeId', x.id, 'status', case when x.status = 'pending' and x.expires_at <= at_time then 'expired' else x.status end,
        'createdAt', x.created_at, 'expiresAt', x.expires_at, 'usedBy', x.used_by, 'usedAt', x.used_at)
        order by x.created_at desc, x.id)
      from (select * from public.shop_join_codes where business_id = v_company order by created_at desc, id limit 20) x), '[]'::jsonb));
  end if;

  if p_action = 'revokeJoinCode' then
    v_id := private.shop_uuid(p_input, 'codeId');
    update public.shop_join_codes set status = 'revoked' where id = v_id and business_id = v_company and status = 'pending';
    if not found then raise exception 'That code is no longer open' using errcode = '23514'; end if;
    return jsonb_build_object('codeId', v_id, 'revoked', true);
  end if;

  -- createJoinCode
  perform 1 from public.businesses where id = v_company for update;
  select count(*) into v_n from public.shop_join_codes
    where business_id = v_company and status = 'pending' and expires_at > at_time;
  if v_n >= 5 then raise exception 'There are already 5 open join codes. Cancel one first.' using errcode = '23514'; end if;
  v_bytes := uuid_send(gen_random_uuid());
  v_code := '';
  foreach v_idx in array array[0, 1, 2, 3, 4, 5, 9, 10] loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, v_idx) & 31) + 1, 1);
  end loop;
  v_hash := encode(sha256(convert_to('tallybook-join-v1:' || v_code, 'UTF8')), 'hex');
  insert into public.shop_join_codes (business_id, code_sha256, created_by, created_at, expires_at)
    values (v_company, v_hash, p_actor, at_time, at_time + interval '24 hours') returning id into v_id;
  return jsonb_build_object('codeId', v_id, 'code', v_code, 'expiresAt', at_time + interval '24 hours');
end $fn$;
revoke all on function private.shop_stage_k_join_code(text, uuid, uuid, jsonb) from public, anon, authenticated;

-- Router: previous baseline (20261111110000) plus the join-code actions.
create or replace function public.tallybook_shop_ops(p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $body$
declare actor uuid:=auth.uid();sid uuid;
begin
  begin sid:=(auth.jwt()->>'session_id')::uuid;
  exception when others then sid:=null; end;
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
