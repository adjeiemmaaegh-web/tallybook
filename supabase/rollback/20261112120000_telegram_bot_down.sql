-- Reverses 20261112120000_telegram_bot.sql: drops the Telegram bot functions
-- and tables. WARNING: every chat link, the owner-chosen capability flags and
-- the record of which link codes were used are deleted. This does not touch the
-- shop RPC router or any shop/sales data. Does not re-create anything, because
-- the migration only added new objects.
begin;

drop function if exists public.telegram_bot_unlink(bigint);
drop function if exists public.telegram_bot_set_capability(bigint, text, boolean, bigint);
drop function if exists public.telegram_bot_today(bigint);
drop function if exists public.telegram_bot_context(bigint);
drop function if exists public.telegram_bot_begin_link(bigint, text, bigint, text);
drop function if exists private.telegram_bot_link(bigint);
drop function if exists public.tallybook_telegram_ops(text, jsonb);
drop function if exists private.shop_stage_q_telegram(text, uuid, uuid, jsonb);
drop function if exists private.telegram_capabilities_json(uuid);

drop table if exists public.telegram_link_codes;
drop table if exists public.bot_capabilities;
drop table if exists public.telegram_links;

commit;
