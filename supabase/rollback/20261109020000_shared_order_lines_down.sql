-- Reverses 20261109020000_shared_order_lines.sql: removes the owner-only
-- order-line read function. No data is touched.
begin;
drop function if exists public.tallybook_shop_order_lines(text, jsonb);
commit;
