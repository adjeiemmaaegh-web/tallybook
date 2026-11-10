-- Two indexes that match how sales are actually read.
--
-- Not every "unindexed foreign key" the Supabase advisor reports needs an
-- index: reads by sale_id are already served by the (sale_id, ...) primary and
-- unique keys, and the referenced parents are append-only, so extra indexes
-- there would only slow writes. These two are real gaps:
--
--  1. Owner views list sales across ALL stores newest-first. The existing
--     indexes lead with (business_id, store_id) or (business_id, cashier_id),
--     so an all-store, time-ordered page needs a sort of every sale.
--  2. Filtering sales by customer has no index on customer_id at all.
--
-- Rollback: supabase/rollback/20261110120000_shop_sales_hot_path_indexes_down.sql
begin;

create index shop_sales_business_time
  on public.shop_sales (business_id, recorded_at desc, receipt_number desc);

create index shop_sales_customer_time
  on public.shop_sales (business_id, customer_id, recorded_at desc)
  where customer_id is not null;

commit;
