-- Deny-by-default: browser roles may not mutate central finance. Apply only to isolated test project.
-- Membership provisioning is via trusted administration, never self-service INSERT.
do $$
declare t text;
begin
 for t in select unnest(array[
   'tb_businesses','tb_shops','tb_staff','tb_memberships','tb_shop_assignments','tb_devices',
   'tb_shifts','tb_sales','tb_sale_lines','tb_payments','tb_adjustments','tb_drawer_events',
   'tb_cash_counts','tb_sync_operations','tb_audit_events'
 ]) loop
   execute format('alter table public.%I enable row level security', t);
   execute format('revoke all on public.%I from anon, authenticated', t);
 end loop;
end $$;
-- Staff can see only THEIR own membership row, which serves as the nonrecursive RLS root.
create policy tb_membership_self_read on public.tb_memberships
 for select to authenticated using (auth_user_id = (select auth.uid()));
grant select on public.tb_memberships to authenticated;
-- An authenticated owner/manager can inspect authorized business and shop operational data.
-- Attendant select scopes need a separate review; for now they cannot browse central finance.
create policy tb_business_owner_read on public.tb_businesses
 for select to authenticated using (
   exists (select 1 from public.tb_memberships m
           where m.business_id=id and m.auth_user_id=(select auth.uid())
             and m.active and m.role in ('owner','manager'))
 );
grant select on public.tb_businesses to authenticated;
do $$
declare t text;
begin
 for t in select unnest(array[
 'tb_shops','tb_staff','tb_shop_assignments','tb_devices','tb_shifts','tb_sales',
 'tb_sale_lines','tb_payments','tb_adjustments','tb_drawer_events','tb_cash_counts',
 'tb_sync_operations','tb_audit_events'
 ]) loop
   execute format('create policy tb_owner_read on public.%I for select to authenticated using (exists (select 1 from public.tb_memberships m where m.business_id = %I.business_id and m.auth_user_id = (select auth.uid()) and m.active and m.role in (''owner'',''manager'')))',t,t);
   execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
-- Do NOT create a direct INSERT policy. A browser-supplied business ID, shop ID,
-- device ID, staff ID or UUID is not authorization; a trusted ingestion API is needed.
