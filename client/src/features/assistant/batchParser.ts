/**
 * Tallybook Assistant — several transactions in one message.
 *
 * Accepts one request per line (with or without bullets or numbers), or several on one line separated by ";" / "then" /
 * "and sell…". Only sales, stock receipts and customer payments can be batched. A line that isn't understood is reported
 * back to the owner (in `skipped`), never silently dropped.
 */
import { parseCommand } from "./intentParser";
import { CONFIDENCE_HIGH, type BatchItem, type BatchRequest } from "./types";

export const MAX_BATCH_LINES = 20;
const BATCHABLE = ["RECORD_SALE", "RECEIVE_STOCK", "RECORD_CUSTOMER_PAYMENT"] as const;
const BULLET = /^\s*(?:[-•*—–]|\d+[.):]|\[[\sx]\])\s+/;
const COMMAND_VERB = String.raw`(?:sell|sold|receive|received|record|log)`;
const INLINE_SPLIT = new RegExp(
  String.raw`\s*;\s*|\s+then\s+(?=\S)|,\s*(?:and\s+)?(?=${COMMAND_VERB}\b)|\s+and\s+(?=${COMMAND_VERB}\b)|\s+and\s+(?=[A-Za-z][\w'-]*(?:\s+[A-Za-z][\w'-]*)?\s+(?:paid|repaid|settled)\b)`,
  "i",
);

/** Non-empty lines of the owner's original message (newlines intact), with bullets and numbering removed. */
export function requestLines(rawText: string): string[] {
  return rawText.split(/\r?\n/).map((line) => line.replace(BULLET, "").trim()).filter(Boolean);
}

/** The separate requests inside a message: lines first, then any inline separators. */
export function requestSegments(rawText: string): string[] {
  return requestLines(rawText).flatMap((line) => line.split(INLINE_SPLIT).map((part) => part.trim()).filter(Boolean));
}

/**
 * Reads a message as a batch. Returns null unless at least two separate requests were confidently understood as
 * transactions; the caller then handles the message normally (or explains, if it spanned several lines).
 */
export function parseBatch(rawText: string, options?: { now?: Date; /** Rewrites each line before it is read (for example with the owner's saved aliases). */ normalize?: (line: string) => string }): BatchRequest | null {
  const segments = requestSegments(rawText);
  if (segments.length < 2) return null;
  const items: BatchItem[] = [];
  const skipped: string[] = [];
  segments.forEach((text) => {
    const parsed = parseCommand(options?.normalize ? options.normalize(text) : text, { now: options?.now });
    if ((BATCHABLE as readonly string[]).includes(parsed.intent) && parsed.confidence >= CONFIDENCE_HIGH) {
      items.push({ index: items.length, intent: parsed.intent as BatchItem["intent"], entities: parsed.entities, text, status: "pending" });
    } else skipped.push(text);
  });
  return items.length >= 2 ? { kind: "batch", items, skipped } : null;
}
