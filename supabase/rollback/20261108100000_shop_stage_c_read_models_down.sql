-- Reverses 20261108100000_shop_stage_c_read_models.sql: removes the
-- tallybook_shop_ops router and the readiness / sales-summary function.
-- No data is touched. The app's setup checklist and dashboard summary then
-- fall back to what older servers offered.
begin;
drop function if exists public.tallybook_shop_ops(text, jsonb);
drop function if exists private.shop_stage_c_action(text, uuid, uuid, jsonb);
commit;
