-- Destructive reversal of 20261111180000_shop_staff_shifts_audit.sql.
-- WARNING: this removes stored shift openings/closings and audit events.
-- Existing shop sales, stock movements, refunds and accounts are not touched.
begin;
drop function if exists public.tallybook_shop_shifts(text,jsonb);
drop function if exists private.shop_stage_q_shift_action(text,uuid,uuid,jsonb);
drop table if exists public.shop_staff_shift_events;
drop table if exists public.shop_staff_shifts;
commit;
