# Supabase Edge Function: `tallybook-telegram`

The inbound webhook for Tallybook's **dedicated** Telegram bot (v1). This is a
new bot, separate from any other product's alert bot. It links a Telegram chat
to one shop, lets the owner choose what the bot may do, and answers read-only
queries. It does **not** write to the Tallybook ledger in v1.

> Do not register a live webhook or paste a real bot token as part of reviewing
> this change. The steps below are for the owner to run against their own
> project once the code is merged.

## 1. Create the bot

1. In Telegram, message **@BotFather** → `/newbot`, choose a name and username.
2. Copy the **HTTP API token** it gives you. Treat it like a password.
3. Optional niceties: `/setcommands` with:
   ```
   today - Today's sales
   settings - Choose what the bot can do (owner)
   stop - Unlink this chat
   help - Show commands
   ```

## 2. Secrets (never commit these)

The function reads everything from the environment:

| Variable | Who sets it | Notes |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | you | from @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | you | a random string, 1–256 chars of `A-Z a-z 0-9 _ -` |
| `TELEGRAM_CRON_SECRET` | you | a random string; authenticates the scheduled `/cron` call (only needed for the daily summary push) |
| `SUPABASE_URL` | platform | provided to every function |
| `SUPABASE_SERVICE_ROLE_KEY` | platform | provided to every function; server-only |

Generate the secrets and set the ones of your own:

```bash
openssl rand -hex 32                       # use the output as TELEGRAM_WEBHOOK_SECRET
openssl rand -hex 32                       # and a second one as TELEGRAM_CRON_SECRET
supabase secrets set \
  TELEGRAM_BOT_TOKEN=<token-from-botfather> \
  TELEGRAM_WEBHOOK_SECRET=<the-random-secret> \
  TELEGRAM_CRON_SECRET=<the-other-random-secret> \
  --project-ref <your-project-ref>
```

The service role key is injected by the platform — do not set it yourself and
do not put it in `.env`. The bot token and webhook secret are never logged.

## 3. Deploy

Telegram sends no Supabase JWT, so deploy with JWT verification **off**. The
webhook secret is the authentication instead.

```bash
supabase functions deploy tallybook-telegram --no-verify-jwt --project-ref <your-project-ref>
```

## 4. Register the webhook (with the secret)

Point Telegram at the function and register the **same** secret. Telegram will
send it back in the `X-Telegram-Bot-Api-Secret-Token` header on every delivery;
the function rejects anything that does not match before doing any work.

```bash
curl -s "https://api.telegram.org/bot<token>/setWebhook" \
  -d "url=https://<your-project-ref>.functions.supabase.co/tallybook-telegram" \
  -d "secret_token=<the-random-secret>" \
  -d 'allowed_updates=["message","callback_query"]'
```

Check it with `getWebhookInfo`; to undo, `deleteWebhook`.

## 5. Link a shop

1. The owner signs in to Tallybook on the web and creates a **link code**
   (calls `tallybook_telegram_ops` → `createLinkCode`). The app builds
   `https://t.me/<bot-username>?start=<code>`.
2. Opening that link sends `/start <code>` to the bot, which verifies the code
   (single-use, 15-minute expiry) and binds `chat_id ↔ shop`.
3. The owner uses `/settings` to choose capabilities. Reads and alerts are on by
   default; **recording sales from Telegram is off by default**.

## 6. Scheduled daily summary (optional)

The function's `/cron` route sends each linked chat today's figures once a day,
for shops whose `daily_summary` capability is on. It is **not** called by
Telegram — it has its own `TELEGRAM_CRON_SECRET`. Schedule it with pg_cron +
pg_net (both are Supabase extensions). Run this **once** in the SQL editor,
filling in your own values:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 21:00 UTC = 21:00 in Ghana (GMT); pick a time near your end of day.
select cron.schedule('tallybook-telegram-daily', '0 21 * * *', $$
  select net.http_post(
    url     := 'https://<your-project-ref>.functions.supabase.co/tallybook-telegram/cron',
    headers := jsonb_build_object('X-Tallybook-Cron-Secret', '<the-cron-secret>')
  );
$$);
```

The claim is idempotent per day: it marks each chat sent before replying, with
`for update … skip locked`, so a retried or overlapping run never double-sends
(a chat missed by a failed send simply waits for the next day). The route does
no ledger writes. For production, keep `<the-cron-secret>` in Supabase Vault and
read it in the job rather than inlining it. To stop it:
`select cron.unschedule('tallybook-telegram-daily');`.

> If your project enforces an API key at the Functions gateway, also pass
> `Authorization: Bearer <anon-key>` in the `headers` above.

## Commands

- `/start <code>` — link this chat, or greet if already linked
- `/today` — today's sales for the linked shop (read-only; UTC day = Ghana local)
- `/settings` — owner-only inline toggles for the per-shop capabilities
- `/record …` — **scaffold only** in v1; refuses unless `can_record` is on, and
  even then replies that recording is not available yet (no writes happen)
- `/stop` — unlink this chat
- `/help` — list commands

## Not in v1 (see the PR description)

- Full transactional writes behind `can_record`.
- Real-time alert fan-out (the `realtime_alerts` flag is stored and honoured by
  the RPCs, but no outbound alert job is wired yet). The scheduled **daily
  summary** push *is* wired — see step 6.
