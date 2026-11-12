// Telegram Bot API helpers for the tallybook-telegram webhook. The bot token is
// read by the caller from an env var and passed in; it is never logged here and
// never leaves these outbound calls to api.telegram.org.

const API = "https://api.telegram.org";

/** Call one Bot API method. Returns the parsed result, or null on any failure
 *  (a reply that cannot be sent must never crash the webhook). */
export async function tgApi(token, method, payload) {
  try {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.ok ? data.result : null;
  } catch {
    return null;
  }
}

/** Outbound message helper used for replies and (later) alerts. */
export function sendMessage(token, chatId, text, extra = {}) {
  return tgApi(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  });
}

export function answerCallbackQuery(token, callbackQueryId, text) {
  return tgApi(token, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

export function editMessageText(token, chatId, messageId, text, extra = {}) {
  return tgApi(token, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  });
}

/** True only for a 1:1 private chat with the bot. Owner actions — every command
 *  and every settings toggle — are honoured only here: in a group an owner
 *  linked, any other member could otherwise drive /settings or tap the inline
 *  capability buttons. 'group', 'supergroup', 'channel' and anything unknown are
 *  refused. Pure; shared by the webhook and its tests. */
export function isPrivateChat(chat) {
  return !!chat && typeof chat === "object" && chat.type === "private";
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** Minor units (e.g. pesewas) to a readable amount. Tallybook money is 2-dp. */
export function formatMoney(currency, minor) {
  const n = Number(minor);
  const safe = Number.isFinite(n) ? n : 0;
  const amount = (safe / 100).toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency || ""} ${amount}`.trim();
}

// The four capabilities, in display order. The three reads/alerts are safe and
// on by default; recording writes back to Tallybook is the opt-in and off.
export const CAPABILITY_LABELS = {
  daily_summary: "Daily summary",
  realtime_alerts: "Real-time alerts",
  on_demand_queries: "On-demand queries",
  can_record: "Record sales from Telegram",
};
const CAP_API_KEY = {
  daily_summary: "dailySummary",
  realtime_alerts: "realtimeAlerts",
  on_demand_queries: "onDemandQueries",
  can_record: "canRecord",
};

/** Inline keyboard of capability toggles. Each button carries the key and the
 *  target value to apply when tapped, so a tap is unambiguous. */
export function settingsKeyboard(capabilities) {
  const rows = Object.keys(CAPABILITY_LABELS).map(key => {
    const on = Boolean(capabilities?.[CAP_API_KEY[key]]);
    const mark = on ? "✅" : "⬜️";
    const target = on ? "0" : "1";
    return [
      {
        text: `${mark} ${CAPABILITY_LABELS[key]}`,
        callback_data: `cap:${key}:${target}`,
      },
    ];
  });
  return { inline_keyboard: rows };
}

export function settingsText(businessName) {
  return (
    `<b>${escapeHtml(businessName)} — bot settings</b>\n\n` +
    "Tap to turn a capability on or off. Reads and alerts are on by default; " +
    "recording sales from Telegram is off until you turn it on."
  );
}
