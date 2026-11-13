-- Reverses 20261113120000_telegram_daily_summary.sql: drops the daily-summary
-- claim function and the per-chat "sent today" marker. WARNING: the record of
-- which chats already had today's summary is lost, so the first run after this
-- could send today's summary again. Does not touch the shop RPCs or any ledger
-- data. Nothing to re-create: the migration only added new objects.
begin;

drop function if exists public.telegram_bot_claim_daily_summaries(integer);

alter table public.telegram_links
  drop column if exists last_daily_summary_date;

commit;
