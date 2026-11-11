-- Reverses 20261110120000_shop_sales_hot_path_indexes.sql. Safe at any time:
-- it only drops indexes, so no data changes.
begin;
drop index if exists public.shop_sales_customer_time;
drop index if exists public.shop_sales_business_time;
commit;
