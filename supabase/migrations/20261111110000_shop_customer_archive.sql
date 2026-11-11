-- Customer archive: hide a customer who no longer buys on credit.
--
-- Owner-only. A customer can be archived only when they owe nothing; their
-- history, receipts and statement stay exactly as they were, and archiving can
-- be undone. Archived customers are left out of the customer list and the till,
-- and the database itself refuses a new credit sale to one. Editing a
-- customer's name or phone already exists (saveCustomer, owner only).
--
-- Rollback: supabase/rollback/20261111110000_shop_customer_archive_down.sql
begin;

create table public.shop_customer_archive (
  business_id uuid not null,
  customer_id uuid not null,
  archived_by uuid not null references auth.users(id),
  archived_at timestamptz not null default now(),
  primary key (business_id, customer_id),
  foreign key (business_id, customer_id) references public.shop_customers(business_id, id)
);
alter table public.shop_customer_archive enable row level security;
alter table public.shop_customer_archive force row level security;
revoke all on table public.shop_customer_archive from public, anon, authenticated;

-- A sale carries a customer only when part of it is on credit. Refuse new credit
-- sales to an archived customer, wherever the sale is recorded from.
create function private.shop_block_archived_customer_sale() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.customer_id is not null and exists (select 1 from public.shop_customer_archive a
      where a.business_id = new.business_id and a.customer_id = new.customer_id) then
    raise exception 'This customer has been archived. Restore them before selling on credit.' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.shop_block_archived_customer_sale() from public, anon, authenticated;
create trigger shop_sales_archived_customer before insert on public.shop_sales
  for each row execute function private.shop_block_archived_customer_sale();

create function private.shop_stage_j_customer_admin(
  p_action text, p_actor uuid, p_session uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_company uuid;
  v_role text;
  v_customer uuid;
  v_cust public.shop_customers;
begin
  if jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'Valid request required' using errcode = '22023';
  end if;
  v_company := private.shop_uuid(p_input, 'companyId');
  v_role := private.shop_member_role(p_actor, p_session, v_company);

  if p_action = 'archivedCustomers' then
    return jsonb_build_object('customerIds', coalesce((
      select jsonb_agg(a.customer_id order by a.archived_at, a.customer_id)
      from public.shop_customer_archive a where a.business_id = v_company), '[]'::jsonb));
  end if;

  if v_role <> 'owner' then raise exception 'Only the business owner can do this' using errcode = '42501'; end if;
  v_customer := private.shop_uuid(p_input, 'customerId');
  -- The same row lock a credit sale takes, so an archive never interleaves with a sale.
  select * into v_cust from public.shop_customers where id = v_customer and business_id = v_company for update;
  if not found then raise exception 'Customer not found' using errcode = '42501'; end if;

  if p_action = 'archiveCustomer' then
    if v_cust.balance_minor <> 0 then
      raise exception '% still owes money. Record their payments before archiving.', v_cust.name using errcode = '23514';
    end if;
    insert into public.shop_customer_archive (business_id, customer_id, archived_by)
      values (v_company, v_customer, p_actor) on conflict do nothing;
    return jsonb_build_object('customerId', v_customer, 'archived', true);
  end if;

  delete from public.shop_customer_archive where business_id = v_company and customer_id = v_customer;
  return jsonb_build_object('customerId', v_customer, 'archived', false);
end $fn$;
revoke all on function private.shop_stage_j_customer_admin(text, uuid, uuid, jsonb) from public, anon, authenticated;

-- Router: previous baseline (20261111100000) plus the archive actions.
create or replace function public.tallybook_shop_ops(p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $body$
declare actor uuid:=auth.uid();sid uuid;
begin
  begin sid:=(auth.jwt()->>'session_id')::uuid;
  exception when others then sid:=null; end;
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
