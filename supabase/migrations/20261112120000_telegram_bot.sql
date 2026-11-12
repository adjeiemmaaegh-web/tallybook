-- Dedicated Tallybook Telegram bot (v1): account linking, owner-chosen
-- capabilities and a read-only daily/on-demand summary. This is a NEW bot,
-- separate from any other product's alert bot.
--
-- Trust model, in two halves:
--
--  * The OWNER, signed in to the web app, drives `public.tallybook_telegram_ops`
--    (SECURITY DEFINER, session- and owner-checked exactly like the shop RPCs).
--    They mint a short-lived single-use link code, see linked chats, toggle
--    capabilities and unlink. Nothing here trusts a value the browser asserts
--    about who it is; membership is re-checked through `private.shop_member_role`.
--
--  * The BOT, i.e. the `tallybook-telegram` Edge Function holding the service
--    role key, drives the `public.telegram_bot_*` functions (granted to
--    `service_role` only, never to browsers). It never names a business; it
--    passes the Telegram `chat_id` and the function resolves the one shop that
--    chat is bound to and scopes every read to it. The chat earned that binding
--    by redeeming an owner-minted code, so the bot's authority derives from an
--    authenticated owner action, not from the bot itself.
--
-- Tables carry RLS, are force-RLS and have no anon/authenticated grants: browser
-- roles reach them only through the owner RPC, same as every other shop table.
-- Writes to Tallybook from Telegram (`can_record`) default OFF and v1 wires no
-- write path; the flag only gates a scaffold.
--
-- Rollback: supabase/rollback/20261112120000_telegram_bot_down.sql
begin;

-- ------------------------------------------------------------------- tables

-- One row per linked Telegram chat. chat_id is the Telegram chat the bot talks
-- to; a chat is bound to exactly one shop, a shop may have many chats. The
-- linked user and their role are captured at link time from the redeemed code.
create table public.telegram_links (
  chat_id bigint primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'attendant')),
  tg_user_id bigint,
  tg_username text check (tg_username is null or length(tg_username) between 1 and 64),
  status text not null default 'active' check (status in ('active', 'revoked')),
  linked_at timestamptz not null default now(),
  unlinked_at timestamptz,
  check ((status = 'revoked') = (unlinked_at is not null)),
  unique (business_id, chat_id)
);
create index telegram_links_business on public.telegram_links (business_id, status);

-- Per-shop capability flags the owner chooses. The three read/alert capabilities
-- are safe and default on (the owner may still mute them); recording writes back
-- to Tallybook is the one opt-in and defaults off.
create table public.bot_capabilities (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  daily_summary boolean not null default true,
  realtime_alerts boolean not null default true,
  on_demand_queries boolean not null default true,
  can_record boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

-- Short-lived single-use link codes. The plaintext code travels only in the
-- owner's `t.me/<bot>?start=<code>` deep link and is kept here only as a hash,
-- like the shop join codes.
create table public.telegram_link_codes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_sha256 text not null unique check (code_sha256 ~ '^[a-f0-9]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'used', 'revoked')),
  used_at timestamptz,
  used_by_chat_id bigint,
  check ((status = 'used') = (used_at is not null))
);
create index telegram_link_codes_business on public.telegram_link_codes (business_id, created_at desc);

do $$
declare tbl text;
begin
  foreach tbl in array array['telegram_links', 'bot_capabilities', 'telegram_link_codes'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('alter table public.%I force row level security', tbl);
    execute format('revoke all on table public.%I from public, anon, authenticated', tbl);
  end loop;
end $$;

-- ------------------------------------------------------- owner-facing RPC
-- Everything here runs as an authenticated owner through the web app. The
-- session and owner role are verified with the shared `shop_member_role`
-- helper, so these routes grant no authority the shop RPCs would not.
create function private.shop_stage_q_telegram(
  p_action text, p_actor uuid, p_session uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  at_time timestamptz := clock_timestamp();
  v_company uuid;
  v_role text;
  v_code text;
  v_hash text;
  v_id uuid;
  v_n integer;
  v_chat bigint;
  v_key text;
  v_value boolean;
  v_caps public.bot_capabilities;
begin
  if jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'Valid request required' using errcode = '22023';
  end if;
  v_company := private.shop_uuid(p_input, 'companyId');
  v_role := private.shop_member_role(p_actor, p_session, v_company);
  -- Only the owner configures the bot for a shop in v1.
  if v_role <> 'owner' then
    raise exception 'Only the business owner can set up the Telegram bot' using errcode = '42501';
  end if;

  -- Make sure a capability row exists for this shop (safe defaults; writes off).
  insert into public.bot_capabilities (business_id) values (v_company)
    on conflict (business_id) do nothing;

  if p_action = 'createLinkCode' then
    perform 1 from public.businesses where id = v_company for update;
    -- Expire stale pending codes, then cap how many may be open at once.
    update public.telegram_link_codes set status = 'revoked'
      where business_id = v_company and status = 'pending' and expires_at <= at_time;
    select count(*) into v_n from public.telegram_link_codes
      where business_id = v_company and status = 'pending';
    if v_n >= 5 then
      raise exception 'There are already 5 open link codes. Use or cancel one first.' using errcode = '23514';
    end if;
    -- 43-char URL-safe code: Telegram's start payload allows [A-Za-z0-9_-]{1,64}.
    v_code := regexp_replace(
      translate(encode(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()), 'base64'), '+/', '-_'),
      '=', '', 'g');
    v_hash := encode(sha256(convert_to('tallybook-tg-v1:' || v_code, 'UTF8')), 'hex');
    insert into public.telegram_link_codes (business_id, user_id, code_sha256, created_by, expires_at)
      values (v_company, p_actor, v_hash, p_actor, at_time + interval '15 minutes')
      returning id into v_id;
    return jsonb_build_object('codeId', v_id, 'code', v_code,
      'expiresAt', at_time + interval '15 minutes');
  end if;

  if p_action = 'telegramStatus' then
    return jsonb_build_object(
      'companyId', v_company,
      'capabilities', private.telegram_capabilities_json(v_company),
      'links', coalesce((
        select jsonb_agg(jsonb_build_object(
            'chatId', l.chat_id::text, 'role', l.role, 'status', l.status,
            'tgUsername', l.tg_username, 'linkedAt', l.linked_at)
          order by l.linked_at desc)
        from public.telegram_links l
        where l.business_id = v_company and l.status = 'active'), '[]'::jsonb),
      'openCodes', (select count(*) from public.telegram_link_codes
        where business_id = v_company and status = 'pending' and expires_at > at_time));
  end if;

  if p_action = 'setCapability' then
    v_key := p_input->>'key';
    if v_key is null or v_key not in ('daily_summary', 'realtime_alerts', 'on_demand_queries', 'can_record') then
      raise exception 'Invalid key' using errcode = '22023';
    end if;
    if jsonb_typeof(p_input->'value') is distinct from 'boolean' then
      raise exception 'Invalid value' using errcode = '22023';
    end if;
    v_value := (p_input->>'value')::boolean;
    execute format(
      'update public.bot_capabilities set %I = $1, updated_at = $2, updated_by = $3 where business_id = $4',
      v_key) using v_value, at_time, p_actor, v_company;
    return jsonb_build_object('companyId', v_company,
      'capabilities', private.telegram_capabilities_json(v_company));
  end if;

  if p_action = 'unlinkChat' then
    if jsonb_typeof(p_input->'chatId') is distinct from 'string'
       or (p_input->>'chatId') !~ '^-?[0-9]{1,19}$' then
      raise exception 'Invalid chatId' using errcode = '22023';
    end if;
    v_chat := (p_input->>'chatId')::bigint;
    update public.telegram_links set status = 'revoked', unlinked_at = at_time
      where chat_id = v_chat and business_id = v_company and status = 'active';
    if not found then raise exception 'That chat is not linked' using errcode = '23514'; end if;
    return jsonb_build_object('companyId', v_company, 'chatId', v_chat::text, 'unlinked', true);
  end if;

  raise exception 'Unknown Telegram action' using errcode = '22023';
end $fn$;
revoke all on function private.shop_stage_q_telegram(text, uuid, uuid, jsonb) from public, anon, authenticated;

-- Shared read of a shop's capability flags as JSON.
create function private.telegram_capabilities_json(p_company uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'dailySummary', coalesce(c.daily_summary, true),
    'realtimeAlerts', coalesce(c.realtime_alerts, true),
    'onDemandQueries', coalesce(c.on_demand_queries, true),
    'canRecord', coalesce(c.can_record, false))
  from (select 1) one
  left join public.bot_capabilities c on c.business_id = p_company
$$;
revoke all on function private.telegram_capabilities_json(uuid) from public, anon, authenticated;

-- Entrypoint for the web app (its own function, like tallybook_shop_shifts).
create function public.tallybook_telegram_ops(p_action text, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $body$
declare actor uuid := auth.uid(); sid uuid;
begin
  begin sid := (auth.jwt()->>'session_id')::uuid;
  exception when others then sid := null; end;
  return private.shop_stage_q_telegram(p_action, actor, sid, p_input);
end $body$;
revoke all on function public.tallybook_telegram_ops(text, jsonb) from public, anon;
grant execute on function public.tallybook_telegram_ops(text, jsonb) to authenticated;

-- --------------------------------------------------------- bot-facing RPC
-- These run as the service role (the Edge Function). They take a Telegram
-- chat_id and resolve the one shop it is bound to; a browser can never call
-- them. None of them write to the Tallybook ledger.

-- Resolve the active link for a chat, or null. Helper, not granted out.
create function private.telegram_bot_link(p_chat_id bigint) returns public.telegram_links
language sql stable security definer set search_path = '' as $$
  select * from public.telegram_links where chat_id = p_chat_id and status = 'active'
$$;
revoke all on function private.telegram_bot_link(bigint) from public, anon, authenticated;

-- Redeem a one-time code and bind this chat to its shop.
create function public.telegram_bot_begin_link(
  p_chat_id bigint, p_code text, p_tg_user_id bigint, p_tg_username text)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  at_time timestamptz := clock_timestamp();
  v_hash text;
  v_row public.telegram_link_codes;
  v_role text;
  v_bot_role text;
  v_name text;
  v_username text;
begin
  if p_chat_id is null then raise exception 'chat required' using errcode = '22023'; end if;
  if p_code is null or p_code !~ '^[A-Za-z0-9_-]{1,64}$' then
    return jsonb_build_object('linked', false, 'reason', 'invalid');
  end if;
  v_hash := encode(sha256(convert_to('tallybook-tg-v1:' || p_code, 'UTF8')), 'hex');
  select * into v_row from public.telegram_link_codes where code_sha256 = v_hash for update;
  if not found or v_row.status <> 'pending' or v_row.expires_at <= at_time then
    return jsonb_build_object('linked', false, 'reason', 'invalid');
  end if;
  -- The code's user must still be a member; take their current role.
  select m.role into v_role from public.business_members m
    where m.business_id = v_row.business_id and m.user_id = v_row.user_id;
  if v_role is null then
    update public.telegram_link_codes set status = 'revoked' where id = v_row.id;
    return jsonb_build_object('linked', false, 'reason', 'invalid');
  end if;
  -- Map the membership role to the bot's two-tier model so the insert always
  -- satisfies telegram_links' CHECK, whatever the shop role vocabulary grows to
  -- be: only 'owner' keeps full authority; every other non-null role is treated
  -- as an attendant (own sales only, no settings). Never widens privilege.
  v_bot_role := case when v_role = 'owner' then 'owner' else 'attendant' end;
  v_username := nullif(left(regexp_replace(coalesce(p_tg_username, ''), '[^A-Za-z0-9_]', '', 'g'), 64), '');
  update public.telegram_link_codes
    set status = 'used', used_at = at_time, used_by_chat_id = p_chat_id
    where id = v_row.id;
  insert into public.telegram_links (chat_id, business_id, user_id, role, tg_user_id, tg_username, status, linked_at, unlinked_at)
    values (p_chat_id, v_row.business_id, v_row.user_id, v_bot_role, p_tg_user_id, v_username, 'active', at_time, null)
    on conflict (chat_id) do update
      set business_id = excluded.business_id, user_id = excluded.user_id, role = excluded.role,
          tg_user_id = excluded.tg_user_id, tg_username = excluded.tg_username,
          status = 'active', linked_at = at_time, unlinked_at = null;
  insert into public.bot_capabilities (business_id) values (v_row.business_id)
    on conflict (business_id) do nothing;
  select name into v_name from public.businesses where id = v_row.business_id;
  return jsonb_build_object('linked', true, 'businessId', v_row.business_id,
    'businessName', v_name, 'role', v_bot_role,
    'capabilities', private.telegram_capabilities_json(v_row.business_id));
end $fn$;
revoke all on function public.telegram_bot_begin_link(bigint, text, bigint, text) from public, anon, authenticated;
grant execute on function public.telegram_bot_begin_link(bigint, text, bigint, text) to service_role;

-- The link + capabilities for a chat, for greeting and command gating.
create function public.telegram_bot_context(p_chat_id bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare v_link public.telegram_links; v_name text;
begin
  v_link := private.telegram_bot_link(p_chat_id);
  if v_link.chat_id is null then return jsonb_build_object('linked', false); end if;
  select name into v_name from public.businesses where id = v_link.business_id;
  return jsonb_build_object('linked', true, 'businessId', v_link.business_id,
    'businessName', v_name, 'role', v_link.role,
    'capabilities', private.telegram_capabilities_json(v_link.business_id));
end $fn$;
revoke all on function public.telegram_bot_context(bigint) from public, anon, authenticated;
grant execute on function public.telegram_bot_context(bigint) to service_role;

-- Today's sales for the linked shop. Read-only. Owner sees the whole shop; an
-- attendant sees only their own sales, as in the shop's daily report. "Today"
-- is the UTC calendar day, which is local time in Ghana (GMT, no DST).
create function public.telegram_bot_today(p_chat_id bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_link public.telegram_links;
  v_from timestamptz;
  v_to timestamptz;
  v_currency text;
  v_name text;
  v_sales jsonb;
begin
  v_link := private.telegram_bot_link(p_chat_id);
  if v_link.chat_id is null then return jsonb_build_object('linked', false); end if;
  if not coalesce((select on_demand_queries from public.bot_capabilities where business_id = v_link.business_id), true) then
    return jsonb_build_object('linked', true, 'allowed', false, 'reason', 'on_demand_queries_off');
  end if;
  v_from := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  v_to := v_from + interval '1 day';
  select currency into v_currency from public.shop_ledgers where business_id = v_link.business_id;
  select name into v_name from public.businesses where id = v_link.business_id;
  select jsonb_build_object(
      'count', count(*),
      'grossMinor', coalesce(sum(s.total_minor), 0)::text)
    into v_sales
    from public.shop_sales s
    where s.business_id = v_link.business_id
      and (v_link.role = 'owner' or s.cashier_id = v_link.user_id)
      and s.recorded_at >= v_from and s.recorded_at < v_to;
  return jsonb_build_object('linked', true, 'allowed', true,
    'businessName', v_name, 'role', v_link.role, 'currency', v_currency,
    'from', v_from, 'to', v_to, 'sales', v_sales);
end $fn$;
revoke all on function public.telegram_bot_today(bigint) from public, anon, authenticated;
grant execute on function public.telegram_bot_today(bigint) to service_role;

-- Toggle a capability from the bot's /settings. Owner chats only, and only the
-- Telegram user who linked the chat (the owner who redeemed the code) may do it:
-- in a group chat an owner linked, any other member could otherwise tap the
-- inline buttons. p_actor_tg_user_id is callback_query.from.id and must match the
-- tg_user_id captured at link time. The webhook also restricts these toggles to
-- private chats; this is the defence in depth behind it.
create function public.telegram_bot_set_capability(
  p_chat_id bigint, p_key text, p_value boolean, p_actor_tg_user_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_link public.telegram_links;
begin
  v_link := private.telegram_bot_link(p_chat_id);
  if v_link.chat_id is null then return jsonb_build_object('linked', false); end if;
  if v_link.role <> 'owner'
     or p_actor_tg_user_id is null
     or v_link.tg_user_id is distinct from p_actor_tg_user_id then
    return jsonb_build_object('linked', true, 'allowed', false, 'reason', 'owner_only');
  end if;
  if p_key is null or p_key not in ('daily_summary', 'realtime_alerts', 'on_demand_queries', 'can_record')
     or p_value is null then
    raise exception 'Invalid capability' using errcode = '22023';
  end if;
  insert into public.bot_capabilities (business_id) values (v_link.business_id)
    on conflict (business_id) do nothing;
  execute format(
    'update public.bot_capabilities set %I = $1, updated_at = now(), updated_by = $2 where business_id = $3',
    p_key) using p_value, v_link.user_id, v_link.business_id;
  return jsonb_build_object('linked', true, 'allowed', true,
    'capabilities', private.telegram_capabilities_json(v_link.business_id));
end $fn$;
revoke all on function public.telegram_bot_set_capability(bigint, text, boolean, bigint) from public, anon, authenticated;
grant execute on function public.telegram_bot_set_capability(bigint, text, boolean, bigint) to service_role;

-- Unbind a chat (the person typed /stop).
create function public.telegram_bot_unlink(p_chat_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
begin
  update public.telegram_links set status = 'revoked', unlinked_at = clock_timestamp()
    where chat_id = p_chat_id and status = 'active';
  return jsonb_build_object('unlinked', found);
end $fn$;
revoke all on function public.telegram_bot_unlink(bigint) from public, anon, authenticated;
grant execute on function public.telegram_bot_unlink(bigint) to service_role;

commit;
