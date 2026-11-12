/**
 * Tallybook Telegram bot — inbound webhook (v1).
 *
 * A NEW dedicated bot for Tallybook shopkeepers, separate from any other
 * product's alert bot. Telegram POSTs updates here. The flow is:
 *   /start <code>  link this chat to a shop with an owner-minted one-time code
 *   /settings      owner toggles what the bot may do (inline keyboard)
 *   /today         today's sales for the linked shop (read-only)
 *   /record ...    scaffold only; gated by the off-by-default `can_record` flag
 *   /stop          unlink this chat
 *
 * Security:
 *  - Every request must carry the exact X-Telegram-Bot-Api-Secret-Token that
 *    was registered with setWebhook. It is checked (constant-time) BEFORE any
 *    parsing or database work; a mismatch is rejected with 401.
 *  - The bot token, webhook secret and service role key come from env only and
 *    are never logged or echoed.
 *  - All data access goes through `telegram_bot_*` RPCs that scope every read to
 *    the one shop a chat is bound to. This function names no business itself.
 *
 * Deploy with verify_jwt=false (Telegram sends no Supabase JWT); the secret
 * token is the authentication. See README.md.
 */
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import {
  sendMessage,
  answerCallbackQuery,
  editMessageText,
  settingsKeyboard,
  settingsText,
  formatMoney,
  escapeHtml,
} from "./telegram.mjs";

const MAX_BODY = 1 << 16; // 64 KiB: a Telegram update is far smaller.

function env(name: string): string {
  return Deno.env.get(name) ?? "";
}

function configured(): boolean {
  return (
    !!env("TELEGRAM_BOT_TOKEN") &&
    !!env("TELEGRAM_WEBHOOK_SECRET") &&
    !!env("SUPABASE_URL") &&
    !!env("SUPABASE_SERVICE_ROLE_KEY")
  );
}

// Length-safe constant-time string compare.
function timingSafeEqual(a: string, b: string): boolean {
  const ta = new TextEncoder().encode(a);
  const tb = new TextEncoder().encode(b);
  if (ta.length !== tb.length) return false;
  let diff = 0;
  for (let i = 0; i < ta.length; i++) diff |= ta[i] ^ tb[i];
  return diff === 0;
}

function serviceClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const HELP =
  "Tallybook bot commands:\n" +
  "/today — today’s sales\n" +
  "/settings — choose what the bot can do (owner)\n" +
  "/stop — unlink this chat\n" +
  "/help — this message";

type Rpc = ReturnType<typeof serviceClient>;

async function handleStart(
  token: string,
  db: Rpc,
  chatId: number,
  from: Record<string, unknown>,
  payload: string
) {
  if (payload) {
    const { data, error } = await db.rpc("telegram_bot_begin_link", {
      p_chat_id: chatId,
      p_code: payload,
      p_tg_user_id: typeof from.id === "number" ? from.id : null,
      p_tg_username: typeof from.username === "string" ? from.username : null,
    });
    if (error || !data) {
      await sendMessage(
        token,
        chatId,
        "Something went wrong. Please try again in a moment."
      );
      return;
    }
    if (!data.linked) {
      await sendMessage(
        token,
        chatId,
        "That link code is invalid, already used or expired. Ask the shop owner for a fresh one from Tallybook."
      );
      return;
    }
    await sendMessage(
      token,
      chatId,
      `✅ Linked to <b>${escapeHtml(data.businessName)}</b> as <b>${escapeHtml(data.role)}</b>.\n\n` +
        "Try /today for today’s sales. " +
        (data.role === "owner"
          ? "Use /settings to choose what the bot can do."
          : "")
    );
    return;
  }
  // No payload: greet based on whether this chat is already linked.
  const { data } = await db.rpc("telegram_bot_context", { p_chat_id: chatId });
  if (data?.linked) {
    await sendMessage(
      token,
      chatId,
      `This chat is linked to <b>${escapeHtml(data.businessName)}</b>.\n\n${HELP}`
    );
  } else {
    await sendMessage(
      token,
      chatId,
      "Welcome to the Tallybook bot. Open Tallybook on the web, create a link code, " +
        "and tap its link to connect this chat to your shop."
    );
  }
}

async function handleToday(token: string, db: Rpc, chatId: number) {
  const { data, error } = await db.rpc("telegram_bot_today", {
    p_chat_id: chatId,
  });
  if (error || !data) {
    await sendMessage(
      token,
      chatId,
      "Could not read your figures right now. Try again shortly."
    );
    return;
  }
  if (!data.linked) {
    await sendMessage(
      token,
      chatId,
      "This chat isn’t linked yet. Use /start with your shop’s link code."
    );
    return;
  }
  if (!data.allowed) {
    await sendMessage(
      token,
      chatId,
      "On-demand queries are turned off for this shop. The owner can turn them on with /settings."
    );
    return;
  }
  const count = Number(data.sales?.count ?? 0);
  const gross = formatMoney(data.currency, data.sales?.grossMinor ?? "0");
  const scope = data.role === "owner" ? "the shop" : "your sales";
  await sendMessage(
    token,
    chatId,
    `<b>${escapeHtml(data.businessName)} — today</b>\n` +
      `Sales (${escapeHtml(scope)}): <b>${count}</b>\n` +
      `Total: <b>${escapeHtml(gross)}</b>`
  );
}

async function handleSettings(token: string, db: Rpc, chatId: number) {
  const { data } = await db.rpc("telegram_bot_context", { p_chat_id: chatId });
  if (!data?.linked) {
    await sendMessage(
      token,
      chatId,
      "This chat isn’t linked yet. Use /start with your shop’s link code."
    );
    return;
  }
  if (data.role !== "owner") {
    await sendMessage(
      token,
      chatId,
      "Only the shop owner can change the bot’s settings."
    );
    return;
  }
  await sendMessage(token, chatId, settingsText(data.businessName), {
    reply_markup: settingsKeyboard(data.capabilities),
  });
}

async function handleRecord(token: string, db: Rpc, chatId: number) {
  // v1 scaffold: recording writes are gated by the off-by-default capability and
  // are not wired yet. This only reports the gate; it never writes.
  const { data } = await db.rpc("telegram_bot_context", { p_chat_id: chatId });
  if (!data?.linked) {
    await sendMessage(
      token,
      chatId,
      "This chat isn’t linked yet. Use /start with your shop’s link code."
    );
    return;
  }
  if (!data.capabilities?.canRecord) {
    await sendMessage(
      token,
      chatId,
      "Recording from Telegram is turned off for this shop. The owner can turn it on with /settings."
    );
    return;
  }
  await sendMessage(
    token,
    chatId,
    "Recording from Telegram is coming soon. It is enabled but not yet available."
  );
}

async function handleStop(token: string, db: Rpc, chatId: number) {
  await db.rpc("telegram_bot_unlink", { p_chat_id: chatId });
  await sendMessage(
    token,
    chatId,
    "This chat is now unlinked. Use /start with a link code to connect again."
  );
}

async function handleMessage(
  token: string,
  db: Rpc,
  message: Record<string, any>
) {
  const chatId = message?.chat?.id;
  if (typeof chatId !== "number") return;
  const text: string =
    typeof message.text === "string" ? message.text.trim() : "";
  const from = (message.from ?? {}) as Record<string, unknown>;
  if (!text.startsWith("/")) {
    await sendMessage(token, chatId, HELP);
    return;
  }
  // "/cmd@BotName payload" -> command, payload
  const [head, ...rest] = text.split(/\s+/);
  const command = head.split("@")[0].toLowerCase();
  const payload = rest.join(" ").trim();
  switch (command) {
    case "/start":
      return handleStart(token, db, chatId, from, payload);
    case "/today":
      return handleToday(token, db, chatId);
    case "/settings":
      return handleSettings(token, db, chatId);
    case "/record":
      return handleRecord(token, db, chatId);
    case "/stop":
      return handleStop(token, db, chatId);
    default:
      await sendMessage(token, chatId, HELP);
  }
}

async function handleCallback(
  token: string,
  db: Rpc,
  callback: Record<string, any>
) {
  const chatId = callback?.message?.chat?.id;
  const messageId = callback?.message?.message_id;
  const callbackId = callback?.id;
  const dataStr: string =
    typeof callback?.data === "string" ? callback.data : "";
  const match =
    /^cap:(daily_summary|realtime_alerts|on_demand_queries|can_record):([01])$/.exec(
      dataStr
    );
  if (typeof chatId !== "number" || !callbackId || !match) {
    if (callbackId) await answerCallbackQuery(token, callbackId);
    return;
  }
  const [, key, target] = match;
  const { data, error } = await db.rpc("telegram_bot_set_capability", {
    p_chat_id: chatId,
    p_key: key,
    p_value: target === "1",
  });
  if (error || !data?.linked) {
    await answerCallbackQuery(token, callbackId, "Could not update.");
    return;
  }
  if (!data.allowed) {
    await answerCallbackQuery(
      token,
      callbackId,
      "Only the owner can change settings."
    );
    return;
  }
  await answerCallbackQuery(token, callbackId, "Updated");
  if (typeof messageId === "number") {
    const { data: ctx } = await db.rpc("telegram_bot_context", {
      p_chat_id: chatId,
    });
    await editMessageText(
      token,
      chatId,
      messageId,
      settingsText(ctx?.businessName ?? ""),
      {
        reply_markup: settingsKeyboard(data.capabilities),
      }
    );
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Not found", { status: 404 });
  if (!configured())
    return new Response("Service unavailable", { status: 503 });

  // Reject anything that is not Telegram-with-our-secret BEFORE any work.
  const presented = req.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
  if (!timingSafeEqual(presented, env("TELEGRAM_WEBHOOK_SECRET"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const length = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_BODY) {
    return new Response("Payload too large", { status: 413 });
  }

  let update: Record<string, any>;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) throw new Error("too large");
    update = JSON.parse(raw);
    if (!update || typeof update !== "object" || Array.isArray(update))
      throw new Error("bad update");
  } catch {
    // Acknowledge so Telegram does not retry a malformed delivery.
    return new Response("ok", { status: 200 });
  }

  const token = env("TELEGRAM_BOT_TOKEN");
  const db = serviceClient();
  try {
    if (update.message) await handleMessage(token, db, update.message);
    else if (update.edited_message)
      await handleMessage(token, db, update.edited_message);
    else if (update.callback_query)
      await handleCallback(token, db, update.callback_query);
  } catch {
    // Never leak internals, and never make Telegram retry-storm: just ack.
  }
  return new Response("ok", { status: 200 });
});
