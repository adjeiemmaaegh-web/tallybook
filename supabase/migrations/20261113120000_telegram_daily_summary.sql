-- Scheduled daily summary push for the Telegram bot.
--
-- Adds a per-chat "already sent today" marker and one service-role function that
-- atomically claims the chats whose shop has `daily_summary` on and that have
-- not yet had today's summary, marks them sent, and returns each one's
-- read-only /today figures (role-scoped: an owner sees the whole shop, an
-- attendant only their own sales). The Edge Function's `/cron` route calls it
-- and sends each summary; pg_cron (with pg_net) calls that route on a schedule.
-- See supabase/functions/tallybook-telegram/README.md.
--
-- Marking-first is deliberate: a daily summary is better missed once (if the
-- send fails) than sent twice. `for update ... skip locked` keeps concurrent or
-- retried runs from claiming the same chat. Nothing is written to the ledger.
--
-- "Today" is the UTC calendar day, which is local time in Ghana (GMT, no DST),
-- matching `telegram_bot_today`.
--
-- Rollback: supabase/rollback/20261113120000_telegram_daily_summary_down.sql
begin;

alter table public.telegram_links
  add column last_daily_summary_date date;

create function public.telegram_bot_claim_daily_summaries(p_max integer default 500)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_today date := (now() at time zone 'UTC')::date;
  v_from timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  v_to timestamptz := v_from + interval '1 day';
  v_rows jsonb;
begin
  if p_max is null or p_max < 1 or p_max > 5000 then
    raise exception 'Invalid p_max' using errcode = '22023';
  end if;
  with due as (
    select l.chat_id, l.business_id, l.role, l.user_id
      from public.telegram_links l
      join public.bot_capabilities c
        on c.business_id = l.business_id and c.daily_summary
     where l.status = 'active'
       and (l.last_daily_summary_date is null or l.last_daily_summary_date < v_today)
     order by l.chat_id
     limit p_max
       for update of l skip locked
  ),
  claimed as (
    update public.telegram_links l
       set last_daily_summary_date = v_today
      from due
     where l.chat_id = due.chat_id
     returning due.chat_id, due.business_id, due.role, due.user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'chatId', x.chat_id::text,
      'businessName', b.name,
      'currency', lg.currency,
      'role', x.role,
      'date', v_today,
      'count', agg.n,
      'grossMinor', agg.gross::text) order by x.chat_id), '[]'::jsonb)
    into v_rows
    from claimed x
    join public.businesses b on b.id = x.business_id
    left join public.shop_ledgers lg on lg.business_id = x.business_id
    left join lateral (
      select count(*) as n, coalesce(sum(s.total_minor), 0) as gross
        from public.shop_sales s
       where s.business_id = x.business_id
         and s.recorded_at >= v_from and s.recorded_at < v_to
         and (x.role = 'owner' or s.cashier_id = x.user_id)
    ) agg on true;
  return jsonb_build_object('date', v_today, 'summaries', v_rows);
end $fn$;
revoke all on function public.telegram_bot_claim_daily_summaries(integer) from public, anon, authenticated;
grant execute on function public.telegram_bot_claim_daily_summaries(integer) to service_role;

commit;
