-- Read-only management views, each evaluated under caller RLS; PostgreSQL 15+.
create or replace view public.tb_owner_shift_variance with (security_invoker=true) as
select business_id,shop_id,staff_id,date_trunc('week',opened_at_device) as week_utc,
 count(*) as shifts,
 sum(coalesce(variance_minor,0)) as variance_minor,
 count(*) filter (where variance_minor is not null) as counted_shifts
from public.tb_shifts group by business_id,shop_id,staff_id,date_trunc('week',opened_at_device);
create or replace view public.tb_owner_adjustment_counts with (security_invoker=true) as
select business_id,shop_id,staff_id,date_trunc('week',occurred_at_device) as week_utc,
 count(*) filter(where kind in ('void','full_reversal')) as void_count,
 count(*) filter(where kind in ('return','partial_refund')) as return_refund_count,
 count(*) filter(where kind='discount') as discount_count
from public.tb_adjustments group by business_id,shop_id,staff_id,date_trunc('week',occurred_at_device);
create or replace view public.tb_owner_no_sale_counts with (security_invoker=true) as
select business_id,shop_id,staff_id,date_trunc('week',occurred_at_device) as week_utc,
 count(*) as drawer_events
from public.tb_drawer_events group by business_id,shop_id,staff_id,date_trunc('week',occurred_at_device);
create or replace view public.tb_owner_momo_claims with (security_invoker=true) as
select business_id,shop_id,provider_id,merchant_account_id,reference,amount_minor,settlement_status,received_at_server
from public.tb_payments where method='mobile';
revoke all on public.tb_owner_shift_variance,public.tb_owner_adjustment_counts,public.tb_owner_no_sale_counts,public.tb_owner_momo_claims from anon;
grant select on public.tb_owner_shift_variance,public.tb_owner_adjustment_counts,public.tb_owner_no_sale_counts,public.tb_owner_momo_claims to authenticated;
-- No write RPC granted here. Server-side ingestion must be implemented and security-tested separately.
