/**
 * Owner-facing client for the dedicated Tallybook Telegram bot.
 *
 * All calls go through `public.tallybook_telegram_ops`, which is session-bound
 * and owner-checked on the server exactly like the other shop RPCs. The browser
 * never reaches the bot tables directly. The plaintext link code is returned
 * once, by `createLinkCode`, and only its hash is stored.
 */
import { callShop } from "./shopClient";

const RPC = "tallybook_telegram_ops" as const;

/** The per-shop capability flags the owner chooses. Writes (`canRecord`) are off
 *  by default; the read/alert capabilities are on by default. */
export interface BotCapabilities {
  dailySummary: boolean;
  realtimeAlerts: boolean;
  onDemandQueries: boolean;
  canRecord: boolean;
}

export type BotCapabilityKey =
  "daily_summary" | "realtime_alerts" | "on_demand_queries" | "can_record";

export interface TelegramLinkRow {
  chatId: string;
  role: "owner" | "attendant";
  status: "active" | "revoked";
  tgUsername: string | null;
  linkedAt: string;
}

export interface TelegramStatus {
  companyId: string;
  capabilities: BotCapabilities;
  links: TelegramLinkRow[];
  openCodes: number;
}

export interface NewLinkCode {
  codeId: string;
  code: string;
  expiresAt: string;
}

/** Mint a single-use, 15-minute link code for a shop (owner only). */
export const createTelegramLinkCode = (companyId: string) =>
  callShop<NewLinkCode>("createLinkCode", { companyId }, RPC);

/** The deep link the owner opens / shares to bind a chat. */
export const telegramDeepLink = (botUsername: string, code: string) =>
  `https://t.me/${botUsername}?start=${code}`;

/** Linked chats, open-code count and current capabilities for a shop. */
export const getTelegramStatus = (companyId: string) =>
  callShop<TelegramStatus>("telegramStatus", { companyId }, RPC);

/** Toggle one capability for a shop (owner only). */
export const setTelegramCapability = (
  companyId: string,
  key: BotCapabilityKey,
  value: boolean
) =>
  callShop<{ companyId: string; capabilities: BotCapabilities }>(
    "setCapability",
    { companyId, key, value },
    RPC
  );

/** Unlink a specific chat from a shop (owner only). */
export const unlinkTelegramChat = (companyId: string, chatId: string) =>
  callShop<{ companyId: string; chatId: string; unlinked: boolean }>(
    "unlinkChat",
    { companyId, chatId },
    RPC
  );
