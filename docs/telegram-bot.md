# Tallybook Telegram bot (v1)

A dedicated Telegram bot that lets a shopkeeper link a chat to their shop, choose
what the bot may do, and read today's figures — all from Telegram. It is a **new,
separate bot**; it is not connected to any other product's alert bot.

v1 is a safe, read-first slice: it proves linking + owner-chosen settings + a
read-only summary, with the write path scaffolded but turned off.

## Architecture

Tallybook on Vercel is a Vite SPA; its backend is PostgreSQL behind
session-checked RPCs plus Supabase Edge Functions. The bot follows that same
split, so there are two trust halves.

1. **Owner, in the web app** → `public.tallybook_telegram_ops(action, input)`
   (its own entrypoint, like `tallybook_shop_shifts`). `SECURITY DEFINER`,
   session-bound and owner-checked through the shared `private.shop_member_role`
   helper. The owner mints a one-time link code, sees linked chats, toggles
   capabilities and unlinks. Actions: `createLinkCode`, `telegramStatus`,
   `setCapability`, `unlinkChat`.

2. **Bot (the Edge Function)** → `public.telegram_bot_*` functions, granted to
   `service_role` only and never to browsers. They take a Telegram `chat_id`,
   resolve the one shop that chat is bound to, and scope every read to it:
   `telegram_bot_begin_link`, `telegram_bot_context`, `telegram_bot_today`,
   `telegram_bot_set_capability`, `telegram_bot_unlink`.

The chat earns its binding only by redeeming a code an authenticated owner
minted, so the bot's authority derives from an owner action, not from itself.

### Account linking

The owner creates a code in the web app; the app builds
`https://t.me/<bot>?start=<code>`. Opening it sends `/start <code>`; the bot
verifies the code (single-use, 15-minute expiry, stored only as a SHA-256 hash,
at most 5 open per shop) and binds `chat_id ↔ shop` with the owner's user and
role. The flow mirrors the existing shop **join codes**. The membership role is
mapped to the bot's two tiers — `owner` keeps full authority; any other non-null
member role becomes `attendant` (own sales only, no settings) — so linking never
fails on a role outside `telegram_links`' `('owner','attendant')` CHECK.

### Owner-chosen capabilities

Per-shop flags in `public.bot_capabilities`:

| Flag | Default | Meaning |
| --- | --- | --- |
| `daily_summary` | **on** | scheduled once-a-day `/today` push (pg_cron → the function's `/cron` route) |
| `realtime_alerts` | **on** | real-time alerts *(flag stored; fan-out is v2)* |
| `on_demand_queries` | **on** | read-only queries like `/today` |
| `can_record` | **off** | record sales/refunds from Telegram *(scaffold only in v1)* |

`/settings` (owner only) shows these as inline-keyboard toggles and can be
reopened anytime. Owner actions — every command and every capability toggle —
are honoured only in a **private chat** with the bot, and `telegram_bot_set_capability`
additionally requires the acting Telegram user (`callback_query.from.id`) to be
the one who linked the chat; so no other member of a chat an owner linked can run
`/settings` or flip a capability. The owner can also toggle them from the web
app's **Team** tab, which has a Telegram bot card (make a link code, see linked
chats, toggle capabilities, unlink) built on `client/src/cloud/telegramClient.ts`. Set
`VITE_TALLYBOOK_TELEGRAM_BOT` (the bot username, no `@`) so that card can show a
one-tap `t.me/<bot>?start=<code>` deep link; without it the card shows the code
and `/start <code>` instructions instead.

## Data

New tables, all with RLS + force-RLS and **no** anon/authenticated grants
(browsers reach them only through the owner RPC):

- `telegram_links` — `chat_id` (PK) ↔ `business_id`, `user_id`, `role`, status,
  and `last_daily_summary_date` (the "summary already sent today" marker).
- `bot_capabilities` — one row per shop; the flags above.
- `telegram_link_codes` — hashed one-time codes, short-lived and single-use.

Migrations: `supabase/migrations/20261112120000_telegram_bot.sql` (tables +
RPCs) and `20261113120000_telegram_daily_summary.sql` (the daily-summary claim
function and marker), each with a matching rollback. Tests:
`qa/telegram-bot.test.mjs`, `qa/telegram-daily-summary.test.mjs`, and the chain
is covered by `qa/migration-rollbacks.test.mjs`.

### Scheduled daily summary

`daily_summary` is delivered by a scheduled job, not the webhook. Once a day
pg_cron (with pg_net) POSTs the function's `/cron` route — authenticated by a
separate `TELEGRAM_CRON_SECRET`, never a Telegram header. The route calls the
service-role `public.telegram_bot_claim_daily_summaries(p_max)`, which atomically
claims the chats whose shop has `daily_summary` on and that have not had today's
summary (`for update … skip locked`, marking each sent first so a retry never
double-sends), and returns each chat's role-scoped `/today` figures; the function
then sends them. Scheduling snippet and the `TELEGRAM_CRON_SECRET` setup are in
the function README (step 6).

## Setup & secrets

Create the bot with **@BotFather**, set `TELEGRAM_BOT_TOKEN` and a random
`TELEGRAM_WEBHOOK_SECRET` as Supabase function secrets (the service role key is
injected by the platform), deploy with `--no-verify-jwt`, then register the
webhook with `setWebhook` including the `secret_token`. The function rejects any
delivery whose `X-Telegram-Bot-Api-Secret-Token` header does not match, before
doing any work. Secrets are env-only and never logged.

Full step-by-step: `supabase/functions/tallybook-telegram/README.md`.

> "Today" is the UTC calendar day, which is local time in Ghana (GMT, no DST).

## Deferred to v2

- Full transactional writes behind `can_record` (v1 only gates a scaffold).
- Real-time alert fan-out (the `realtime_alerts` flag is stored and honoured, but
  no outbound alert job is wired yet). The scheduled daily-summary push *is*
  wired — see above.
- Attendant self-linking and multi-role chats (v1 links are owner-minted).
